import { arg, defineCommand, z } from "@liche/core";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";

const DEFAULT_BUFFER_M = 25;

export type BuildRouteLionLinkInputs = {
  local: OpenLocalPipelineDb;
  bufferMeters?: number | undefined;
  routeIds?: readonly string[] | undefined;
};

export type BuildRouteLionLinkResult = {
  routesProcessed: number;
  totalLinks: number;
  bufferMeters: number;
};

export function runBuildRouteLionLink(
  inputs: BuildRouteLionLinkInputs,
): BuildRouteLionLinkResult {
  const bufferMeters = inputs.bufferMeters ?? DEFAULT_BUFFER_M;
  const bufferDegrees = bufferMeters / 92_000;
  const { local } = inputs;
  const computedAt = new Date().toISOString();

  const routeRowsQuery =
    inputs.routeIds && inputs.routeIds.length > 0
      ? `SELECT DISTINCT route_id FROM local_route_shape_geom WHERE route_id IN (${inputs.routeIds
          .map(() => "?")
          .join(",")})`
      : "SELECT DISTINCT route_id FROM local_route_shape_geom ORDER BY route_id";
  const routeRows = local.sqlite
    .query<{ route_id: string }, string[]>(routeRowsQuery)
    .all(...((inputs.routeIds ?? []) as string[]));

  const insert = local.sqlite.prepare(
    `INSERT INTO local_route_lion_link
       (route_id, physical_id, overlap_meters, buffer_meters, match_kind,
        street_name, borough, computed_at)
     VALUES (?, ?, ?, ?, 'buffered_intersection', ?, ?, ?)
     ON CONFLICT(route_id, physical_id) DO UPDATE SET
       overlap_meters = excluded.overlap_meters,
       buffer_meters = excluded.buffer_meters,
       match_kind = excluded.match_kind,
       street_name = excluded.street_name,
       borough = excluded.borough,
       computed_at = excluded.computed_at`,
  );
  const deleteForRoute = local.sqlite.prepare(
    "DELETE FROM local_route_lion_link WHERE route_id = ?",
  );

  const routeJoinQuery = local.sqlite.prepare(
    `WITH route_buf AS (
       SELECT ST_Buffer(ST_Collect(geom), ?) AS g
         FROM local_route_shape_geom
        WHERE route_id = ?
     )
     SELECT l.physical_id          AS physical_id,
            ST_Length(
              ST_Intersection(rb.g, l.geom),
              1
            )                       AS overlap_meters,
            s.street_name           AS street_name,
            s.borough               AS borough
       FROM local_lion_segment_geom l
       JOIN route_buf rb
       JOIN local_lion_segment s ON s.physical_id = l.physical_id
      WHERE l.ROWID IN (
              SELECT ROWID
                FROM SpatialIndex
               WHERE f_table_name = 'local_lion_segment_geom'
                 AND search_frame = rb.g
            )
        AND ST_Intersects(l.geom, rb.g) = 1`,
  );

  let totalLinks = 0;
  let routesProcessed = 0;

  for (const r of routeRows) {
    const matches = routeJoinQuery.all(bufferDegrees, r.route_id) as Array<{
      physical_id: string;
      overlap_meters: number | null;
      street_name: string | null;
      borough: string | null;
    }>;
    local.sqlite.exec("BEGIN");
    try {
      deleteForRoute.run(r.route_id);
      for (const m of matches) {
        insert.run(
          r.route_id,
          m.physical_id,
          m.overlap_meters ?? 0,
          bufferMeters,
          m.street_name,
          m.borough,
          computedAt,
        );
        totalLinks += 1;
      }
      local.sqlite.exec("COMMIT");
    } catch (err) {
      local.sqlite.exec("ROLLBACK");
      throw err;
    }
    routesProcessed += 1;
  }

  return { routesProcessed, totalLinks, bufferMeters };
}

export default defineCommand({
  path: ["build", "route-lion-link"],
  summary: "Compute the route shape ⇄ LION corridor lookup via buffered intersection.",
  input: {
    options: dbOptions.extend({
      bufferM: arg
        .positiveInt()
        .default(DEFAULT_BUFFER_M)
        .describe("Buffer width in meters"),
      route: z
        .string()
        .optional()
        .describe("Comma-separated route_id allowlist (defaults to all routes)"),
    }),
  },
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    routesProcessed: z.number(),
    totalLinks: z.number(),
    bufferMeters: z.number(),
  }),
  async run({ ctx, input }) {
    const routeIds = input.options.route
      ? input.options.route
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;
    return runBuildRouteLionLink({
      local: localDbFromCtx(ctx),
      bufferMeters: input.options.bufferM,
      routeIds,
    });
  },
});

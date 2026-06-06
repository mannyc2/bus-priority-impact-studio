import type { Database } from "bun:sqlite";

export const defaultRouteLionLinkBufferMeters = 25;

export type BuildRouteLionLinkLocalDb = {
  readonly sqlite: Database;
};

export type BuildRouteLionLinkInputs = {
  local: BuildRouteLionLinkLocalDb;
  bufferMeters?: number | undefined;
  routeIds?: readonly string[] | undefined;
};

export type BuildRouteLionLinkResult = {
  routesProcessed: number;
  totalLinks: number;
  bufferMeters: number;
};

export type RouteLionLinkRouteRowsQuery = {
  sql: string;
  bindings: string[];
};

export function routeLionLinkBufferDegrees(bufferMeters: number): number {
  return bufferMeters / 92_000;
}

export function routeLionLinkRouteRowsQuery(
  routeIds: readonly string[] | undefined,
): RouteLionLinkRouteRowsQuery {
  if (routeIds && routeIds.length > 0) {
    return {
      sql: `SELECT DISTINCT route_id FROM local_route_shape_geom WHERE route_id IN (${routeIds
        .map(() => "?")
        .join(",")})`,
      bindings: [...routeIds],
    };
  }
  return {
    sql: "SELECT DISTINCT route_id FROM local_route_shape_geom ORDER BY route_id",
    bindings: [],
  };
}

export function runBuildRouteLionLink(inputs: BuildRouteLionLinkInputs): BuildRouteLionLinkResult {
  const bufferMeters = inputs.bufferMeters ?? defaultRouteLionLinkBufferMeters;
  const bufferDegrees = routeLionLinkBufferDegrees(bufferMeters);
  const { local } = inputs;
  const computedAt = new Date().toISOString();

  const routeRowsQuery = routeLionLinkRouteRowsQuery(inputs.routeIds);
  const routeRows = local.sqlite
    .query<{ route_id: string }, string[]>(routeRowsQuery.sql)
    .all(...routeRowsQuery.bindings);

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

  for (const route of routeRows) {
    const matches = routeJoinQuery.all(bufferDegrees, route.route_id) as Array<{
      physical_id: string;
      overlap_meters: number | null;
      street_name: string | null;
      borough: string | null;
    }>;
    local.sqlite.exec("BEGIN");
    try {
      deleteForRoute.run(route.route_id);
      for (const match of matches) {
        insert.run(
          route.route_id,
          match.physical_id,
          match.overlap_meters ?? 0,
          bufferMeters,
          match.street_name,
          match.borough,
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

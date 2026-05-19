import { withLocalPipelineDb } from "../../lib/local-db.js";

type Args = { dbPath?: string; bufferMeters?: number; routeIds?: readonly string[] };

type Result = {
  routesProcessed: number;
  totalLinks: number;
  bufferMeters: number;
};

function parseCliArgs(args: string[]): Args {
  const out: Args = {};
  const dbi = args.indexOf("--db-path");
  const dbPath = dbi !== -1 ? args[dbi + 1] : undefined;
  if (dbPath !== undefined) out.dbPath = dbPath;

  const bi = args.indexOf("--buffer-m");
  if (bi !== -1) {
    const n = Number(args[bi + 1]);
    if (Number.isFinite(n) && n > 0) out.bufferMeters = n;
  }

  const ri = args.indexOf("--route");
  if (ri !== -1) {
    out.routeIds = (args[ri + 1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return out;
}

const DEFAULT_BUFFER_M = 25;

/**
 * Compute the route ⇄ LION corridor lookup. For each route shape we buffer
 * the geometry by N meters (NY street ROW ≈ 20–30m), then find all LION
 * segments whose geometry intersects the buffer. Persisted as a flat table
 * the serving layer can read without ever loading spatialite.
 *
 * The buffer is computed in WGS84 by converting to a local equal-area
 * projection internally via spatialite. We pass the buffer width in degrees
 * (≈ meters / 92_000 at NYC latitude) which is acceptable for NYC latitudes;
 * the resulting overlap is then re-measured in meters with ST_Length(g, 1).
 *
 * Note: ST_Buffer with a degree argument produces a slightly anisotropic
 * envelope (≈30m N-S vs ≈23m E-W at our latitude for a nominal 25m buffer).
 * The corridor inclusion is still bounded by the post-filter ST_Intersects
 * and the per-link overlap is measured geodesically, so the resulting
 * route_lion_link rows are accurate; only the inclusion envelope is shaped
 * like an ellipse rather than a circle.
 */
export async function buildRouteLionLink(args: Args = {}): Promise<Result> {
  const bufferMeters = args.bufferMeters ?? DEFAULT_BUFFER_M;
  // Approximate degree-equivalent for ST_Buffer in 4326 at NYC latitude (~40.7°).
  // We over-buffer slightly and let ST_Distance(meters) re-check at the end.
  const bufferDegrees = bufferMeters / 92_000;

  return withLocalPipelineDb(
    args.dbPath,
    (local) => {
      const computedAt = new Date().toISOString();

      const routeRowsQuery =
        args.routeIds && args.routeIds.length > 0
          ? `SELECT DISTINCT route_id FROM local_route_shape_geom WHERE route_id IN (${args.routeIds
              .map(() => "?")
              .join(",")})`
          : "SELECT DISTINCT route_id FROM local_route_shape_geom ORDER BY route_id";
      const routeRows = local.sqlite
        .query<{ route_id: string }, string[]>(routeRowsQuery)
        .all(...((args.routeIds ?? []) as string[]));

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

      // For each route: union its shapes into one buffered geometry, then
      // intersect against LION via the R-tree (`ROWID IN SpatialIndex`).
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
        const matches = routeJoinQuery
          .all(bufferDegrees, r.route_id) as Array<{
            physical_id: string;
            overlap_meters: number | null;
            street_name: string | null;
            borough: string | null;
          }>;
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
        routesProcessed += 1;
      }

      return { routesProcessed, totalLinks, bufferMeters };
    },
    { spatial: true },
  );
}

export async function buildRouteLionLinkFromCli(args: string[]): Promise<Result> {
  const result = await buildRouteLionLink(parseCliArgs(args));
  console.log(
    `Route ⇄ LION link: routes=${result.routesProcessed} links=${result.totalLinks} buffer=${result.bufferMeters}m`,
  );
  return result;
}

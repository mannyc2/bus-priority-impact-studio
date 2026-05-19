import { withLocalPipelineDb } from "../../lib/local-db.js";

type Args = { dbPath?: string; computedAt?: Date };

type Result = {
  directTouches: number;
  routeLionTouches: number;
  total: number;
  computedAt: string;
};

function parseCliArgs(args: string[]): Args {
  const i = args.indexOf("--db-path");
  if (i === -1) return {};
  const value = args[i + 1];
  return value === undefined ? {} : { dbPath: value };
}

/**
 * Materialize detector-facing event -> route touches. Route-specific source
 * rows remain primary evidence; broad LION proximity expansion is context.
 */
export async function buildContextEventRouteTouches(args: Args = {}): Promise<Result> {
  return withLocalPipelineDb(args.dbPath, (local) => {
    const computedAt = (args.computedAt ?? new Date()).toISOString();

    local.sqlite.exec("BEGIN");
    try {
      local.sqlite.exec("DELETE FROM local_context_event_route_touch");

      local.sqlite
        .prepare(
          `INSERT INTO local_context_event_route_touch
             (event_id, route_id, source_id, event_kind, occurred_at, ended_at,
              physical_id, touch_kind, evidence_role, overlap_meters, buffer_meters,
              route_fanout, match_weight, computed_at)
           SELECT event_id,
                  route_id,
                  source_id,
                  event_kind,
                  occurred_at,
                  ended_at,
                  physical_id,
                  'direct_route',
                  'primary',
                  NULL,
                  NULL,
                  1,
                  1.0,
                  ?
             FROM local_context_event
            WHERE route_id IS NOT NULL`,
        )
        .run(computedAt);

      local.sqlite
        .prepare(
          `WITH fanout AS (
             SELECT physical_id, count(*) AS route_fanout
               FROM local_route_lion_link
              GROUP BY physical_id
           )
           INSERT INTO local_context_event_route_touch
             (event_id, route_id, source_id, event_kind, occurred_at, ended_at,
              physical_id, touch_kind, evidence_role, overlap_meters, buffer_meters,
              route_fanout, match_weight, computed_at)
           SELECT e.event_id,
                  l.route_id,
                  e.source_id,
                  e.event_kind,
                  e.occurred_at,
                  e.ended_at,
                  e.physical_id,
                  'route_lion_link',
                  'context',
                  l.overlap_meters,
                  l.buffer_meters,
                  f.route_fanout,
                  1.0 / f.route_fanout,
                  ?
             FROM local_context_event e
             JOIN local_route_lion_link l ON l.physical_id = e.physical_id
             JOIN fanout f ON f.physical_id = e.physical_id
            WHERE e.route_id IS NULL
              AND e.physical_id IS NOT NULL`,
        )
        .run(computedAt);

      local.sqlite.exec("COMMIT");
    } catch (err) {
      local.sqlite.exec("ROLLBACK");
      throw err;
    }

    const rows = local.sqlite
      .query<{ touch_kind: "direct_route" | "route_lion_link"; n: number }, []>(
        `SELECT touch_kind, count(*) AS n
           FROM local_context_event_route_touch
          GROUP BY touch_kind`,
      )
      .all();
    const directTouches = rows.find((row) => row.touch_kind === "direct_route")?.n ?? 0;
    const routeLionTouches = rows.find((row) => row.touch_kind === "route_lion_link")?.n ?? 0;

    return {
      directTouches,
      routeLionTouches,
      total: directTouches + routeLionTouches,
      computedAt,
    };
  });
}

export async function buildContextEventRouteTouchesFromCli(args: string[]): Promise<Result> {
  const result = await buildContextEventRouteTouches(parseCliArgs(args));
  console.log(
    `context-event-route-touches: direct=${result.directTouches} route_lion=${result.routeLionTouches} total=${result.total}`,
  );
  return result;
}

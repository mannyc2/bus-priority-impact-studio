import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";

type Args = { dbPath?: string; computedAt?: Date; artifactRoot?: string; output?: string };

type SourceEventKindAudit = {
  sourceId: string;
  eventKind: string;
  eventCount: number;
  joinableEventCount: number;
  touchedEventCount: number;
  touchCount: number;
  routeCount: number;
  touchRate: number;
};

type Result = {
  directTouches: number;
  routeLionTouches: number;
  total: number;
  computedAt: string;
  auditArtifactPath: string;
  sourceEventKinds: SourceEventKindAudit[];
};

function parseCliArgs(args: string[]): Args {
  const output: Args = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--db-path" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
    } else if (arg === "--artifact-root" && value !== undefined) {
      output.artifactRoot = fromCliPath(value);
      index += 1;
    } else if (arg === "--output" && value !== undefined) {
      output.output = fromCliPath(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
    }
  }
  return output;
}

export function contextEventRouteTouchAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "route-touch-audit.json");
}

/**
 * Materialize detector-facing event -> route touches. Route-specific source
 * rows remain primary evidence; broad LION proximity expansion is context.
 */
export async function buildContextEventRouteTouches(args: Args = {}): Promise<Result> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const auditArtifactPath = args.output ?? contextEventRouteTouchAuditPath(artifactRoot);
  const result = await withLocalPipelineDb(args.dbPath, (local) => {
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
    const sourceEventKinds = local.sqlite
      .query<
        {
          source_id: string;
          event_kind: string;
          event_count: number;
          joinable_event_count: number;
          touched_event_count: number;
          touch_count: number;
          route_count: number;
        },
        []
      >(
        `WITH event_counts AS (
           SELECT source_id,
                  event_kind,
                  count(*) AS event_count,
                  sum(CASE WHEN route_id IS NOT NULL OR physical_id IS NOT NULL THEN 1 ELSE 0 END)
                    AS joinable_event_count
             FROM local_context_event
            GROUP BY source_id, event_kind
         ),
         touch_counts AS (
           SELECT source_id,
                  event_kind,
                  count(DISTINCT event_id) AS touched_event_count,
                  count(*) AS touch_count,
                  count(DISTINCT route_id) AS route_count
             FROM local_context_event_route_touch
            GROUP BY source_id, event_kind
         )
         SELECT event_counts.source_id,
                event_counts.event_kind,
                event_counts.event_count,
                event_counts.joinable_event_count,
                coalesce(touch_counts.touched_event_count, 0) AS touched_event_count,
                coalesce(touch_counts.touch_count, 0) AS touch_count,
                coalesce(touch_counts.route_count, 0) AS route_count
           FROM event_counts
           LEFT JOIN touch_counts
             ON touch_counts.source_id = event_counts.source_id
            AND touch_counts.event_kind = event_counts.event_kind
          ORDER BY touch_count DESC, event_counts.source_id, event_counts.event_kind`,
      )
      .all()
      .map((row) => ({
        sourceId: row.source_id,
        eventKind: row.event_kind,
        eventCount: row.event_count,
        joinableEventCount: row.joinable_event_count,
        touchedEventCount: row.touched_event_count,
        touchCount: row.touch_count,
        routeCount: row.route_count,
        touchRate:
          row.joinable_event_count === 0 ? 0 : row.touched_event_count / row.joinable_event_count,
      }));

    return {
      directTouches,
      routeLionTouches,
      total: directTouches + routeLionTouches,
      computedAt,
      auditArtifactPath,
      sourceEventKinds,
    };
  });

  await mkdir(dirname(auditArtifactPath), { recursive: true });
  await writeJson(auditArtifactPath, {
    artifactKind: "context_event_route_touch_audit",
    schemaVersion: 1,
    generatedAt: result.computedAt,
    summary: {
      directTouches: result.directTouches,
      routeLionTouches: result.routeLionTouches,
      totalTouches: result.total,
      sourceEventKindCount: result.sourceEventKinds.length,
    },
    sourceEventKinds: result.sourceEventKinds,
  });

  return result;
}

export async function buildContextEventRouteTouchesFromCli(args: string[]): Promise<Result> {
  const result = await buildContextEventRouteTouches(parseCliArgs(args));
  console.log(
    `context-event-route-touches: direct=${result.directTouches} route_lion=${result.routeLionTouches} total=${result.total} audit=${result.auditArtifactPath}`,
  );
  return result;
}

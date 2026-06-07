import type { Database } from "bun:sqlite";
import { routeLionLinkFanoutCte } from "./route-lion-link-fanout";

export type ContextEventRouteTouchKind =
  | "direct_route"
  | "route_lion_link"
  | "parking_location_match";

export type SourceEventKindAudit = {
  sourceId: string;
  eventKind: string;
  eventCount: number;
  joinableEventCount: number;
  touchedEventCount: number;
  touchCount: number;
  routeCount: number;
  touchRate: number;
};

export type ContextEventRouteTouchAuditSummary = {
  directTouches: number;
  routeLionTouches: number;
  parkingLocationTouches: number;
  total: number;
  sourceEventKinds: SourceEventKindAudit[];
};

type TouchKindCountRow = {
  touch_kind: ContextEventRouteTouchKind;
  n: number;
};

type SourceEventKindAuditRow = {
  source_id: string;
  event_kind: string;
  event_count: number;
  joinable_event_count: number;
  touched_event_count: number;
  touch_count: number;
  route_count: number;
};

export function materializeContextEventRouteTouches(input: {
  readonly sqlite: Database;
  readonly computedAt: string;
}): void {
  input.sqlite.exec("BEGIN");
  try {
    input.sqlite.exec("DELETE FROM local_context_event_route_touch");

    input.sqlite
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
      .run(input.computedAt);

    input.sqlite
      .prepare(
        `WITH ${routeLionLinkFanoutCte()}
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
      .run(input.computedAt);

    input.sqlite
      .prepare(
        `INSERT OR IGNORE INTO local_context_event_route_touch
           (event_id, route_id, source_id, event_kind, occurred_at, ended_at,
            physical_id, touch_kind, evidence_role, overlap_meters, buffer_meters,
            route_fanout, match_weight, computed_at)
         SELECT e.event_id,
                m.route_id,
                e.source_id,
                e.event_kind,
                e.occurred_at,
                e.ended_at,
                CASE
                  WHEN count(DISTINCT m.physical_id) = 1 THEN min(m.physical_id)
                  ELSE NULL
                END AS physical_id,
                'parking_location_match',
                'context',
                NULL,
                NULL,
                max(m.candidate_count),
                min(1.0, sum(m.match_weight)),
                ?
           FROM local_context_event e
           JOIN local_parking_violation p ON p.summons_number = e.source_row_id
           JOIN local_parking_violation_match m ON m.location_key = p.match_location_key
          WHERE e.event_kind = 'parking_violation'
            AND p.match_location_key IS NOT NULL
          GROUP BY e.event_id, m.route_id`,
      )
      .run(input.computedAt);

    input.sqlite.exec("COMMIT");
  } catch (err) {
    input.sqlite.exec("ROLLBACK");
    throw err;
  }
}

export function auditContextEventRouteTouches(
  sqlite: Database,
): ContextEventRouteTouchAuditSummary {
  const rows = sqlite
    .query<TouchKindCountRow, []>(
      `SELECT touch_kind, count(*) AS n
         FROM local_context_event_route_touch
        GROUP BY touch_kind`,
    )
    .all();
  const directTouches = rows.find((row) => row.touch_kind === "direct_route")?.n ?? 0;
  const routeLionTouches = rows.find((row) => row.touch_kind === "route_lion_link")?.n ?? 0;
  const parkingLocationTouches =
    rows.find((row) => row.touch_kind === "parking_location_match")?.n ?? 0;
  const sourceEventKinds = sqlite
    .query<SourceEventKindAuditRow, []>(
      `WITH parking_match_keys AS (
         SELECT DISTINCT location_key
           FROM local_parking_violation_match
       ),
       event_counts AS (
         SELECT e.source_id,
                e.event_kind,
                count(*) AS event_count,
                sum(CASE
                      WHEN e.route_id IS NOT NULL OR e.physical_id IS NOT NULL THEN 1
                      WHEN pm.location_key IS NOT NULL THEN 1
                      ELSE 0
                    END)
                  AS joinable_event_count
           FROM local_context_event e
           LEFT JOIN local_parking_violation p
             ON p.summons_number = e.source_row_id
            AND e.event_kind = 'parking_violation'
           LEFT JOIN parking_match_keys pm ON pm.location_key = p.match_location_key
          GROUP BY e.source_id, e.event_kind
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
    parkingLocationTouches,
    total: directTouches + routeLionTouches + parkingLocationTouches,
    sourceEventKinds,
  };
}

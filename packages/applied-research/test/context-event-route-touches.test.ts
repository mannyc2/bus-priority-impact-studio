import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { contextEventRouteTouchAuditPath } from "../src/artifacts";
import {
  auditContextEventRouteTouches,
  materializeContextEventRouteTouches,
} from "../src/local-db";

describe("context event route touches local DB", () => {
  test("materializes direct, LION, and parking-match route touches", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_context_event (
          event_id TEXT NOT NULL,
          route_id TEXT,
          source_id TEXT NOT NULL,
          event_kind TEXT NOT NULL,
          occurred_at TEXT,
          ended_at TEXT,
          physical_id TEXT,
          source_row_id TEXT
        );
        CREATE TABLE local_route_lion_link (
          physical_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          overlap_meters REAL,
          buffer_meters REAL,
          borough TEXT
        );
        CREATE TABLE local_parking_violation (
          summons_number TEXT NOT NULL,
          match_location_key TEXT
        );
        CREATE TABLE local_parking_violation_match (
          location_key TEXT NOT NULL,
          route_id TEXT NOT NULL,
          physical_id TEXT,
          candidate_count INTEGER NOT NULL,
          match_weight REAL NOT NULL
        );
        CREATE TABLE local_context_event_route_touch (
          event_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          source_id TEXT NOT NULL,
          event_kind TEXT NOT NULL,
          occurred_at TEXT,
          ended_at TEXT,
          physical_id TEXT,
          touch_kind TEXT NOT NULL,
          evidence_role TEXT NOT NULL,
          overlap_meters REAL,
          buffer_meters REAL,
          route_fanout INTEGER NOT NULL,
          match_weight REAL NOT NULL,
          segment_borough TEXT,
          route_length_meters REAL,
          route_overlap_share REAL,
          join_confidence TEXT,
          join_confidence_reason TEXT,
          computed_at TEXT NOT NULL,
          UNIQUE (event_id, route_id, touch_kind)
        );

        INSERT INTO local_context_event VALUES
          ('evt-direct', 'M15', 'manual_events', 'street_project', '2026-03-01', NULL, NULL, NULL),
          ('evt-lion', NULL, 'dot_permits', 'street_permit', '2026-03-02', NULL, '100', NULL),
          ('evt-parking', NULL, 'parking', 'parking_violation', '2026-03-03', NULL, NULL, 'summons-1'),
          ('evt-unmatched', NULL, 'parking', 'parking_violation', '2026-03-04', NULL, NULL, 'summons-2');

        INSERT INTO local_route_lion_link VALUES
          ('100', 'M15', 42.5, 20, 'Manhattan'),
          ('100', 'M101', 21.5, 20, 'Manhattan'),
          ('500', 'Q44', 30, 20, 'Queens'),
          ('501', 'Q44', 70, 20, 'Queens');

        INSERT INTO local_parking_violation VALUES
          ('summons-1', 'loc-1'),
          ('summons-2', NULL);

        INSERT INTO local_parking_violation_match VALUES
          ('loc-1', 'Q44', '500', 2, 0.6),
          ('loc-1', 'Q44', '501', 2, 0.4);
      `);

      materializeContextEventRouteTouches({
        sqlite,
        computedAt: "2026-06-06T00:00:00.000Z",
      });

      const audit = auditContextEventRouteTouches(sqlite);

      expect(audit).toMatchObject({
        directTouches: 1,
        routeLionTouches: 2,
        parkingLocationTouches: 1,
        total: 4,
      });
      expect(
        audit.sourceEventKinds.map((source) => [
          source.sourceId,
          source.eventKind,
          source.eventCount,
          source.joinableEventCount,
          source.touchedEventCount,
          source.touchCount,
          source.routeCount,
        ]),
      ).toEqual([
        ["dot_permits", "street_permit", 1, 1, 1, 2, 2],
        ["manual_events", "street_project", 1, 1, 1, 1, 1],
        ["parking", "parking_violation", 2, 1, 1, 1, 1],
      ]);
      expect(
        sqlite
          .query<{ computed_at: string }, []>(
            "SELECT DISTINCT computed_at FROM local_context_event_route_touch",
          )
          .all(),
      ).toEqual([{ computed_at: "2026-06-06T00:00:00.000Z" }]);
      expect(
        sqlite
          .query<
            {
              event_id: string;
              route_id: string;
              touch_kind: string;
              segment_borough: string | null;
              route_length_meters: number | null;
              route_overlap_share: number | null;
              join_confidence: string | null;
              join_confidence_reason: string | null;
            },
            []
          >(
            `SELECT event_id, route_id, touch_kind, segment_borough, route_length_meters,
                    route_overlap_share, join_confidence, join_confidence_reason
               FROM local_context_event_route_touch
              ORDER BY event_id, route_id`,
          )
          .all(),
      ).toEqual([
        {
          event_id: "evt-direct",
          route_id: "M15",
          touch_kind: "direct_route",
          segment_borough: null,
          route_length_meters: 42.5,
          route_overlap_share: null,
          join_confidence: "high",
          join_confidence_reason: "direct_route_key",
        },
        {
          event_id: "evt-lion",
          route_id: "M101",
          touch_kind: "route_lion_link",
          segment_borough: "Manhattan",
          route_length_meters: 21.5,
          route_overlap_share: 1,
          join_confidence: "high",
          join_confidence_reason: "route_lion_link:fanout=2;overlap_meters=21.500",
        },
        {
          event_id: "evt-lion",
          route_id: "M15",
          touch_kind: "route_lion_link",
          segment_borough: "Manhattan",
          route_length_meters: 42.5,
          route_overlap_share: 1,
          join_confidence: "high",
          join_confidence_reason: "route_lion_link:fanout=2;overlap_meters=42.500",
        },
        {
          event_id: "evt-parking",
          route_id: "Q44",
          touch_kind: "parking_location_match",
          segment_borough: "Queens",
          route_length_meters: 100,
          route_overlap_share: 1,
          join_confidence: "high",
          join_confidence_reason: "parking_location_match:candidates=2;match_weight=1.000",
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("owns the context event route touch audit path", () => {
    expect(contextEventRouteTouchAuditPath("data/artifacts")).toBe(
      "data/artifacts/context-events/route-touch-audit.json",
    );
  });
});

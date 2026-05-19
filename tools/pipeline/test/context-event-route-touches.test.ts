import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildContextEventRouteTouches } from "../src/jobs/build/build-context-event-route-touches.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const dbPath = fromRepoRoot(join("data/working/test-context-event-route-touches/pipeline.sqlite"));

type SqlValue = string | number | null;

async function resetDb(): Promise<void> {
  await rm(dirname(dbPath), { recursive: true, force: true });
}

function insertContextEvent(sqlite: Database, row: Record<string, SqlValue>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO local_context_event (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

function insertRouteLionLink(sqlite: Database, row: Record<string, SqlValue>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO local_route_lion_link (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

afterEach(async () => {
  await resetDb();
});

describe("context event route touch build", () => {
  test("materializes direct route touches and route-LION context touches", async () => {
    await resetDb();
    const local = await openLocalPipelineDb(dbPath);
    try {
      insertContextEvent(local.sqlite, {
        event_id: "direct",
        source_id: "nyc_mta_ace_violations",
        source_row_id: "2026-03-M1",
        event_kind: "ace_violation_aggregate",
        occurred_at: "2026-03-01T00:00:00",
        ended_at: null,
        physical_id: null,
        lat: null,
        lng: null,
        route_id: "M1",
        payload_json: "{}",
        ingested_at: "2026-05-19T00:00:00.000Z",
      });
      insertContextEvent(local.sqlite, {
        event_id: "direct-with-physical",
        source_id: "fixture_route_source",
        source_row_id: "route-physical",
        event_kind: "route_keyed_event",
        occurred_at: "2026-03-02T00:00:00",
        ended_at: null,
        physical_id: "p1",
        lat: null,
        lng: null,
        route_id: "M3",
        payload_json: "{}",
        ingested_at: "2026-05-19T00:00:00.000Z",
      });
      insertContextEvent(local.sqlite, {
        event_id: "physical",
        source_id: "nyc_dot_street_construction_permits",
        source_row_id: "permit-1",
        event_kind: "permit",
        occurred_at: "2026-03-03T00:00:00",
        ended_at: "2026-03-04T00:00:00",
        physical_id: "p1",
        lat: null,
        lng: null,
        route_id: null,
        payload_json: "{}",
        ingested_at: "2026-05-19T00:00:00.000Z",
      });
      insertContextEvent(local.sqlite, {
        event_id: "unmatched",
        source_id: "nyc_311_service_requests_current",
        source_row_id: "311-1",
        event_kind: "311_complaint",
        occurred_at: "2026-03-05T00:00:00",
        ended_at: null,
        physical_id: "p2",
        lat: null,
        lng: null,
        route_id: null,
        payload_json: "{}",
        ingested_at: "2026-05-19T00:00:00.000Z",
      });
      insertRouteLionLink(local.sqlite, {
        route_id: "M1",
        physical_id: "p1",
        overlap_meters: 10,
        buffer_meters: 25,
        match_kind: "buffered_intersection",
        street_name: "Main St",
        borough: "Manhattan",
        computed_at: "2026-05-18T00:00:00.000Z",
      });
      insertRouteLionLink(local.sqlite, {
        route_id: "M2",
        physical_id: "p1",
        overlap_meters: 20,
        buffer_meters: 25,
        match_kind: "buffered_intersection",
        street_name: "Main St",
        borough: "Manhattan",
        computed_at: "2026-05-18T00:00:00.000Z",
      });
    } finally {
      local.sqlite.close();
    }

    const result = await buildContextEventRouteTouches({
      dbPath,
      computedAt: new Date("2026-05-19T12:00:00.000Z"),
    });

    const sqlite = new Database(dbPath, { readonly: true });
    try {
      const rows = sqlite
        .query<
          {
            event_id: string;
            route_id: string;
            touch_kind: string;
            evidence_role: string;
            route_fanout: number;
            match_weight: number;
            overlap_meters: number | null;
          },
          []
        >(
          `SELECT event_id, route_id, touch_kind, evidence_role, route_fanout,
                  match_weight, overlap_meters
             FROM local_context_event_route_touch
            ORDER BY event_id, route_id`,
        )
        .all();

      expect(result).toEqual({
        directTouches: 2,
        routeLionTouches: 2,
        total: 4,
        computedAt: "2026-05-19T12:00:00.000Z",
      });
      expect(rows).toEqual([
        {
          event_id: "direct",
          route_id: "M1",
          touch_kind: "direct_route",
          evidence_role: "primary",
          route_fanout: 1,
          match_weight: 1,
          overlap_meters: null,
        },
        {
          event_id: "direct-with-physical",
          route_id: "M3",
          touch_kind: "direct_route",
          evidence_role: "primary",
          route_fanout: 1,
          match_weight: 1,
          overlap_meters: null,
        },
        {
          event_id: "physical",
          route_id: "M1",
          touch_kind: "route_lion_link",
          evidence_role: "context",
          route_fanout: 2,
          match_weight: 0.5,
          overlap_meters: 10,
        },
        {
          event_id: "physical",
          route_id: "M2",
          touch_kind: "route_lion_link",
          evidence_role: "context",
          route_fanout: 2,
          match_weight: 0.5,
          overlap_meters: 20,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });
});

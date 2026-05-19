import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { createLocalPipelineDb } from "../src/local/client.js";
import { type LocalPipelineDb, listContextEventRouteTouchesForWindow } from "../src/local/index.js";

async function createLocalTestDb(): Promise<{ db: LocalPipelineDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationsDir = new URL("../migrations/local/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    sqlite.exec(await Bun.file(new URL(filename, migrationsDir)).text());
  }

  return {
    db: createLocalPipelineDb(sqlite),
    sqlite,
  };
}

type SqlValue = string | number | null;

function insertRouteTouch(sqlite: Database, row: Record<string, SqlValue>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO local_context_event_route_touch (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

describe("local findings repository", () => {
  test("lists route touches overlapping a detector window", async () => {
    const local = await createLocalTestDb();
    try {
      insertRouteTouch(local.sqlite, {
        event_id: "before-overlap",
        route_id: "M1",
        source_id: "fixture",
        event_kind: "permit",
        occurred_at: "2026-02-28T00:00:00",
        ended_at: "2026-03-02T00:00:00",
        physical_id: "p1",
        touch_kind: "route_lion_link",
        evidence_role: "context",
        overlap_meters: 12,
        buffer_meters: 25,
        route_fanout: 2,
        match_weight: 0.5,
        computed_at: "2026-05-19T00:00:00.000Z",
      });
      insertRouteTouch(local.sqlite, {
        event_id: "inside-window",
        route_id: "M1",
        source_id: "fixture",
        event_kind: "ace_violation_aggregate",
        occurred_at: "2026-03-15T00:00:00",
        ended_at: null,
        physical_id: null,
        touch_kind: "direct_route",
        evidence_role: "primary",
        overlap_meters: null,
        buffer_meters: null,
        route_fanout: 1,
        match_weight: 1,
        computed_at: "2026-05-19T00:00:00.000Z",
      });
      insertRouteTouch(local.sqlite, {
        event_id: "other-route",
        route_id: "M2",
        source_id: "fixture",
        event_kind: "permit",
        occurred_at: "2026-03-15T00:00:00",
        ended_at: null,
        physical_id: "p1",
        touch_kind: "route_lion_link",
        evidence_role: "context",
        overlap_meters: 8,
        buffer_meters: 25,
        route_fanout: 2,
        match_weight: 0.5,
        computed_at: "2026-05-19T00:00:00.000Z",
      });
      insertRouteTouch(local.sqlite, {
        event_id: "after-window",
        route_id: "M1",
        source_id: "fixture",
        event_kind: "permit",
        occurred_at: "2026-04-02T00:00:00",
        ended_at: null,
        physical_id: "p2",
        touch_kind: "route_lion_link",
        evidence_role: "context",
        overlap_meters: 8,
        buffer_meters: 25,
        route_fanout: 1,
        match_weight: 1,
        computed_at: "2026-05-19T00:00:00.000Z",
      });

      const touches = await listContextEventRouteTouchesForWindow(local.db, {
        routeId: "M1",
        windowStart: "2026-03-01T00:00:00",
        windowEnd: "2026-04-01T00:00:00",
      });

      expect(touches.map((touch) => touch.eventId)).toEqual(["before-overlap", "inside-window"]);
      expect(touches[0]).toEqual(
        expect.objectContaining({
          evidenceRole: "context",
          matchWeight: 0.5,
          routeFanout: 2,
          touchKind: "route_lion_link",
        }),
      );
      expect(touches[1]).toEqual(
        expect.objectContaining({
          evidenceRole: "primary",
          matchWeight: 1,
          routeFanout: 1,
          touchKind: "direct_route",
        }),
      );
    } finally {
      local.sqlite.close();
    }
  });

  test("filters route touches by event kind and evidence role", async () => {
    const local = await createLocalTestDb();
    try {
      insertRouteTouch(local.sqlite, {
        event_id: "primary",
        route_id: "M1",
        source_id: "fixture",
        event_kind: "ace_violation_aggregate",
        occurred_at: "2026-03-01T00:00:00",
        ended_at: null,
        physical_id: null,
        touch_kind: "direct_route",
        evidence_role: "primary",
        overlap_meters: null,
        buffer_meters: null,
        route_fanout: 1,
        match_weight: 1,
        computed_at: "2026-05-19T00:00:00.000Z",
      });
      insertRouteTouch(local.sqlite, {
        event_id: "context",
        route_id: "M1",
        source_id: "fixture",
        event_kind: "permit",
        occurred_at: "2026-03-01T00:00:00",
        ended_at: null,
        physical_id: "p1",
        touch_kind: "route_lion_link",
        evidence_role: "context",
        overlap_meters: 12,
        buffer_meters: 25,
        route_fanout: 3,
        match_weight: 1 / 3,
        computed_at: "2026-05-19T00:00:00.000Z",
      });

      const touches = await listContextEventRouteTouchesForWindow(local.db, {
        windowStart: "2026-03-01T00:00:00",
        windowEnd: "2026-04-01T00:00:00",
        eventKinds: ["permit"],
        evidenceRoles: ["context"],
      });

      expect(touches.map((touch) => touch.eventId)).toEqual(["context"]);
    } finally {
      local.sqlite.close();
    }
  });
});

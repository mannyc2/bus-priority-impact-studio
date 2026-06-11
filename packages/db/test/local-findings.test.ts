import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  insertCoverageAudit,
  insertCoverageAuditIgnore,
  listContextEventRouteTouchesForWindow,
  replaceFindingRun,
  replaceFindingsForMonth,
  type LocalFindingCoverageAudit,
} from "../src/local/index.js";
import { createTestLocalDb } from "./local-test-db.js";

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

function coverageRow(input: Partial<LocalFindingCoverageAudit> = {}): LocalFindingCoverageAudit {
  return {
    auditId: input.auditId ?? "audit-1",
    detectorRunId: input.detectorRunId ?? "run-1",
    detectorId: input.detectorId ?? "detector-1",
    month: input.month ?? "2026-03",
    scopeKind: input.scopeKind ?? "route",
    scopeId: input.scopeId ?? "M1",
    outcome: input.outcome ?? "clean_no_hit",
    reasonCode: input.reasonCode ?? null,
    reason: input.reason ?? null,
    inputsSeenJson: input.inputsSeenJson ?? "{}",
    inputsExpectedJson: input.inputsExpectedJson ?? "{}",
    createdAt: input.createdAt ?? "2026-06-07T00:00:00.000Z",
  };
}

function coverageCount(sqlite: Database): number {
  const row = sqlite
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM local_finding_coverage_audit")
    .get();
  return row?.count ?? 0;
}

describe("local findings repository", () => {
  test("lists route touches overlapping a detector window", async () => {
    const local = createTestLocalDb();
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
    const local = createTestLocalDb();
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

  test("rejects malformed coverage audit JSON before insert", async () => {
    const local = createTestLocalDb();
    try {
      await expect(
        insertCoverageAudit(local.db, [
          coverageRow({
            auditId: "bad-json",
            inputsSeenJson: "{not json",
          }),
        ]),
      ).rejects.toThrow("Invalid inputsSeenJson JSON for coverage audit bad-json");
      expect(coverageCount(local.sqlite)).toBe(0);
    } finally {
      local.sqlite.close();
    }
  });

  test("insert ignore validates coverage audit JSON and preserves existing rows", async () => {
    const local = createTestLocalDb();
    try {
      await insertCoverageAuditIgnore(local.db, [coverageRow({ auditId: "duplicate" })]);
      await insertCoverageAuditIgnore(local.db, [coverageRow({ auditId: "duplicate" })]);
      expect(coverageCount(local.sqlite)).toBe(1);

      await expect(
        insertCoverageAuditIgnore(local.db, [
          coverageRow({
            auditId: "bad-ignore-json",
            inputsExpectedJson: "{broken",
          }),
        ]),
      ).rejects.toThrow("Invalid inputsExpectedJson JSON for coverage audit bad-ignore-json");
      expect(coverageCount(local.sqlite)).toBe(1);
    } finally {
      local.sqlite.close();
    }
  });

  test("validates coverage audit JSON before replacing existing month rows", async () => {
    const local = createTestLocalDb();
    try {
      await insertCoverageAudit(local.db, [coverageRow({ auditId: "existing" })]);
      expect(coverageCount(local.sqlite)).toBe(1);

      expect(() =>
        replaceFindingsForMonth(local.db, {
          month: "2026-03",
          detectorId: "detector-1",
          candidates: [],
          evidence: [],
          coverage: [
            coverageRow({
              auditId: "bad-expected-json",
              inputsExpectedJson: "{nope",
            }),
          ],
        }),
      ).toThrow("Invalid inputsExpectedJson JSON for coverage audit bad-expected-json");

      expect(coverageCount(local.sqlite)).toBe(1);
    } finally {
      local.sqlite.close();
    }
  });

  test("validates coverage audit JSON before replacing run-scoped rows", async () => {
    const local = createTestLocalDb();
    try {
      await insertCoverageAudit(local.db, [
        coverageRow({ auditId: "existing-run", detectorRunId: "run-1" }),
      ]);
      expect(coverageCount(local.sqlite)).toBe(1);

      expect(() =>
        replaceFindingRun(local.db, {
          detectorRunId: "run-1",
          candidates: [],
          evidence: [],
          coverage: [
            coverageRow({
              auditId: "bad-run-json",
              detectorRunId: "run-1",
              inputsSeenJson: "[",
            }),
          ],
        }),
      ).toThrow("Invalid inputsSeenJson JSON for coverage audit bad-run-json");

      expect(coverageCount(local.sqlite)).toBe(1);
    } finally {
      local.sqlite.close();
    }
  });
});

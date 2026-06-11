import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildPersistentSpeedSegmentCoverageRepairs } from "../src/evaluation";
import { loadPersistentSpeedSegmentCoverageRepairLocalDbRows } from "../src/local-db";

describe("persistent speed coverage repair", () => {
  test("builds exact segment-scope hit coverage rows for missing persistent-speed candidates", () => {
    const repairs = buildPersistentSpeedSegmentCoverageRepairs({
      generatedAt: "2026-06-01T00:00:00.000Z",
      rows: [
        {
          candidate_id: "candidate-1",
          detector_run_id: "persistent-speed-run",
          detector_id: "persistent_speed_hotspot",
          month: "2026-03",
          scope_kind: "segment",
          scope_id: "M15:0:1",
          route_id: "M15",
          evidence_ref: '{"weightedAverageSpeedMph":5.2}',
          created_at: "2026-05-20T12:00:00.000Z",
        },
      ],
    });

    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.detectorId as string).toBe("persistent_speed_hotspot");
    expect(repairs[0]?.scopeKind as string).toBe("segment");
    expect(repairs[0]?.scopeId).toBe("M15:0:1");
    expect(repairs[0]?.outcome as string).toBe("hit");
    expect(JSON.parse(repairs[0]?.inputsExpectedJson ?? "{}")).toEqual({
      scopeKind: "segment",
      detectorCandidate: "persistent_speed_hotspot",
      exactScopeCoverageRequired: true,
    });
    expect(JSON.parse(repairs[0]?.inputsSeenJson ?? "{}")).toMatchObject({
      candidateId: "candidate-1",
      routeId: "M15",
      repairedFrom: "local_finding_candidate",
      primaryEvidence: { weightedAverageSpeedMph: 5.2 },
    });
  });

  test("skips malformed and non-segment rows", () => {
    const repairs = buildPersistentSpeedSegmentCoverageRepairs({
      generatedAt: "2026-06-01T00:00:00.000Z",
      rows: [
        {
          candidate_id: "candidate-1",
          detector_run_id: "persistent-speed-run",
          detector_id: "persistent_speed_hotspot",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M15",
          route_id: "M15",
          evidence_ref: null,
          created_at: "2026-05-20T12:00:00.000Z",
        },
        {
          candidate_id: "",
          detector_run_id: "persistent-speed-run",
          detector_id: "persistent_speed_hotspot",
          month: "2026-03",
          scope_kind: "segment",
          scope_id: "M15:0:1",
          route_id: "M15",
          evidence_ref: null,
          created_at: "2026-05-20T12:00:00.000Z",
        },
      ],
    });

    expect(repairs).toHaveLength(0);
  });

  test("loads missing segment coverage rows from local SQLite", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_finding_candidate (
          candidate_id TEXT NOT NULL,
          detector_run_id TEXT NOT NULL,
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          route_id TEXT,
          detector_score REAL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE local_finding_coverage_audit (
          audit_id TEXT NOT NULL,
          detector_run_id TEXT NOT NULL,
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL
        );
        CREATE TABLE local_finding_evidence_link (
          candidate_id TEXT NOT NULL,
          evidence_role TEXT NOT NULL,
          evidence_ref TEXT
        );
      `);
      sqlite
        .prepare(
          `INSERT INTO local_finding_candidate
           (candidate_id, detector_run_id, detector_id, month, scope_kind, scope_id, route_id, detector_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "candidate-1",
          "run-1",
          "persistent_speed_hotspot",
          "2026-03",
          "segment",
          "M15:0:1",
          "M15",
          0.9,
          "2026-06-01T00:00:00.000Z",
        );
      sqlite
        .prepare(
          `INSERT INTO local_finding_candidate
           (candidate_id, detector_run_id, detector_id, month, scope_kind, scope_id, route_id, detector_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "candidate-covered",
          "run-1",
          "persistent_speed_hotspot",
          "2026-03",
          "segment",
          "M15:0:2",
          "M15",
          0.8,
          "2026-06-01T00:00:00.000Z",
        );
      sqlite
        .prepare(
          `INSERT INTO local_finding_coverage_audit
           (audit_id, detector_run_id, detector_id, month, scope_kind, scope_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("audit-1", "run-1", "persistent_speed_hotspot", "2026-03", "segment", "M15:0:2");
      sqlite
        .prepare(
          "INSERT INTO local_finding_evidence_link (candidate_id, evidence_role, evidence_ref) VALUES (?, ?, ?)",
        )
        .run("candidate-1", "primary", '{"weightedAverageSpeedMph":5.2}');

      const { rows } = loadPersistentSpeedSegmentCoverageRepairLocalDbRows({
        sqlite,
        month: "2026-03",
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.candidate_id).toBe("candidate-1");
      expect(rows[0]?.evidence_ref).toBe('{"weightedAverageSpeedMph":5.2}');
    } finally {
      sqlite.close();
    }
  });
});

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { routeMonthShadowAuditPath, speedPaceShadowAuditPath } from "../src/artifacts";
import { buildRouteMonthShadowAudit, buildSpeedPaceRouteMonthShadowAudit } from "../src/evaluation";
import {
  loadRouteMonthShadowAuditLocalDbRows,
  loadSpeedPaceShadowAuditLocalDbRows,
} from "../src/local-db";

function createSpeedPaceDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_finding_coverage_audit (
      detector_id TEXT NOT NULL,
      month TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      route_id TEXT,
      outcome TEXT NOT NULL
    );
    CREATE TABLE local_finding_candidate (
      candidate_id TEXT NOT NULL,
      detector_id TEXT NOT NULL,
      month TEXT NOT NULL,
      route_id TEXT,
      scope_id TEXT NOT NULL,
      detector_score REAL NOT NULL,
      claim_text TEXT NOT NULL
    );
  `);
  sqlite
    .query(
      `
        INSERT INTO local_finding_coverage_audit
          (detector_id, month, scope_kind, scope_id, route_id, outcome)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run("persistent_speed_hotspot", "2026-03", "route", "M15", "M15", "clean_no_hit");
  const insertCandidate = sqlite.query(
    `
      INSERT INTO local_finding_candidate
        (candidate_id, detector_id, month, route_id, scope_id, detector_score, claim_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );
  insertCandidate.run(
    "c1",
    "speed_pace_hotspot",
    "2026-03",
    "M15",
    "M15:0:10:s1:s2:am_peak",
    82,
    "Route M15 segment s1-s2 is slow.",
  );
  insertCandidate.run(
    "c2",
    "speed_pace_hotspot",
    "2026-03",
    "M16",
    "M16:0:10:s1:s2:am_peak",
    90,
    "Route M16 segment s1-s2 is slow.",
  );
  return sqlite;
}

describe("detector shadow audits", () => {
  test("finds speed-pace segment hits hidden by route-month clean no-hits", () => {
    const sqlite = createSpeedPaceDb();
    try {
      const rows = loadSpeedPaceShadowAuditLocalDbRows({
        sqlite,
        month: "2026-03",
      });
      const artifact = buildSpeedPaceRouteMonthShadowAudit({
        month: "2026-03",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath:
          "data/artifacts/detector-shadow-audits/2026-03/speed-pace-route-month-shadow.json",
        cleanNoHitRows: rows.cleanNoHitRows,
        speedPaceCandidateRows: rows.speedPaceCandidateRows,
      });

      expect(artifact.summary.routeMonthCleanNoHitRouteCount).toBe(1);
      expect(artifact.summary.speedPaceHitRouteCount).toBe(2);
      expect(artifact.summary.hiddenSegmentHitRouteCount).toBe(1);
      expect(artifact.summary.hiddenSegmentCandidateCount).toBe(1);
      expect(artifact.summary.maxHiddenDetectorScore).toBe(82);
      expect(artifact.hiddenSegmentRoutes[0]?.routeId).toBe("M15");
    } finally {
      sqlite.close();
    }
  });

  test("finds richer-grain candidates hidden behind route-month clean no-hits", () => {
    const audit = buildRouteMonthShadowAudit({
      month: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath:
        "data/artifacts/detector-shadow-audits/2026-03/route-month-false-negative-shadow.json",
      cleanNoHitRows: [
        { detector_id: "multi_month_speed_peer", route_id: "M15" },
        { detector_id: "multi_month_speed_peer", route_id: "B1" },
        { detector_id: "intervention_gap", route_id: "M15" },
      ],
      richerCandidateRows: [
        {
          detector_id: "speed_pace_hotspot",
          route_id: "M15",
          candidate_id: "c-speed",
          scope_kind: "segment",
          scope_id: "M15:N:1:s1:s2",
          reason_code: "slow_pace_hotspot",
          detector_score: 91,
          claim_text: "M15 segment is slow.",
        },
        {
          detector_id: "headway_reliability_ewt",
          route_id: "M15",
          candidate_id: "c-ewt",
          scope_kind: "route",
          scope_id: "M15:N:s1:2026-03-01:08",
          reason_code: "excess_wait_time",
          detector_score: 77,
          claim_text: "M15 stop-hour has excess wait.",
        },
      ],
    });

    expect(audit.summary.routeMonthCleanNoHitRouteCount).toBe(2);
    expect(audit.summary.hiddenRouteCount).toBe(1);
    expect(audit.summary.hiddenCandidateCount).toBe(4);
    const multiMonth = audit.baselineDetectors.find(
      (detector) => detector.detectorId === "multi_month_speed_peer",
    );
    expect(multiMonth?.hiddenRouteCount).toBe(1);
    expect(multiMonth?.hiddenCandidateDetectorCounts).toEqual({
      headway_reliability_ewt: 1,
      speed_pace_hotspot: 1,
    });
  });

  test("loads route-month shadow rows from local SQLite", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_finding_coverage_audit (
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          outcome TEXT NOT NULL
        );
        CREATE TABLE local_finding_candidate (
          detector_id TEXT NOT NULL,
          route_id TEXT,
          candidate_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          reason_code TEXT NOT NULL,
          detector_score REAL NOT NULL,
          claim_text TEXT NOT NULL
        );
      `);
      sqlite
        .prepare(
          "INSERT INTO local_finding_coverage_audit (detector_id, month, scope_kind, scope_id, outcome) VALUES (?, ?, ?, ?, ?)",
        )
        .run("multi_month_speed_peer", "2026-03", "route", "M15", "clean_no_hit");
      sqlite
        .prepare(
          `INSERT INTO local_finding_candidate
           (detector_id, route_id, candidate_id, month, scope_kind, scope_id, reason_code, detector_score, claim_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "speed_pace_hotspot",
          "M15",
          "c-speed",
          "2026-03",
          "segment",
          "M15:N:1:s1:s2",
          "slow_pace_hotspot",
          91,
          "M15 segment is slow.",
        );

      const rows = loadRouteMonthShadowAuditLocalDbRows({ sqlite, month: "2026-03" });

      expect(rows.cleanNoHitRows).toEqual([
        { detector_id: "multi_month_speed_peer", route_id: "M15" },
      ]);
      expect(rows.richerCandidateRows[0]?.candidate_id).toBe("c-speed");
    } finally {
      sqlite.close();
    }
  });

  test("owns detector shadow audit artifact paths", () => {
    expect(
      speedPaceShadowAuditPath({ artifactRoot: "data/artifacts", releaseMonth: "2026-03" }),
    ).toBe("data/artifacts/detector-shadow-audits/2026-03/speed-pace-route-month-shadow.json");
    expect(
      routeMonthShadowAuditPath({ artifactRoot: "data/artifacts", releaseMonth: "2026-03" }),
    ).toBe("data/artifacts/detector-shadow-audits/2026-03/route-month-false-negative-shadow.json");
  });
});

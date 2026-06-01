import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildSpeedPaceRouteMonthShadowAudit,
  speedPaceShadowAuditPath,
} from "../../../src/commands/audit/speed-pace-shadow.ts";

function createDb(): Database {
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

describe("speed pace route-month shadow audit", () => {
  test("finds segment hits hidden by route-month clean no-hits", () => {
    const sqlite = createDb();
    try {
      const artifact = buildSpeedPaceRouteMonthShadowAudit({
        sqlite,
        month: "2026-03",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-shadow-audits/2026-03/speed-pace-route-month-shadow.json",
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

  test("uses the detector-shadow-audits namespace", () => {
    expect(speedPaceShadowAuditPath({ artifactRoot: "data/artifacts", releaseMonth: "2026-03" }))
      .toBe("data/artifacts/detector-shadow-audits/2026-03/speed-pace-route-month-shadow.json");
  });
});

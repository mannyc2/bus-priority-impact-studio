import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { buildAnalyticsDetectorReadinessAudit } from "../../../src/commands/audit/analytics-detector-readiness.ts";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE local_route_segment_speed (
      month text NOT NULL,
      route_id text NOT NULL
    );
    CREATE TABLE local_route_hourly_ridership (
      month text NOT NULL,
      route_id text NOT NULL
    );
    CREATE TABLE local_route_intervention_comparison (
      month text NOT NULL,
      route_id text NOT NULL,
      comparison_status text NOT NULL
    );
    CREATE TABLE local_route_observed_reliability_summary (
      route_id text NOT NULL,
      month text NOT NULL,
      run_id text NOT NULL,
      sample_count integer NOT NULL
    );
    CREATE TABLE local_route_schedule_timepoint (
      route_id text NOT NULL,
      month text NOT NULL,
      row_rank integer NOT NULL
    );
  `);
  return db;
}

function monthRange(startYear: number, startMonth: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const absoluteMonth = startMonth - 1 + index;
    const year = startYear + Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

function insertObservedHeadwayCoverage(db: Database, months: readonly string[]): void {
  const insert = db.prepare(
    "INSERT INTO local_route_observed_reliability_summary (route_id, month, run_id, sample_count) VALUES (?, ?, 'test-run', 2)",
  );
  const tx = db.transaction(() => {
    for (const month of months) {
      for (let route = 0; route < 260; route += 1) {
        insert.run(`R${route}`, month);
      }
    }
  });
  tx();
}

function insertScheduleCoverage(db: Database, months: readonly string[]): void {
  const insert = db.prepare(
    "INSERT INTO local_route_schedule_timepoint (route_id, month, row_rank) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const month of months) {
      for (let route = 0; route < 260; route += 1) {
        for (let rank = 0; rank < 40; rank += 1) {
          insert.run(`R${route}`, month, rank);
        }
      }
    }
  });
  tx();
}

describe("buildAnalyticsDetectorReadinessAudit", () => {
  it("joins detector policies to audited surface coverage", () => {
    const db = createDb();
    try {
      const months = monthRange(2026, 1, 8);
      insertObservedHeadwayCoverage(db, months);
      insertScheduleCoverage(db, months);

      const audit = buildAnalyticsDetectorReadinessAudit({
        sqlite: db,
        startMonth: "2026-01",
        endMonth: "2026-08",
        generatedAt: "2026-05-30T00:00:00.000Z",
        dbPath: null,
        artifactPath: "data/artifacts/readiness.json",
        coverageArtifactPath: "data/artifacts/coverage.json",
      });

      expect(audit.summary.detectorCount).toBe(5);
      expect(audit.summary.readyDetectorCount).toBe(1);
      expect(audit.summary.blockedDetectorCount).toBe(4);

      const ewt = audit.detectors.find(
        (detector) => detector.detectorId === "headway_reliability_ewt",
      );
      expect(ewt?.status).toBe("ready");
      expect(ewt?.requirements).toEqual([
        expect.objectContaining({
          surfaceId: "observed_headways",
          status: "ready",
          usableMonthCount: 8,
          minimumCompleteMonths: 8,
        }),
      ]);

      const speed = audit.detectors.find(
        (detector) => detector.detectorId === "speed_pace_hotspot",
      );
      expect(speed?.status).toBe("blocked");
      expect(speed?.blockingReasons).toContain(
        "route_segment_speeds:below_minimum_complete_months",
      );
    } finally {
      db.close();
    }
  });
});

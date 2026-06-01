import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import { buildAnalyticsDetectorReadinessAudit } from "../../../src/commands/audit/analytics-detector-readiness.ts";

function createDb(
  options: {
    includeBusWaitAssessment?: boolean;
    includeScheduleStop?: boolean;
    includeScheduleTimepoint?: boolean;
  } = {},
): Database {
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
  `);
  if (options.includeScheduleTimepoint !== false) {
    db.exec(`
      CREATE TABLE local_route_schedule_timepoint (
        route_id text NOT NULL,
        month text NOT NULL,
        row_rank integer NOT NULL
      );
    `);
  }
  if (options.includeScheduleStop === true) {
    db.exec(`
      CREATE TABLE local_route_schedule_stop (
        source_year integer NOT NULL,
        route_id text NOT NULL,
        row_rank integer NOT NULL
      );
    `);
  }
  if (options.includeBusWaitAssessment !== false) {
    db.exec(`
      CREATE TABLE local_bus_wait_assessment (
        route_id text NOT NULL,
        month text NOT NULL,
        period text NOT NULL
      );
    `);
  }
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

function insertBusWaitAssessmentCoverage(db: Database, months: readonly string[]): void {
  const insert = db.prepare(
    "INSERT INTO local_bus_wait_assessment (route_id, month, period) VALUES (?, ?, 'am_peak')",
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

function insertScheduleStopSourceYearCoverage(db: Database, sourceYears: readonly number[]): void {
  const insert = db.prepare(
    "INSERT INTO local_route_schedule_stop (source_year, route_id, row_rank) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const sourceYear of sourceYears) {
      for (let route = 0; route < 260; route += 1) {
        for (let rank = 0; rank < 40; rank += 1) {
          insert.run(sourceYear, `R${route}`, rank);
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
      insertBusWaitAssessmentCoverage(db, months);
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

      expect(audit.summary.detectorCount).toBe(listAnalyticsDetectors().length);
      expect(audit.summary.readyDetectorCount).toBe(3);
      expect(audit.summary.blockedDetectorCount).toBe(15);
      expect(audit.summary.policyPendingDetectorCount).toBe(0);

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

      const bunching = audit.detectors.find(
        (detector) => detector.detectorId === "bunching_hotspots",
      );
      expect(bunching?.status).toBe("ready");
      expect(bunching?.requiredSurfaceIds).toEqual(["observed_headways", "gtfs_schedule_runtime"]);

      const speed = audit.detectors.find(
        (detector) => detector.detectorId === "speed_pace_hotspot",
      );
      expect(speed?.status).toBe("blocked");
      expect(speed?.blockingReasons).toContain(
        "route_segment_speeds:below_minimum_complete_months",
      );

      const observedReliability = audit.detectors.find(
        (detector) => detector.detectorId === "observed_reliability",
      );
      expect(observedReliability?.status).toBe("ready");
      expect(observedReliability?.requiredSurfaceIds).toEqual([
        "observed_headways",
        "gtfs_schedule_runtime",
        "bus_wait_assessment",
      ]);

      const delayConcentration = audit.detectors.find(
        (detector) => detector.detectorId === "delay_concentration",
      );
      expect(delayConcentration).toMatchObject({
        detectorName: "Delay concentration",
        status: "blocked",
        blockingReasons: expect.arrayContaining([
          "route_segment_speeds:below_minimum_complete_months",
          "route_segment_speeds:missing_months",
        ]),
      });

      const permitContext = audit.detectors.find(
        (detector) => detector.detectorId === "permit_correlated_slowdown",
      );
      expect(permitContext).toMatchObject({
        status: "blocked",
        blockingReasons: expect.arrayContaining([
          "route_segment_speeds:below_minimum_complete_months",
          "dot_permit_route_touches:below_minimum_complete_months",
        ]),
      });
    } finally {
      db.close();
    }
  });

  it("uses source-year schedule stop backfills for schedule runtime readiness", () => {
    const db = createDb({
      includeScheduleStop: true,
      includeScheduleTimepoint: false,
    });
    try {
      const months = monthRange(2026, 1, 8);
      insertObservedHeadwayCoverage(db, months);
      insertBusWaitAssessmentCoverage(db, months);
      insertScheduleStopSourceYearCoverage(db, [2026]);

      const audit = buildAnalyticsDetectorReadinessAudit({
        sqlite: db,
        startMonth: "2026-01",
        endMonth: "2026-08",
        generatedAt: "2026-05-30T00:00:00.000Z",
        dbPath: null,
        artifactPath: "data/artifacts/readiness.json",
        coverageArtifactPath: "data/artifacts/coverage.json",
      });

      const scheduleSurface = audit.surfaceCoverage.find(
        (surface) => surface.surfaceId === "gtfs_schedule_runtime",
      );
      expect(scheduleSurface).toMatchObject({
        label: "Source-year schedule stop rows",
        tableName: "local_route_schedule_stop",
        presentMonthCount: 8,
        missingMonthCount: 0,
        thinMonthCount: 0,
      });

      const observedReliability = audit.detectors.find(
        (detector) => detector.detectorId === "observed_reliability",
      );
      expect(observedReliability?.status).toBe("ready");
      expect(observedReliability?.requirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            surfaceId: "gtfs_schedule_runtime",
            tableName: "local_route_schedule_stop",
            status: "ready",
          }),
        ]),
      );
    } finally {
      db.close();
    }
  });

  it("reports missing direct-surface tables instead of throwing", () => {
    const db = createDb({ includeBusWaitAssessment: false });
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

      const busWaitSurface = audit.surfaceCoverage.find(
        (surface) => surface.surfaceId === "bus_wait_assessment",
      );
      expect(busWaitSurface).toMatchObject({
        presentMonthCount: 0,
        missingMonthCount: 8,
      });
      expect(busWaitSurface?.months[0]?.reasons).toContain("surface_table_missing");

      const observedReliability = audit.detectors.find(
        (detector) => detector.detectorId === "observed_reliability",
      );
      expect(observedReliability?.status).toBe("blocked");
      expect(observedReliability?.blockingReasons).toContain(
        "bus_wait_assessment:below_minimum_complete_months",
      );
    } finally {
      db.close();
    }
  });
});

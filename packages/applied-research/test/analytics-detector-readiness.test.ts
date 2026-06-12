import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import { DATA_PRODUCT_MANIFEST } from "../src/data-products";
import {
  buildAnalyticsBackfillCoverageAudit,
  buildAnalyticsDetectorReadinessAudit,
  DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE,
} from "../src/evaluation";
import {
  loadAnalyticsBackfillCoverageLocalDbRows,
  loadAnalyticsDetectorReadinessDirectSurfaceCoverage,
} from "../src/local-db";

function createDb(
  options: {
    includeBusWaitAssessment?: boolean;
    includeCustomerJourneyMetrics?: boolean;
    includeContextEventRouteTouch?: boolean;
    includeScheduleIngestStatus?: boolean;
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
  if (options.includeCustomerJourneyMetrics !== false) {
    db.exec(`
      CREATE TABLE local_bus_customer_journey_metric (
        month text NOT NULL,
        route_id text NOT NULL,
        borough text NOT NULL,
        trip_type text NOT NULL,
        period text NOT NULL,
        customers real NOT NULL,
        additional_bus_stop_time_minutes real,
        additional_travel_time_minutes real,
        customer_journey_time_minutes real,
        PRIMARY KEY (month, route_id, trip_type, period)
      );
    `);
  }
  if (options.includeScheduleIngestStatus === true) {
    db.exec(`
      CREATE TABLE local_route_schedule_ingest_status (
        source_year integer NOT NULL,
        route_id text NOT NULL,
        status text NOT NULL,
        row_count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (source_year, route_id)
      );
    `);
  }
  if (options.includeContextEventRouteTouch === true) {
    db.exec(`
      CREATE TABLE local_context_event_route_touch (
        event_id text NOT NULL,
        route_id text NOT NULL,
        event_kind text NOT NULL,
        occurred_at text NOT NULL
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

function insertCustomerJourneyCoverage(db: Database, months: readonly string[]): void {
  const insert = db.prepare(
    `
      INSERT INTO local_bus_customer_journey_metric (
        month,
        route_id,
        borough,
        trip_type,
        period,
        customers,
        additional_bus_stop_time_minutes,
        additional_travel_time_minutes,
        customer_journey_time_minutes
      )
      VALUES (?, ?, 'Brooklyn', 'local', 'am_peak', 3, 1, 2, 10)
    `,
  );
  const tx = db.transaction(() => {
    for (const month of months) {
      for (let route = 0; route < 260; route += 1) {
        insert.run(month, `R${route}`);
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

function insertScheduleIngestStatusCoverage(
  db: Database,
  sourceYear: number,
  routeCount: number,
  rowsPerRoute: number,
): void {
  const insert = db.prepare(
    "INSERT INTO local_route_schedule_ingest_status (source_year, route_id, status, row_count) VALUES (?, ?, 'complete', ?)",
  );
  const tx = db.transaction(() => {
    for (let route = 0; route < routeCount; route += 1) {
      insert.run(sourceYear, `R${route}`, rowsPerRoute);
    }
  });
  tx();
}

function insertContextEventRouteTouches(input: {
  db: Database;
  eventKind: string;
  months: readonly string[];
  routesPerMonth: number;
  rowsPerRoute: number;
}): void {
  const insert = input.db.prepare(
    "INSERT INTO local_context_event_route_touch (event_id, route_id, event_kind, occurred_at) VALUES (?, ?, ?, ?)",
  );
  const tx = input.db.transaction(() => {
    for (const month of input.months) {
      for (let route = 0; route < input.routesPerMonth; route += 1) {
        for (let row = 0; row < input.rowsPerRoute; row += 1) {
          insert.run(
            `${input.eventKind}:${month}:${route}:${row}`,
            `R${route}`,
            input.eventKind,
            `${month}-15`,
          );
        }
      }
    }
  });
  tx();
}

function buildReadinessAudit(db: Database) {
  return buildReadinessAuditForWindow(db, {
    startMonth: "2026-01",
    endMonth: "2026-08",
  });
}

function buildReadinessAuditForWindow(
  db: Database,
  window: { startMonth: string; endMonth: string },
) {
  const backfillCoverage = buildAnalyticsBackfillCoverageAudit({
    surfaceRows: loadAnalyticsBackfillCoverageLocalDbRows({ sqlite: db }),
    startMonth: window.startMonth,
    endMonth: window.endMonth,
    generatedAt: "2026-05-30T00:00:00.000Z",
    dbPath: null,
    artifactPath: "data/artifacts/coverage.json",
  });
  return buildAnalyticsDetectorReadinessAudit({
    backfillCoverage,
    directSurfaceCoverage: loadAnalyticsDetectorReadinessDirectSurfaceCoverage({
      sqlite: db,
      backfillCoverage,
    }),
    generatedAt: "2026-05-30T00:00:00.000Z",
    dbPath: null,
    artifactPath: "data/artifacts/readiness.json",
    coverageArtifactPath: "data/artifacts/coverage.json",
  });
}

describe("analytics detector readiness", () => {
  it("keeps detector readiness surfaces tied to registered data products", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    for (const productId of Object.values(DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE)) {
      expect(productIds.has(productId)).toBe(true);
    }
  });

  it("joins detector policies to audited surface coverage", () => {
    const db = createDb();
    try {
      const months = monthRange(2026, 1, 8);
      insertObservedHeadwayCoverage(db, months);
      insertBusWaitAssessmentCoverage(db, months);
      insertCustomerJourneyCoverage(db, months);
      insertScheduleCoverage(db, months);

      const audit = buildReadinessAudit(db);

      expect(audit.summary.detectorCount).toBe(listAnalyticsDetectors().length);
      expect(audit.summary.readyDetectorCount).toBe(4);
      expect(audit.summary.blockedDetectorCount).toBe(17);
      expect(audit.summary.policyPendingDetectorCount).toBe(0);

      const ewt = audit.detectors.find(
        (detector) => detector.detectorId === "headway_reliability_ewt",
      );
      expect(ewt?.status).toBe("ready");
      expect(ewt?.requirements).toEqual([
        expect.objectContaining({
          surfaceId: "observed_headways",
          registryProductId: "local_route_observed_reliability_summary_release",
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
      expect(bunching?.requirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            surfaceId: "gtfs_schedule_runtime",
            registryProductId: "local_route_schedule_timepoints_release",
          }),
        ]),
      );

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

      const customerJourney = audit.detectors.find(
        (detector) => detector.detectorId === "customer_journey_shortfall",
      );
      expect(customerJourney?.status).toBe("ready");
      expect(customerJourney?.requirements).toEqual([
        expect.objectContaining({
          surfaceId: "customer_journey_metrics",
          registryProductId: "local_bus_customer_journey_metrics_history",
          tableName: "local_bus_customer_journey_metric",
          status: "ready",
          usableMonthCount: 8,
          minimumCompleteMonths: 8,
        }),
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

      const audit = buildReadinessAudit(db);

      const scheduleSurface = audit.surfaceCoverage.find(
        (surface) => surface.surfaceId === "gtfs_schedule_runtime",
      );
      expect(scheduleSurface).toMatchObject({
        registryProductId: "local_route_schedule_stop_source_backfill",
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

  it("uses schedule ingest status summaries for source-year schedule readiness", () => {
    const db = createDb({
      includeScheduleIngestStatus: true,
      includeScheduleStop: true,
      includeScheduleTimepoint: false,
    });
    try {
      const months = monthRange(2026, 1, 8);
      insertObservedHeadwayCoverage(db, months);
      insertBusWaitAssessmentCoverage(db, months);
      insertScheduleIngestStatusCoverage(db, 2026, 260, 40);

      const audit = buildReadinessAudit(db);

      const scheduleSurface = audit.surfaceCoverage.find(
        (surface) => surface.surfaceId === "gtfs_schedule_runtime",
      );
      expect(scheduleSurface).toMatchObject({
        registryProductId: "local_route_schedule_stop_source_backfill",
        label: "Source-year schedule stop rows",
        tableName: "local_route_schedule_stop",
        presentMonthCount: 8,
        missingMonthCount: 0,
        thinMonthCount: 0,
        medianRowsPerPresentMonth: 10400,
        medianRoutesPerPresentMonth: 260,
      });
    } finally {
      db.close();
    }
  });

  it("uses detector policy windows instead of the whole audited history for readiness status", () => {
    const db = createDb();
    try {
      const fullWindow = monthRange(2023, 4, 36);
      const lookback12 = monthRange(2025, 4, 12);
      insertObservedHeadwayCoverage(db, fullWindow);
      insertScheduleCoverage(db, lookback12);

      const audit = buildReadinessAuditForWindow(db, {
        startMonth: "2023-04",
        endMonth: "2026-03",
      });

      const scheduleSurface = audit.surfaceCoverage.find(
        (surface) => surface.surfaceId === "gtfs_schedule_runtime",
      );
      expect(scheduleSurface).toMatchObject({
        presentMonthCount: 12,
        missingMonthCount: 24,
      });

      const bunching = audit.detectors.find(
        (detector) => detector.detectorId === "bunching_hotspots",
      );
      expect(bunching?.status).toBe("ready");
      expect(bunching?.requirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            surfaceId: "gtfs_schedule_runtime",
            status: "ready",
            presentMonthCount: 12,
            missingMonthCount: 0,
            thinMonthCount: 0,
          }),
        ]),
      );
    } finally {
      db.close();
    }
  });

  it("uses threshold route presence for event route-touch readiness", () => {
    const db = createDb({ includeContextEventRouteTouch: true });
    try {
      const months = monthRange(2026, 1, 8);
      insertContextEventRouteTouches({
        db,
        eventKind: "permit",
        months,
        routesPerMonth: 12,
        rowsPerRoute: 3,
      });

      const audit = buildReadinessAudit(db);

      const permitSurface = audit.surfaceCoverage.find(
        (surface) => surface.surfaceId === "dot_permit_route_touches",
      );
      expect(permitSurface).toMatchObject({
        presentMonthCount: 8,
        missingMonthCount: 0,
        thinMonthCount: 0,
        medianRowsPerPresentMonth: 36,
        medianRoutesPerPresentMonth: 1,
      });
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

      const audit = buildReadinessAudit(db);

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

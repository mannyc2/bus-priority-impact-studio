import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildEwtRouteMonthScoreVectorArtifactFromDb,
  ewtScoreVectorArtifactPath,
} from "../../../src/commands/build/ewt-score-vectors.ts";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE local_route_observed_reliability_summary (
      route_id text NOT NULL,
      month text NOT NULL,
      run_id text NOT NULL,
      reliability_status text NOT NULL,
      sample_count integer NOT NULL,
      stop_count integer NOT NULL,
      direction_count integer NOT NULL,
      average_observed_headway_minutes real,
      expected_wait_minutes real,
      scheduled_expected_wait_minutes real,
      excess_wait_minutes real,
      wait_reliability_ratio real
    );

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
  return db;
}

function insertRouteMonth(
  db: Database,
  routeId: string,
  month: string,
  excessWaitMinutes: number | null,
  overrides: { reliabilityStatus?: string; sampleCount?: number } = {},
): void {
  db.prepare(
    `
      INSERT INTO local_route_observed_reliability_summary (
        route_id,
        month,
        run_id,
        reliability_status,
        sample_count,
        stop_count,
        direction_count,
        average_observed_headway_minutes,
        expected_wait_minutes,
        scheduled_expected_wait_minutes,
        excess_wait_minutes,
        wait_reliability_ratio
      )
      VALUES (?, ?, 'test-run', ?, ?, 12, 2, ?, ?, 5, ?, ?)
    `,
  ).run(
    routeId,
    month,
    overrides.reliabilityStatus ?? "observed",
    overrides.sampleCount ?? 50,
    excessWaitMinutes === null ? null : 10,
    excessWaitMinutes === null ? null : 5 + excessWaitMinutes,
    excessWaitMinutes,
    excessWaitMinutes === null ? null : 1 + excessWaitMinutes / 10,
  );

  if (excessWaitMinutes !== null) {
    db.prepare(
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
        VALUES (?, ?, 'Brooklyn', 'Local', 'Peak', 100, ?, 0, ?)
      `,
    ).run(month, routeId, excessWaitMinutes, 20 + excessWaitMinutes);
  }
}

describe("build ewt-score-vectors", () => {
  test("builds an EWT artifact from route observed reliability summary rows", () => {
    const db = createDb();
    try {
      insertRouteMonth(db, "R1", "2026-01", 2);
      insertRouteMonth(db, "R1", "2026-02", 6);
      insertRouteMonth(db, "R1", "2026-03", 9);
      insertRouteMonth(db, "R2", "2026-01", 8);
      insertRouteMonth(db, "R2", "2026-02", 10);
      insertRouteMonth(db, "R2", "2026-03", 11);
      insertRouteMonth(db, "R3", "2026-03", null);
      insertRouteMonth(db, "R4", "2026-03", 5, {
        reliabilityStatus: "insufficient_gtfs_rt_samples",
      });

      const artifact = buildEwtRouteMonthScoreVectorArtifactFromDb({
        sqlite: db,
        startMonth: "2026-01",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
        generatedAt: "2026-05-30T00:00:00.000Z",
        dbPath: null,
        artifactPath: "data/artifacts/ewt.json",
        minSampleCount: 30,
        fleetFlagQuantile: 0.75,
      });

      expect(artifact.source.grain).toBe("route_month");
      expect(artifact.thresholds.fleetFlagCutoffScoreExcessWaitMinutes).toBe(8.5);
      expect(artifact.summary).toMatchObject({
        rawRowCount: 8,
        usableRowCount: 6,
        baselineUsableRowCount: 4,
        releaseUsableRouteCount: 2,
        releaseFlaggedRouteCount: 2,
        scoreBasisCounts: {
          mta_abst_customer_journey_metric: 6,
          observed_regularity_excess_wait: 0,
          schedule_excess_wait: 0,
        },
      });
      expect(artifact.excludedRowsByReason).toEqual({
        missing_score_wait_metric: 1,
        not_observed: 1,
      });
      expect(artifact.scoreVectors.releaseMonth.map((entry) => entry.scopeId)).toEqual([
        "R1:2026-03",
        "R2:2026-03",
      ]);
    } finally {
      db.close();
    }
  });

  test("places default artifacts under the EWT score-vector namespace", () => {
    expect(ewtScoreVectorArtifactPath("data/artifacts", "2023-04", "2026-03", "2026-03")).toBe(
      "data/artifacts/analytics-ewt-score-vectors/2023-04_to_2026-03/2026-03/ewt-route-month-score-vectors.json",
    );
  });
});

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ewtScoreVectorArtifactPath } from "../src/artifacts";
import { loadEwtRouteMonthScoreVectorLocalDbRows } from "../src/local-db";
import {
  buildEwtRouteMonthScoreVectorArtifact,
  buildEwtRouteMonthScoreVectorStudy,
  parseEwtRouteMonthRows,
} from "../src/score-vectors";

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

describe("EWT route-month score vectors", () => {
  test("parses local reliability rows and builds a route-month score-vector artifact", () => {
    const rows = parseEwtRouteMonthRows([
      {
        route_id: "M15",
        month: "2026-02",
        run_id: "run-1",
        reliability_status: "observed",
        sample_count: 50,
        stop_count: 10,
        direction_count: 2,
        average_observed_headway_minutes: 9,
        expected_wait_minutes: 7,
        scheduled_expected_wait_minutes: 5,
        excess_wait_minutes: 2,
        wait_reliability_ratio: 1.4,
      },
      {
        route_id: "M15",
        month: "2026-03",
        run_id: "run-1",
        reliability_status: "observed",
        sample_count: 50,
        stop_count: 10,
        direction_count: 2,
        average_observed_headway_minutes: 12,
        expected_wait_minutes: 10,
        scheduled_expected_wait_minutes: 5,
        excess_wait_minutes: 5,
        wait_reliability_ratio: 2,
      },
    ]);

    const firstRow = rows[0];
    const secondRow = rows[1];
    if (firstRow === undefined || secondRow === undefined) {
      throw new Error("expected two parsed EWT route-month rows");
    }
    rows[0] = { ...firstRow, mtaAbstMinutes: 2 };
    rows[1] = { ...secondRow, mtaAbstMinutes: 5 };

    const artifact = buildEwtRouteMonthScoreVectorArtifact({
      rows,
      startMonth: "2026-02",
      endMonth: "2026-03",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "data/artifacts/ewt.json",
      minSampleCount: 30,
      fleetFlagQuantile: 0.5,
    });

    expect(artifact.detectorId).toBe("headway_reliability_ewt");
    expect(artifact.summary.rawRowCount).toBe(2);
    expect(artifact.summary.usableRowCount).toBe(2);
    expect(artifact.summary.releaseUsableRouteCount).toBe(1);
    expect(artifact.scoreVectors.releaseMonth[0]?.scoreBasis).toBe(
      "mta_abst_customer_journey_metric",
    );
  });

  test("builds an EWT study from local SQLite reliability and customer journey rows", () => {
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

      const rows = loadEwtRouteMonthScoreVectorLocalDbRows({
        sqlite: db,
        startMonth: "2026-01",
        endMonth: "2026-03",
      });
      const artifact = buildEwtRouteMonthScoreVectorStudy({
        metadata: {
          startMonth: "2026-01",
          endMonth: "2026-03",
          releaseMonth: "2026-03",
          generatedAt: "2026-05-30T00:00:00.000Z",
          dbPath: null,
          artifactPath: "data/artifacts/ewt.json",
          minSampleCount: 30,
          fleetFlagQuantile: 0.75,
        },
        rows: { rows },
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

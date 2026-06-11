import { Database, type SQLQueryBindings } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { localDbQueryBaselinesArtifactPath } from "../src/artifacts";
import {
  buildLocalDbHotQueryBaselines,
  decouplingReliabilitySql,
  decouplingRouteTrendSql,
  INTERVENTION_PANEL_SQL,
  pulseFingerprintSql,
  reliabilityExposurePanelRidershipSql,
  routePeerResidualPanelSql,
  SEGMENT_DAYPART_HISTORY_SQL,
  segmentMonthPanelV1Sql,
} from "../src/local-db";

type QueryPlanRow = {
  detail: string;
};

function queryPlan(sqlite: Database, sql: string, params: readonly SQLQueryBindings[]): string {
  return (sqlite.query(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as QueryPlanRow[])
    .map((row) => row.detail)
    .join("\n");
}

function createSegmentSpeedFixtureDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      row_rank INTEGER NOT NULL,
      timestamp TEXT,
      day_of_week TEXT,
      hour_of_day INTEGER NOT NULL,
      direction TEXT NOT NULL,
      stop_order INTEGER NOT NULL,
      timepoint_stop_id TEXT NOT NULL,
      next_timepoint_stop_id TEXT NOT NULL,
      road_distance_miles REAL NOT NULL,
      average_travel_time_minutes REAL NOT NULL,
      average_road_speed_mph REAL NOT NULL,
      bus_trip_count INTEGER NOT NULL,
      PRIMARY KEY (route_id, month, row_rank)
    );
    CREATE INDEX local_route_segment_speed_month_route_idx
      ON local_route_segment_speed (month, route_id);
    INSERT INTO local_route_segment_speed VALUES
      ('M15', '2026-01', 1, '2026-01-01T08:00:00.000Z', 'weekday', 8, 'N', 1, '401001', '401002', 1.1, 12.0, 6.0, 10),
      ('M15', '2026-02', 1, '2026-02-01T08:00:00.000Z', 'weekday', 8, 'N', 1, '401001', '401002', 1.1, 11.0, 6.5, 12),
      ('B41', '2026-02', 1, '2026-02-01T08:00:00.000Z', 'weekday', 8, 'N', 1, '501001', '501002', 1.0, 10.0, 7.0, 11);
  `);
  return sqlite;
}

function createPanelFixtureDb(): Database {
  const sqlite = createSegmentSpeedFixtureDb();
  sqlite.exec(`
    CREATE TABLE local_route_hourly_ridership (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      hour_of_day INTEGER NOT NULL,
      ridership REAL NOT NULL,
      transfers REAL NOT NULL,
      PRIMARY KEY (route_id, month, day_of_week, hour_of_day)
    );
    CREATE INDEX local_route_hourly_ridership_month_route_idx
      ON local_route_hourly_ridership (month, route_id);

    CREATE TABLE local_route_month_trend (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      speed_observation_count INTEGER NOT NULL,
      speed_bus_trip_count INTEGER NOT NULL,
      average_speed_mph REAL,
      ridership REAL,
      transfers REAL,
      has_speed_trend INTEGER NOT NULL,
      has_ridership_trend INTEGER NOT NULL,
      PRIMARY KEY (route_id, month)
    );
    CREATE INDEX local_route_month_trend_month_route_idx
      ON local_route_month_trend (month, route_id);

    CREATE TABLE local_route_observed_reliability_summary (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      run_id TEXT NOT NULL,
      reliability_status TEXT NOT NULL,
      min_sample_threshold INTEGER NOT NULL,
      sample_count INTEGER NOT NULL,
      stop_count INTEGER NOT NULL,
      direction_count INTEGER NOT NULL,
      average_observed_headway_minutes REAL,
      median_observed_headway_minutes REAL,
      p90_observed_headway_minutes REAL,
      max_observed_headway_minutes REAL,
      scheduled_median_headway_minutes REAL,
      bunching_threshold_minutes REAL,
      long_gap_threshold_minutes REAL,
      observed_bunching_share REAL,
      observed_long_gap_share REAL,
      expected_wait_minutes REAL,
      scheduled_expected_wait_minutes REAL,
      excess_wait_minutes REAL,
      wait_reliability_ratio REAL,
      PRIMARY KEY (route_id, month, run_id)
    );
    CREATE INDEX local_route_observed_reliability_summary_month_idx
      ON local_route_observed_reliability_summary (month);

    CREATE TABLE local_route_intervention_comparison (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      event_id TEXT NOT NULL,
      intervention_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      evaluation_level TEXT NOT NULL,
      comparison_status TEXT NOT NULL,
      pre_start_month TEXT,
      pre_end_month TEXT,
      post_start_month TEXT,
      post_end_month TEXT,
      requested_pre_month_count INTEGER NOT NULL,
      requested_post_month_count INTEGER NOT NULL,
      pre_sample_month_count INTEGER NOT NULL,
      post_sample_month_count INTEGER NOT NULL,
      pre_speed_observation_count INTEGER NOT NULL,
      post_speed_observation_count INTEGER NOT NULL,
      pre_average_speed_mph REAL,
      post_average_speed_mph REAL,
      speed_delta_mph REAL,
      pre_average_monthly_ridership REAL,
      post_average_monthly_ridership REAL,
      ridership_delta REAL,
      comparison_route_count INTEGER NOT NULL DEFAULT 0,
      comparison_route_ids TEXT,
      comparison_pre_average_speed_mph REAL,
      comparison_post_average_speed_mph REAL,
      comparison_speed_delta_mph REAL,
      adjusted_speed_delta_mph REAL,
      comparison_pre_average_monthly_ridership REAL,
      comparison_post_average_monthly_ridership REAL,
      comparison_ridership_delta REAL,
      adjusted_ridership_delta REAL,
      caveat TEXT NOT NULL,
      PRIMARY KEY (route_id, month, event_id)
    );
    CREATE INDEX local_route_intervention_comparison_month_route_idx
      ON local_route_intervention_comparison (month, route_id);

    INSERT INTO local_route_hourly_ridership VALUES
      ('M15', '2026-02', 'weekday', 8, 100.0, 10.0),
      ('B41', '2026-02', 'weekday', 8, 80.0, 8.0);
    INSERT INTO local_route_month_trend VALUES
      ('M15', '2026-01', 100, 200, 6.2, 1000.0, 100.0, 1, 1),
      ('M15', '2026-02', 100, 200, 6.5, 1100.0, 110.0, 1, 1),
      ('B41', '2026-02', 80, 160, 7.0, 900.0, 90.0, 1, 1);
    INSERT INTO local_route_observed_reliability_summary (
      route_id, month, run_id, reliability_status, min_sample_threshold, sample_count,
      stop_count, direction_count, observed_long_gap_share, excess_wait_minutes,
      wait_reliability_ratio
    ) VALUES
      ('M15', '2026-02', 'bus-observatory-2026-02', 'observed', 30, 100, 20, 2, 0.12, 5.0, 1.2),
      ('B41', '2026-02', 'bus-observatory-2026-02', 'observed', 30, 80, 18, 2, 0.10, 4.0, 1.1);
    INSERT INTO local_route_intervention_comparison (
      route_id, month, event_id, intervention_type, source_id, evaluation_level,
      comparison_status, requested_pre_month_count, requested_post_month_count,
      pre_sample_month_count, post_sample_month_count, pre_speed_observation_count,
      post_speed_observation_count, comparison_route_count, caveat
    ) VALUES
      ('M15', '2026-02', 'evt1', 'bus_lane', 'src1', 'screening', 'supported',
       6, 6, 6, 6, 100, 100, 3, 'screening only');
  `);
  return sqlite;
}

describe("local DB query plans", () => {
  test("hot segment speed panel reads use the month/route index", () => {
    const sqlite = createSegmentSpeedFixtureDb();
    try {
      const segmentMonthPlan = queryPlan(sqlite, segmentMonthPanelV1Sql(), ["2026-01", "2026-03"]);
      const segmentMonthRoutePlan = queryPlan(
        sqlite,
        segmentMonthPanelV1Sql({ routeFiltered: true }),
        ["2026-01", "2026-03", "M15"],
      );
      const daypartPlan = queryPlan(sqlite, SEGMENT_DAYPART_HISTORY_SQL, ["2026-01", "2026-03"]);

      for (const plan of [segmentMonthPlan, daypartPlan]) {
        expect(plan).toContain("USING INDEX local_route_segment_speed_month_route_idx");
        expect(plan).not.toContain("SCAN local_route_segment_speed");
      }
      expect(segmentMonthRoutePlan).toContain("USING INDEX");
      expect(segmentMonthRoutePlan).not.toContain("SCAN local_route_segment_speed");
    } finally {
      sqlite.close();
    }
  });

  test("model panel reads use month-first indexes", () => {
    const sqlite = createPanelFixtureDb();
    try {
      const plans = [
        {
          plan: queryPlan(sqlite, pulseFingerprintSql(), ["2026-01", "2026-03"]),
          indexName: "local_route_segment_speed_month_route_idx",
        },
        {
          plan: queryPlan(sqlite, reliabilityExposurePanelRidershipSql(), ["2026-02"]),
          indexName: "local_route_hourly_ridership_month_route_idx",
        },
        {
          plan: queryPlan(sqlite, decouplingRouteTrendSql(), ["2026-01", "2026-03"]),
          indexName: "local_route_month_trend_month_route_idx",
        },
        {
          plan: queryPlan(sqlite, routePeerResidualPanelSql(), ["2026-01", "2026-03"]),
          indexName: "local_route_month_trend_month_route_idx",
        },
        {
          plan: queryPlan(sqlite, decouplingReliabilitySql(), ["2026-01", "2026-03", null]),
          indexName: "local_route_observed_reliability_summary_month_idx",
        },
        {
          plan: queryPlan(sqlite, INTERVENTION_PANEL_SQL, ["2026-01", "2026-03"]),
          indexName: "local_route_intervention_comparison_month_route_idx",
        },
      ];

      for (const { plan, indexName } of plans) {
        expect(plan).toContain(`USING INDEX ${indexName}`);
        expect(plan).not.toMatch(
          /SCAN local_route_(segment_speed|hourly_ridership|month_trend|observed_reliability_summary|intervention_comparison)/,
        );
      }
    } finally {
      sqlite.close();
    }
  });

  test("hot query baseline artifact records row counts, plans, and artifact-backed source gaps", () => {
    const sqlite = createPanelFixtureDb();
    try {
      const artifact = buildLocalDbHotQueryBaselines({
        sqlite,
        historyStartMonth: "2026-01",
        releaseMonth: "2026-02",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: "fixture.sqlite",
      });

      expect(artifact).toEqual(
        expect.objectContaining({
          artifactKind: "local_db_hot_query_baselines",
          schemaVersion: 1,
          generatedAt: "2026-06-07T00:00:00.000Z",
          dbPath: "fixture.sqlite",
          historyWindow: { startMonth: "2026-01", endMonth: "2026-02" },
        }),
      );
      expect(artifact.summary).toEqual({
        queryCount: 10,
        measuredQueryCount: 9,
        missingTableQueryCount: 0,
        artifactBackedQueryCount: 1,
        errorQueryCount: 0,
        fullScanWarningCount: 0,
      });
      expect(artifact.queries.map((query) => query.queryId)).toEqual([
        "route_month_history",
        "segment_month_panel",
        "segment_daypart_panel",
        "route_peer_residual_panel",
        "treatment_event_panel",
        "reliability_exposure",
        "pulse_fingerprint",
        "decoupling_route_trend",
        "decoupling_reliability",
        "source_gap_model",
      ]);

      const measured = artifact.queries.filter((query) => query.status === "measured");
      expect(measured.every((query) => query.rowCount !== null && query.rowCount > 0)).toBe(true);
      expect(measured.every((query) => query.elapsedMs !== null && query.elapsedMs >= 0)).toBe(
        true,
      );
      expect(measured.every((query) => query.usesIndex === true)).toBe(true);
      expect(measured.every((query) => query.queryPlan.length > 0)).toBe(true);

      const sourceGap = artifact.queries.find((query) => query.queryId === "source_gap_model");
      expect(sourceGap).toEqual(
        expect.objectContaining({
          status: "artifact_backed",
          rowCount: null,
          usesIndex: null,
          warnings: [
            "Source-gap model rows are artifact-backed by route-treatment-summary, so there is no direct SQLite query plan for this panel.",
          ],
        }),
      );
    } finally {
      sqlite.close();
    }
  });

  test("owns the local DB query baseline artifact path", () => {
    expect(
      localDbQueryBaselinesArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe("data/artifacts/local-db-query-baselines/2023-04_to_2026-03/query-baselines.json");
  });
});

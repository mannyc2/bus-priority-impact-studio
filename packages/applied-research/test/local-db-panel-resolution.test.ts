import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  RELIABILITY_EXPOSURE_PANEL_V1_ID,
  ROUTE_DECOUPLING_PANEL_V1_ID,
  ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
  ROUTE_MONTH_PEER_PANEL_V1_ID,
  SEGMENT_DAYPART_PANEL_V1_ID,
  SEGMENT_MONTH_PANEL_V1_ID,
  TREATMENT_EVENT_PANEL_V1_ID,
} from "../src/feature-resolvers";
import {
  loadDecouplingQuadrantsPanelV1Resolution,
  loadPulseFingerprintPanelV1Resolution,
  loadReliabilityExposureRidershipPanelV1Resolution,
  loadRoutePeerResidualPanelV1Resolution,
  loadSegmentDaypartPanelV1Resolution,
  loadSegmentMonthPanelV1Resolution,
  loadTreatmentEventPanelV1Resolution,
  parseSegmentMonthPanelSourceRows,
} from "../src/local-db";

function createFixtureDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      hour_of_day INTEGER NOT NULL,
      direction TEXT NOT NULL,
      stop_order INTEGER NOT NULL,
      timepoint_stop_id TEXT NOT NULL,
      next_timepoint_stop_id TEXT NOT NULL,
      road_distance_miles REAL NOT NULL,
      average_travel_time_minutes REAL NOT NULL,
      average_road_speed_mph REAL NOT NULL,
      bus_trip_count INTEGER NOT NULL
    );

    CREATE TABLE local_route_hourly_ridership (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      hour_of_day INTEGER NOT NULL,
      ridership REAL NOT NULL
    );

    CREATE TABLE local_route_month_trend (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      speed_observation_count INTEGER NOT NULL,
      average_speed_mph REAL,
      ridership REAL,
      has_speed_trend INTEGER NOT NULL,
      has_ridership_trend INTEGER NOT NULL
    );

    CREATE TABLE local_route_observed_reliability_summary (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      run_id TEXT NOT NULL,
      reliability_status TEXT NOT NULL,
      sample_count INTEGER NOT NULL,
      min_sample_threshold INTEGER NOT NULL,
      observed_long_gap_share REAL,
      excess_wait_minutes REAL,
      wait_reliability_ratio REAL
    );

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
      comparison_route_count INTEGER NOT NULL,
      comparison_route_ids TEXT,
      speed_delta_mph REAL,
      adjusted_speed_delta_mph REAL,
      ridership_delta REAL,
      adjusted_ridership_delta REAL,
      caveat TEXT NOT NULL
    );

    INSERT INTO local_route_segment_speed VALUES
      ('M15', '2026-01', 'Weekday', 8, 'N', 1, 's1', 's2', 0.5, 5.0, 6.0, 10),
      ('M15', '2026-02', 'Weekday', 8, 'N', 1, 's1', 's2', 0.5, 4.5, 6.5, 12),
      ('B41', '2026-02', 'Weekday', 8, 'N', 1, 'b1', 'b2', 0.4, 4.0, 7.0, 11);

    INSERT INTO local_route_hourly_ridership VALUES
      ('M15', '2026-02', 'Weekday', 8, 100.0),
      ('B41', '2026-02', 'Weekday', 8, 80.0);

    INSERT INTO local_route_month_trend VALUES
      ('M15', '2026-01', 100, 6.0, 1000.0, 1, 1),
      ('M15', '2026-02', 100, 6.5, 1050.0, 1, 1),
      ('B41', '2026-02', 90, 7.0, 900.0, 1, 1);

    INSERT INTO local_route_observed_reliability_summary VALUES
      ('M15', '2026-02', 'bus-observatory-2026-02', 'observed', 100, 30, 0.12, 5.0, 1.2),
      ('B41', '2026-02', 'bus-observatory-2026-02', 'observed', 80, 30, 0.10, 4.0, 1.1);

    INSERT INTO local_route_intervention_comparison VALUES
      ('M15', '2026-02', 'evt1', 'bus_lane', 'src1', 'screening', 'supported',
       '2025-08', '2026-01', '2026-02', '2026-03', 3, '["B41"]', 0.5, 0.2, 10, 5,
       'screening only');
  `);
  return sqlite;
}

describe("local DB panel resolution", () => {
  test("returns typed rows plus manifests for built-in panel SQL resolvers", () => {
    const sqlite = createFixtureDb();
    try {
      const generatedAt = "2026-06-07T00:00:00.000Z";
      const segmentMonth = loadSegmentMonthPanelV1Resolution({
        sqlite,
        generatedAt,
        spec: {
          panelId: SEGMENT_MONTH_PANEL_V1_ID,
          startMonth: "2026-01",
          endMonth: "2026-02",
          minObservationCount: 1,
          routeId: "M15",
        },
      });
      expect(segmentMonth.rows).toHaveLength(2);
      expect(segmentMonth.panelManifest).toMatchObject({
        panelId: SEGMENT_MONTH_PANEL_V1_ID,
        generatedAt,
        summary: { sourceRowCount: 2, routeCount: 1, entityCount: 1, monthCount: 2 },
      });

      const segmentDaypart = loadSegmentDaypartPanelV1Resolution({
        sqlite,
        spec: {
          panelId: SEGMENT_DAYPART_PANEL_V1_ID,
          startMonth: "2026-01",
          endMonth: "2026-02",
          minObservationCount: 1,
          routeId: "M15",
        },
      });
      expect(segmentDaypart.panelManifest.panelId).toBe(SEGMENT_DAYPART_PANEL_V1_ID);
      expect(segmentDaypart.rows).toHaveLength(2);

      const routePeer = loadRoutePeerResidualPanelV1Resolution({
        sqlite,
        spec: {
          panelId: ROUTE_MONTH_PEER_PANEL_V1_ID,
          startMonth: "2026-01",
          endMonth: "2026-02",
          minObservationCount: 1,
          minHistoryMonths: 1,
          routeId: "M15",
        },
      });
      expect(routePeer.panelManifest.panelId).toBe(ROUTE_MONTH_PEER_PANEL_V1_ID);
      expect(routePeer.rows).toHaveLength(2);

      const pulse = loadPulseFingerprintPanelV1Resolution({
        sqlite,
        spec: {
          panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
          historyStartMonth: "2026-01",
          releaseMonth: "2026-02",
          minCellHistoryMonths: 1,
          minReleaseTripCount: 1,
          routeId: "M15",
        },
      });
      expect(pulse.panelManifest.panelId).toBe(ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID);
      expect(pulse.rows).toHaveLength(2);

      const reliability = loadReliabilityExposureRidershipPanelV1Resolution({
        sqlite,
        spec: {
          panelId: RELIABILITY_EXPOSURE_PANEL_V1_ID,
          releaseMonth: "2026-02",
          runId: "bus-observatory-2026-02",
          routeId: "M15",
        },
      });
      expect(reliability.panelManifest.panelId).toBe(RELIABILITY_EXPOSURE_PANEL_V1_ID);
      expect(reliability.rows).toHaveLength(1);
      expect(reliability.panelManifest.limitations.join(" ")).toContain("ridership side");

      const decoupling = loadDecouplingQuadrantsPanelV1Resolution({
        sqlite,
        spec: {
          panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
          historyStartMonth: "2026-01",
          releaseMonth: "2026-02",
          minHistoryMonths: 1,
          routeId: "M15",
        },
      });
      expect(decoupling.panelManifest.panelId).toBe(ROUTE_DECOUPLING_PANEL_V1_ID);
      expect(decoupling.routeTrendRows).toHaveLength(2);
      expect(decoupling.reliabilityRows).toHaveLength(1);

      const treatment = loadTreatmentEventPanelV1Resolution({
        sqlite,
        spec: {
          panelId: TREATMENT_EVENT_PANEL_V1_ID,
          historyStartMonth: "2026-01",
          releaseMonth: "2026-02",
          routeId: "M15",
        },
      });
      expect(treatment.panelManifest.panelId).toBe(TREATMENT_EVENT_PANEL_V1_ID);
      expect(treatment.rows).toHaveLength(1);
      expect(treatment.panelManifest.inputRefs.map((ref) => ref.refId)).toContain(
        "INTERVENTION_PANEL_SQL",
      );
    } finally {
      sqlite.close();
    }
  });

  test("validates high-value SQL row shapes before returning panel rows", () => {
    expect(() =>
      parseSegmentMonthPanelSourceRows([
        {
          route_id: "M15",
          month: "March 2026",
          segment_id: "M15:bad",
          direction: "N",
          stop_order: 1,
          average_speed_mph: 6,
          observation_count: 1,
          bus_trip_count: 1,
        },
      ]),
    ).toThrow();
  });
});

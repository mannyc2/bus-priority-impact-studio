import { describe, expect, test } from "bun:test";
import {
  buildExpressBusCapacityContextArtifact,
  buildRouteHourlyProfileArtifact,
  buildRouteSpeedHistoryArtifact,
  buildRouteSpeedSpineArtifact,
  buildSegmentDaypartHistoryArtifact,
  buildSegmentDaypartPanelArtifact,
  type RouteSpeedHistorySourceRow,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineSourceRow,
  SEGMENT_DAYPART_PANEL_V1_ID,
} from "../src/feature-history/index.ts";

function spineSourceRow(input: {
  month: string;
  nextStopId: string;
  nextStopLatitude: number;
  nextStopLongitude: number;
}): RouteSpeedSpineSourceRow {
  return {
    route_id: "B41",
    month: input.month,
    direction: "N",
    stop_order: 10,
    timepoint_stop_id: "a",
    timepoint_stop_name: "A",
    timepoint_stop_latitude: 40.1,
    timepoint_stop_longitude: -73.1,
    next_timepoint_stop_id: input.nextStopId,
    next_timepoint_stop_name: "B",
    next_timepoint_stop_latitude: input.nextStopLatitude,
    next_timepoint_stop_longitude: input.nextStopLongitude,
    source_row_count: 10,
    bus_trip_count: 100,
    average_road_speed_mph: 8,
    average_travel_time_minutes: 4,
    average_road_distance_miles: 0.5,
  };
}

function speedHistoryRow(month: string, averageSpeedMph: number): RouteSpeedHistorySourceRow {
  return {
    route_id: "B41",
    month,
    direction: "N",
    stop_order: 10,
    timepoint_stop_id: "a",
    next_timepoint_stop_id: "b",
    daypart: "am_peak",
    observation_count: 5,
    traversal_count: 50,
    average_speed_mph: averageSpeedMph,
    average_travel_time_minutes: 3,
    average_road_distance_miles: 0.5,
  };
}

describe("analytics feature-history artifacts", () => {
  test("builds route speed spine and history artifacts without DB or filesystem dependencies", () => {
    const spine = buildRouteSpeedSpineArtifact({
      routeId: "B41",
      rows: [
        spineSourceRow({
          month: "2026-01",
          nextStopId: "b",
          nextStopLatitude: 40.2,
          nextStopLongitude: -73.2,
        }),
        spineSourceRow({
          month: "2026-02",
          nextStopId: "b-renamed",
          nextStopLatitude: 40.2001,
          nextStopLongitude: -73.2001,
        }),
      ],
      generatedAt: "2026-07-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
      startMonth: "2026-01",
      endMonth: "2026-02",
      toleranceMeters: 125,
    });

    expect(spine.summary.spineSegmentCount).toBe(1);
    expect(spine.validation.status).toBe("pass");

    const history = buildRouteSpeedHistoryArtifact({
      routeId: "B41",
      routeSlug: "b41",
      spine: spine satisfies RouteSpeedSpineArtifact,
      rows: [speedHistoryRow("2026-01", 8), speedHistoryRow("2026-02", 12)],
      expectedService: {
        completeMonths: new Set(["2026-01", "2026-02"]),
        expectedCellKeys: new Set([
          "b41-n-node-001-node-002|2026-01|am_peak",
          "b41-n-node-001-node-002|2026-02|am_peak",
        ]),
        routeScheduleRowCount: 4,
        matchedSchedulePairCount: 2,
        unmatchedSchedulePairCount: 0,
      },
      generatedAt: "2026-07-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      speedSpinePath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-history.json",
    });

    expect(history.summary).toMatchObject({
      monthCount: 2,
      segmentCount: 1,
      availableCellCount: 2,
      missingCellCount: 0,
    });
  });

  test("builds route hourly and segment daypart aggregation artifacts", () => {
    const hourly = buildRouteHourlyProfileArtifact({
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          hourly_row_count: 2,
          total_ridership: 150,
          total_transfers: 15,
          peak_day_of_week: "weekday",
          peak_hour_of_day: 8,
          peak_ridership: 100,
        },
      ],
      startMonth: "2026-01",
      endMonth: "2026-03",
      generatedAt: "2026-07-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/route-hourly-profile.json",
    });

    const daypartRows = [
      {
        route_id: "M15",
        month: "2026-03",
        segment_id: "M15:N:1:401001:401002",
        direction: "N",
        daypart: "am_peak",
        observation_count: 20,
        traversal_count: 100,
        average_speed_mph: 6.5,
        average_travel_time_minutes: 12,
        average_road_distance_miles: 1.2,
      },
    ];
    const history = buildSegmentDaypartHistoryArtifact({
      rows: daypartRows,
      startMonth: "2026-01",
      endMonth: "2026-03",
      generatedAt: "2026-07-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/segment-daypart-history.json",
    });
    const panel = buildSegmentDaypartPanelArtifact({
      rows: daypartRows,
      spec: {
        panelId: SEGMENT_DAYPART_PANEL_V1_ID,
        startMonth: "2026-01",
        endMonth: "2026-03",
        minObservationCount: 10,
      },
      releaseMonth: "2026-03",
      generatedAt: "2026-07-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/segment-daypart-panel.json",
    });

    expect(hourly.summary.profileCount).toBe(1);
    expect(history.summary.featureCount).toBe(1);
    expect(panel.summary.eligiblePanelRowCount).toBe(1);
    expect(panel.panelManifest.spec.panelId).toBe(SEGMENT_DAYPART_PANEL_V1_ID);
  });

  test("builds express capacity context as a pure aggregation artifact", () => {
    const artifact = buildExpressBusCapacityContextArtifact({
      generatedAt: "2026-07-01T00:00:00.000Z",
      rows: [
        {
          routeId: "BM1",
          direction: "NB",
          dayType: "Weekday",
          hourOfDay: 8,
          weekStartDate: "2023-05-01",
          tripsWithApc: 12,
          loadPercentage: 0.75,
        },
      ],
    });

    expect(artifact.rows[0]).toMatchObject({
      routeId: "BM1",
      weightedLoadPercentage: 0.75,
      lowSample: false,
    });
  });
});

import { describe, expect, test } from "bun:test";
import { DEFAULT_REGISTRY_DETECTOR_STUDY_ID, runRegistryDetectorStudy } from "../src/detector-runs";

const FEATURE_COUNT_SUMMARY_KEY = "featureCount";

function segmentDaypartResidualRow() {
  return {
    routeId: "M15",
    month: "2026-03",
    segmentId: "M15:N:10:401000:401100",
    directionId: "N",
    daypart: "am_peak",
    averageSpeedMph: 3.75,
    expectedSpeedMph: 8,
    speedResidualMph: -4.25,
    residualPercentileWithinMonthDaypart: 0.05,
    residualRankWithinMonthDaypart: 1,
    residualMonthDaypartCount: 100,
    segmentDaypartHistoryMeanSpeedMph: 7.8,
    segmentDaypartHistoryMedianSpeedMph: 8,
    segmentDaypartHistoryMonthCount: 12,
    routeMonthDaypartMeanSpeedMph: 7,
    routeDaypartHistoryMeanSpeedMph: 8.1,
    observationCount: 2,
    traversalCount: 40,
  };
}

describe("registry detector studies", () => {
  test("runs a detector through applied-research feature resolution and analytics registry dispatch", () => {
    const result = runRegistryDetectorStudy({
      metadata: {
        detectorId: DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/speed_pace_hotspot-run.json",
        wroteDb: false,
      },
      rows: {
        segmentDaypartResidualRows: [segmentDaypartResidualRow()],
        speedRows: [
          {
            route_id: "M15",
            month: "2026-03",
            hour_of_day: 8,
            direction: "N",
            stop_order: 10,
            timepoint_stop_id: "401000",
            next_timepoint_stop_id: "401100",
            road_distance_miles: 0.5,
            average_travel_time_minutes: 8,
            average_road_speed_mph: 3.75,
            bus_trip_count: 20,
          },
          {
            route_id: "M15",
            month: "2026-03",
            hour_of_day: 23,
            direction: "N",
            stop_order: 10,
            timepoint_stop_id: "401000",
            next_timepoint_stop_id: "401100",
            road_distance_miles: 0.5,
            average_travel_time_minutes: 2.5,
            average_road_speed_mph: 12,
            bus_trip_count: 20,
          },
        ],
      },
    });

    expect(result.artifact.detectorId).toBe("speed_pace_hotspot");
    expect(result.artifact.inputSummary[FEATURE_COUNT_SUMMARY_KEY]).toBe(2);
    expect(result.output.candidates).toHaveLength(1);
    expect(result.output.candidates[0]?.reasonCode).toBe("slow_pace_hotspot");
    expect(result.output.coverage.map((row) => row.outcome)).toContain("hit");
  });

  test("skips explicitly when a model-backed detector is missing its model artifact rows", () => {
    const result = runRegistryDetectorStudy({
      metadata: {
        detectorId: DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: null,
        artifactPath: "speed_pace_hotspot-run.json",
        wroteDb: false,
      },
      rows: {},
    });

    expect(result.output.candidates).toHaveLength(0);
    expect(result.output.coverage[0]?.outcome).toBe("skipped_missing_input");
    expect(result.output.coverage[0]?.reasonCode).toBe("missing_model_artifact");
    const { sourceKind } = result.artifact.inputSummary;
    expect(sourceKind).toBe("blocked_missing_model_artifacts");
    expect(result.artifact.modelDependencies[0]).toMatchObject({
      modelId: "segment_daypart_residuals_v1",
      status: "missing",
    });
  });
});

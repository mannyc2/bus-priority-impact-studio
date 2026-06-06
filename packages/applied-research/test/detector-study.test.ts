import { describe, expect, test } from "bun:test";
import { DEFAULT_REGISTRY_DETECTOR_STUDY_ID, runRegistryDetectorStudy } from "../src/detector-runs";

const FEATURE_COUNT_SUMMARY_KEY = "featureCount";

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

  test("fails fast when the required corpus rows are not supplied", () => {
    expect(() =>
      runRegistryDetectorStudy({
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
      }),
    ).toThrow("Missing speed rows");
  });
});

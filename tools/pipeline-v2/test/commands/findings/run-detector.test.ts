import { describe, expect, test } from "bun:test";
import { runRegistryDetectorStudy } from "@bp/applied-research/detector-runs";
import {
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
  type SegmentDaypartSpeedSourceRow,
} from "@bp/applied-research/feature-resolvers";
import { detectorRunArtifactPath } from "../../../src/commands/findings/run-detector.ts";

const FEATURE_COUNT_SUMMARY_KEY = "featureCount";

function speedRow(input: {
  routeId?: string;
  hour: number;
  travelTime: number;
  speed: number;
  trips?: number;
}): SegmentDaypartSpeedSourceRow {
  return {
    route_id: input.routeId ?? "M15",
    month: "2026-03",
    hour_of_day: input.hour,
    direction: "0",
    stop_order: 10,
    timepoint_stop_id: "s1",
    next_timepoint_stop_id: "s2",
    road_distance_miles: 1,
    average_travel_time_minutes: input.travelTime,
    average_road_speed_mph: input.speed,
    bus_trip_count: input.trips ?? 20,
  };
}

describe("findings run-detector", () => {
  test("runs speed_pace_hotspot through feature contracts", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "speed_pace_hotspot",
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/speed_pace_hotspot-run.json",
        wroteDb: false,
      },
      rows: {
        speedRows: [
          speedRow({ hour: 8, travelTime: 16, speed: 3.75 }),
          speedRow({ hour: 12, travelTime: 5, speed: 12 }),
        ],
      },
    });

    expect(artifact.artifactKind).toBe("registry_detector_run");
    expect(artifact.detectorId).toBe("speed_pace_hotspot");
    expect(artifact.featureContracts.map((contract) => contract.status)).toEqual([
      "resolved",
      "satisfied_by_feature_quality",
    ]);
    expect(artifact.inputSummary[FEATURE_COUNT_SUMMARY_KEY]).toBe(2);
    expect(artifact.outputSummary.candidateCount).toBe(1);
    expect(artifact.outputSummary.coverageCount).toBe(2);
    expect(artifact.outputSummary.hitCount).toBe(1);
    expect(output.candidates[0]?.scopeKind as string | undefined).toBe("segment");
    expect(output.evidence.map((row) => row.evidenceRole as string)).toEqual([
      "primary",
      "counter_evidence",
    ]);
  });

  test("uses the detector run artifact namespace", () => {
    expect(
      detectorRunArtifactPath({
        artifactRoot: "data/artifacts",
        releaseMonth: "2026-03",
        detectorId: "speed_pace_hotspot",
      }),
    ).toBe("data/artifacts/detector-runs/2026-03/speed_pace_hotspot-run.json");
  });

  test("builds route-direction-daypart runtime features for schedule and variability detectors", () => {
    const result = buildRouteDirectionDaypartFeatures({
      observedRows: [
        {
          route_id: "M15",
          month: "2026-03",
          direction: "N",
          daypart: "am_peak",
          runtime_minutes: 50,
          observed_trip_count: 12,
        },
        {
          route_id: "M15",
          month: "2026-03",
          direction: "N",
          daypart: "am_peak",
          runtime_minutes: 70,
          observed_trip_count: 12,
        },
      ],
      scheduledRows: [
        { route_id: "M15", direction: "N", daypart: "am_peak", runtime_minutes: 45 },
        { route_id: "M15", direction: "N", daypart: "am_peak", runtime_minutes: 55 },
      ],
      minObservedTrips: 10,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.scheduledRuntimeMinutes).toBe(50);
    expect(result.features[0]?.observedRuntimeP50Minutes).toBe(60);
    expect(result.features[0]?.observedRuntimeP95Minutes).toBe(69);
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
  });

  test("builds route metric history features for degradation trend execution", () => {
    const result = buildRouteMetricHistoryFeatures({
      releaseMonth: "2026-03",
      historyStartMonth: "2026-01",
      minHistoryPoints: 3,
      rows: [
        {
          route_id: "M15",
          month: "2026-01",
          speed_observation_count: 100,
          average_speed_mph: 8,
        },
        {
          route_id: "M15",
          month: "2026-02",
          speed_observation_count: 100,
          average_speed_mph: 7,
        },
        {
          route_id: "M15",
          month: "2026-03",
          speed_observation_count: 100,
          average_speed_mph: 6,
        },
      ],
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.metricName).toBe("average_speed_mph");
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
    expect(result.features[0]?.points.map((point) => point.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});

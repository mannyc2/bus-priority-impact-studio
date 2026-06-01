import { describe, expect, test } from "bun:test";
import { buildRuntimeTrendScoreVectorArtifact } from "../src/score-vectors";

describe("runtime trend score vectors", () => {
  test("builds detector-native historical vectors from row batches", () => {
    const artifact = buildRuntimeTrendScoreVectorArtifact({
      months: ["2026-01", "2026-02", "2026-03"],
      scheduledRowsByYear: new Map([
        [
          2026,
          [
            { route_id: "M15", direction: "0", daypart: "am_peak", runtime_minutes: 20 },
            { route_id: "M15", direction: "0", daypart: "am_peak", runtime_minutes: 22 },
          ],
        ],
      ]),
      observedRowsByMonth: new Map([
        [
          "2026-01",
          [
            {
              route_id: "M15",
              month: "2026-01",
              direction: "0",
              daypart: "am_peak",
              runtime_minutes: 24,
              observed_trip_count: 40,
            },
          ],
        ],
        [
          "2026-02",
          [
            {
              route_id: "M15",
              month: "2026-02",
              direction: "0",
              daypart: "am_peak",
              runtime_minutes: 28,
              observed_trip_count: 42,
            },
          ],
        ],
        [
          "2026-03",
          [
            {
              route_id: "M15",
              month: "2026-03",
              direction: "0",
              daypart: "am_peak",
              runtime_minutes: 34,
              observed_trip_count: 45,
            },
          ],
        ],
      ]),
      routeMetricHistoryRows: [
        { route_id: "M15", month: "2026-01", speed_observation_count: 40, average_speed_mph: 9 },
        { route_id: "M15", month: "2026-02", speed_observation_count: 40, average_speed_mph: 8 },
        { route_id: "M15", month: "2026-03", speed_observation_count: 40, average_speed_mph: 7 },
      ],
      startMonth: "2026-01",
      endMonth: "2026-03",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "runtime-trend-score-vectors.json",
      candidateLimit: 10,
    });

    expect(artifact.artifactKind).toBe("runtime_trend_detector_score_vectors");
    expect(artifact.summary.detectorCount).toBe(3);
    expect(artifact.detectors.map((detector) => detector.detectorId)).toEqual([
      "schedule_mismatch",
      "travel_time_variability",
      "degradation_trend",
    ]);
    expect(artifact.detectors.every((detector) => detector.monthly.length === 3)).toBe(true);
    expect(artifact.summary.totalFeatureCount).toBeGreaterThan(0);
  });
});

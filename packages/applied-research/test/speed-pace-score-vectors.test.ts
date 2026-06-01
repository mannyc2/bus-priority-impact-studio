import { describe, expect, test } from "bun:test";
import {
  buildSpeedPaceScoreVectorArtifact,
  type SegmentDaypartSpeedSourceRow,
} from "@bp/applied-research/score-vectors";

function row(overrides: Partial<SegmentDaypartSpeedSourceRow>): SegmentDaypartSpeedSourceRow {
  return {
    route_id: "M15",
    month: "2026-03",
    hour_of_day: 8,
    direction: "0",
    stop_order: 10,
    timepoint_stop_id: "s1",
    next_timepoint_stop_id: "s2",
    road_distance_miles: 1,
    average_travel_time_minutes: 16,
    average_road_speed_mph: 3.75,
    bus_trip_count: 20,
    ...overrides,
  };
}

describe("speed pace score vectors", () => {
  test("summarizes historical speed_pace_hotspot feature and candidate support from row batches", () => {
    const rowsByMonth = new Map<string, SegmentDaypartSpeedSourceRow[]>([
      [
        "2026-02",
        [
          row({ month: "2026-02", hour_of_day: 8, average_travel_time_minutes: 16 }),
          row({ month: "2026-02", hour_of_day: 12, average_travel_time_minutes: 5 }),
        ],
      ],
      [
        "2026-03",
        [
          row({ month: "2026-03", hour_of_day: 8, average_travel_time_minutes: 16 }),
          row({ month: "2026-03", hour_of_day: 12, average_travel_time_minutes: 5 }),
        ],
      ],
    ]);

    const artifact = buildSpeedPaceScoreVectorArtifact({
      rowsByMonth,
      months: ["2026-02", "2026-03"],
      startMonth: "2026-02",
      endMonth: "2026-03",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath:
        "data/artifacts/speed-pace-score-vectors/2026-02_to_2026-03/2026-03/speed-pace-score-vectors.json",
    });

    expect(artifact.artifactKind).toBe("speed_pace_hotspot_score_vectors");
    expect(artifact.detectorId).toBe("speed_pace_hotspot");
    expect(artifact.summary.usableMonthCount).toBe(2);
    expect(artifact.summary.totalFeatureCount).toBe(4);
    expect(artifact.summary.totalCandidateCount).toBe(2);
    expect(artifact.summary.routeCount).toBe(1);
    expect(artifact.summary.releaseFeatureCount).toBe(2);
    expect(artifact.summary.releaseCandidateCount).toBe(1);
    expect(artifact.monthly.map((month) => month.month)).toEqual(["2026-02", "2026-03"]);
    expect(artifact.releaseTopCandidates[0]?.routeId).toBe("M15");
  });
});

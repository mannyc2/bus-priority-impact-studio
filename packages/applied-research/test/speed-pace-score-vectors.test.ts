import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildSpeedPaceScoreVectorArtifact,
  buildSpeedPaceScoreVectorStudy,
  type SegmentDaypartSpeedSourceRow,
} from "@bp/applied-research/score-vectors";
import { speedPaceScoreVectorPath } from "../src/artifacts";
import { loadSpeedPaceScoreVectorLocalDbRows } from "../src/local-db";

function createDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
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
  `);
  const insert = sqlite.query(`
    INSERT INTO local_route_segment_speed (
      route_id,
      month,
      hour_of_day,
      direction,
      stop_order,
      timepoint_stop_id,
      next_timepoint_stop_id,
      road_distance_miles,
      average_travel_time_minutes,
      average_road_speed_mph,
      bus_trip_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const month of ["2026-02", "2026-03"]) {
    insert.run("M15", month, 8, "0", 10, "s1", "s2", 1, 16, 3.75, 20);
    insert.run("M15", month, 12, "0", 10, "s1", "s2", 1, 5, 12, 20);
    // Downstream terminal segment: free-flowing, gated as terminal, makes s1->s2 interior.
    insert.run("M15", month, 8, "0", 20, "s2", "s3", 1, 5, 12, 20);
    insert.run("M15", month, 12, "0", 20, "s2", "s3", 1, 5, 12, 20);
  }
  return sqlite;
}

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

// Highest-stop-order segment in the direction: free-flowing, so it is gated as terminal and never a
// candidate, while making the slower s1->s2 segment interior (non-terminal).
function downstreamRow(
  overrides: Partial<SegmentDaypartSpeedSourceRow>,
): SegmentDaypartSpeedSourceRow {
  return row({
    stop_order: 20,
    timepoint_stop_id: "s2",
    next_timepoint_stop_id: "s3",
    average_travel_time_minutes: 5,
    average_road_speed_mph: 12,
    ...overrides,
  });
}

describe("speed pace score vectors", () => {
  test("summarizes historical speed_pace_hotspot feature and candidate support from row batches", () => {
    const rowsByMonth = new Map<string, SegmentDaypartSpeedSourceRow[]>([
      [
        "2026-02",
        [
          row({ month: "2026-02", hour_of_day: 8, average_travel_time_minutes: 16 }),
          row({ month: "2026-02", hour_of_day: 12, average_travel_time_minutes: 5 }),
          // Downstream terminal segment (highest stop order): present so the s1->s2 segment is
          // interior, and itself gated as terminal (and not slow) so it emits no candidate.
          downstreamRow({ month: "2026-02", hour_of_day: 8 }),
          downstreamRow({ month: "2026-02", hour_of_day: 12 }),
        ],
      ],
      [
        "2026-03",
        [
          row({ month: "2026-03", hour_of_day: 8, average_travel_time_minutes: 16 }),
          row({ month: "2026-03", hour_of_day: 12, average_travel_time_minutes: 5 }),
          downstreamRow({ month: "2026-03", hour_of_day: 8 }),
          downstreamRow({ month: "2026-03", hour_of_day: 12 }),
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
    expect(artifact.summary.totalFeatureCount).toBe(8);
    expect(artifact.summary.totalCandidateCount).toBe(2);
    expect(artifact.summary.routeCount).toBe(1);
    expect(artifact.summary.releaseFeatureCount).toBe(4);
    expect(artifact.summary.releaseCandidateCount).toBe(1);
    expect(artifact.monthly.map((month) => month.month)).toEqual(["2026-02", "2026-03"]);
    expect(artifact.releaseTopCandidates[0]?.routeId).toBe("M15");
  });

  test("builds a speed-pace study from local SQLite segment speed rows", () => {
    const sqlite = createDb();
    try {
      const rows = loadSpeedPaceScoreVectorLocalDbRows({
        sqlite,
        startMonth: "2026-02",
        endMonth: "2026-03",
      });
      const artifact = buildSpeedPaceScoreVectorStudy({
        rows,
        metadata: {
          startMonth: "2026-02",
          endMonth: "2026-03",
          releaseMonth: "2026-03",
          generatedAt: "2026-06-01T00:00:00.000Z",
          dbPath: "data/local/pipeline.sqlite",
          artifactPath:
            "data/artifacts/speed-pace-score-vectors/2026-02_to_2026-03/2026-03/speed-pace-score-vectors.json",
        },
      });

      expect(artifact.artifactKind).toBe("speed_pace_hotspot_score_vectors");
      expect(artifact.detectorId).toBe("speed_pace_hotspot");
      expect(artifact.summary.usableMonthCount).toBe(2);
      expect(artifact.summary.totalFeatureCount).toBe(8);
      expect(artifact.summary.totalCandidateCount).toBe(2);
      expect(artifact.summary.routeCount).toBe(1);
      expect(artifact.summary.releaseFeatureCount).toBe(4);
      expect(artifact.summary.releaseCandidateCount).toBe(1);
      expect(artifact.monthly.map((month) => month.month)).toEqual(["2026-02", "2026-03"]);
      expect(artifact.releaseTopCandidates[0]?.routeId).toBe("M15");
    } finally {
      sqlite.close();
    }
  });

  test("uses the speed-pace-score-vectors namespace", () => {
    expect(
      speedPaceScoreVectorPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/speed-pace-score-vectors/2023-04_to_2026-03/2026-03/speed-pace-score-vectors.json",
    );
  });
});

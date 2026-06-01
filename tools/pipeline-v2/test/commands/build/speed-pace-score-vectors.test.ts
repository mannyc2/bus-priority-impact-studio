import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildSpeedPaceScoreVectorArtifact } from "@bp/applied-research/score-vectors";
import { speedPaceScoreVectorPath } from "../../../src/commands/build/speed-pace-score-vectors.ts";
import type { SegmentDaypartSpeedSourceRow } from "@bp/applied-research/score-vectors";

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
  }
  return sqlite;
}

describe("build speed pace score vectors", () => {
  test("summarizes historical speed_pace_hotspot feature and candidate support", () => {
    const sqlite = createDb();
    try {
      const rows = sqlite
        .query("SELECT * FROM local_route_segment_speed ORDER BY month, hour_of_day")
        .all() as SegmentDaypartSpeedSourceRow[];
      const rowsByMonth = new Map<string, SegmentDaypartSpeedSourceRow[]>();
      for (const row of rows) {
        const month = typeof row.month === "string" ? row.month : "";
        const monthRows = rowsByMonth.get(month) ?? [];
        monthRows.push(row);
        rowsByMonth.set(month, monthRows);
      }
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

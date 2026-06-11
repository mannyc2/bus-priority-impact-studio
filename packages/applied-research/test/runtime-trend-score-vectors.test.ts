import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { runtimeTrendScoreVectorPath } from "../src/artifacts";
import { loadRuntimeTrendScoreVectorLocalDbRows } from "../src/local-db";
import {
  buildRuntimeTrendScoreVectorArtifact,
  buildRuntimeTrendScoreVectorStudy,
} from "../src/score-vectors";

function createDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      direction TEXT NOT NULL,
      hour_of_day INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      average_travel_time_minutes REAL NOT NULL,
      bus_trip_count INTEGER NOT NULL
    );

    CREATE TABLE local_route_schedule_stop (
      source_year INTEGER NOT NULL,
      route_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      day_type TEXT NOT NULL,
      block_id TEXT NOT NULL,
      shape_id TEXT NOT NULL,
      schedule_date TEXT NOT NULL,
      trip_headsign TEXT NOT NULL,
      origin INTEGER NOT NULL,
      destination INTEGER NOT NULL,
      schedule_time TEXT NOT NULL
    );

    CREATE TABLE local_route_month_trend (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      speed_observation_count INTEGER NOT NULL,
      average_speed_mph REAL NOT NULL
    );
  `);
  const insertRuntime = sqlite.query(`
    INSERT INTO local_route_segment_speed (
      route_id,
      month,
      direction,
      hour_of_day,
      timestamp,
      average_travel_time_minutes,
      bus_trip_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [month, runtime] of [
    ["2026-01", 24],
    ["2026-02", 28],
    ["2026-03", 34],
  ] as const) {
    insertRuntime.run("M15", month, "0", 8, `${month}-10T08:00:00.000Z`, runtime, 40);
  }

  const insertSchedule = sqlite.query(`
    INSERT INTO local_route_schedule_stop (
      source_year,
      route_id,
      direction,
      day_type,
      block_id,
      shape_id,
      schedule_date,
      trip_headsign,
      origin,
      destination,
      schedule_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSchedule.run(
    2026,
    "M15",
    "0",
    "weekday",
    "block-1",
    "shape-1",
    "2026-03-10",
    "Downtown",
    1,
    0,
    "2026-03-10T08:00:00.000Z",
  );
  insertSchedule.run(
    2026,
    "M15",
    "0",
    "weekday",
    "block-1",
    "shape-1",
    "2026-03-10",
    "Downtown",
    0,
    1,
    "2026-03-10T08:20:00.000Z",
  );

  const insertTrend = sqlite.query(`
    INSERT INTO local_route_month_trend (
      route_id,
      month,
      speed_observation_count,
      average_speed_mph
    ) VALUES (?, ?, ?, ?)
  `);
  insertTrend.run("M15", "2026-01", 40, 9);
  insertTrend.run("M15", "2026-02", 40, 8);
  insertTrend.run("M15", "2026-03", 40, 7);
  return sqlite;
}

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

  test("builds a runtime-trend study from local SQLite runtime, schedule, and history rows", () => {
    const sqlite = createDb();
    try {
      const rows = loadRuntimeTrendScoreVectorLocalDbRows({
        sqlite,
        startMonth: "2026-01",
        endMonth: "2026-03",
      });
      const artifact = buildRuntimeTrendScoreVectorStudy({
        rows,
        metadata: {
          startMonth: "2026-01",
          endMonth: "2026-03",
          releaseMonth: "2026-03",
          generatedAt: "2026-06-01T00:00:00.000Z",
          dbPath: null,
          artifactPath: "runtime-trend-score-vectors.json",
          candidateLimit: 10,
        },
      });

      expect(rows.months).toEqual(["2026-01", "2026-02", "2026-03"]);
      expect(rows.scheduledRowsByYear.get(2026)).toHaveLength(1);
      expect(rows.observedRowsByMonth.get("2026-03")).toHaveLength(1);
      expect(rows.routeMetricHistoryRows).toHaveLength(3);
      expect(artifact.artifactKind).toBe("runtime_trend_detector_score_vectors");
      expect(artifact.summary.detectorCount).toBe(3);
      expect(artifact.summary.totalFeatureCount).toBeGreaterThan(0);
    } finally {
      sqlite.close();
    }
  });

  test("uses the runtime-trend-score-vectors namespace", () => {
    expect(
      runtimeTrendScoreVectorPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/runtime-trend-score-vectors/2023-04_to_2026-03/2026-03/runtime-trend-score-vectors.json",
    );
  });
});

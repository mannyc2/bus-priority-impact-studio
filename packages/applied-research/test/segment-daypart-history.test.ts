import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { segmentDaypartHistoryArtifactPath } from "../src/artifacts";
import { buildSegmentDaypartHistoryArtifact } from "../src/feature-history";
import { loadSegmentDaypartHistoryLocalDbRows } from "../src/local-db";

describe("segment daypart feature history", () => {
  test("builds compact segment daypart history artifacts", () => {
    const artifact = buildSegmentDaypartHistoryArtifact({
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          segment_id: "M15:N:1:401001:401002",
          direction: "N",
          daypart: "am_peak",
          observation_count: 2,
          traversal_count: 20,
          average_speed_mph: 6.5,
          average_travel_time_minutes: 12,
          average_road_distance_miles: 1.2,
        },
      ],
      startMonth: "2026-01",
      endMonth: "2026-03",
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/segment-daypart-history.json",
    });

    expect(artifact.summary).toMatchObject({
      featureCount: 1,
      routeCount: 1,
      dayparts: ["am_peak", "midday", "pm_peak", "off_peak"],
    });
    expect(artifact.window.monthCount).toBe(1);
    expect(artifact.features[0]).toMatchObject({
      routeId: "M15",
      segmentId: "M15:N:1:401001:401002",
      daypart: "am_peak",
      traversalCount: 20,
      averageSpeedMph: 6.5,
    });
  });

  test("loads segment daypart rows from local SQLite", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_segment_speed (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL,
          direction TEXT NOT NULL,
          stop_order INTEGER NOT NULL,
          timepoint_stop_id TEXT NOT NULL,
          next_timepoint_stop_id TEXT NOT NULL,
          hour_of_day INTEGER NOT NULL,
          bus_trip_count INTEGER NOT NULL,
          average_road_speed_mph REAL,
          average_travel_time_minutes REAL,
          road_distance_miles REAL
        );
        INSERT INTO local_route_segment_speed VALUES
          ('M15', '2026-03', 'N', 1, '401001', '401002', 8, 10, 6.0, 12.0, 1.1),
          ('M15', '2026-03', 'N', 1, '401001', '401002', 9, 20, 8.0, 10.0, 1.3),
          ('M15', '2026-03', 'N', 1, '401001', '401002', 12, 5, 9.0, 8.0, 1.2),
          ('B1', '2025-12', 'S', 1, '301001', '301002', 8, 1, 7.0, 11.0, 1.0);
      `);

      const rows = loadSegmentDaypartHistoryLocalDbRows({
        sqlite,
        startMonth: "2026-01",
        endMonth: "2026-03",
      });

      expect(rows.map((row) => [row.route_id, row.daypart, row.observation_count])).toEqual([
        ["M15", "am_peak", 2],
        ["M15", "midday", 1],
      ]);
      expect(rows[0]).toMatchObject({
        segment_id: "M15:N:1:401001:401002",
        traversal_count: 30,
        average_speed_mph: 7,
        average_travel_time_minutes: 11,
      });
      expect(rows[0]?.average_road_distance_miles).toBeCloseTo(1.2);
    } finally {
      sqlite.close();
    }
  });

  test("owns the segment daypart history artifact path", () => {
    expect(
      segmentDaypartHistoryArtifactPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-feature-history/2023-04_to_2026-03/segment-daypart-history.json",
    );
  });
});

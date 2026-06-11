import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { routeSpeedSpineArtifactPath } from "../src/artifacts";
import {
  buildRouteSpeedSpineArtifact,
  classifyRouteSpeedSpineArtifact,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineSourceRow,
} from "../src/feature-history";
import {
  loadCurrentRouteSpeedSpineCatalogRouteIds,
  loadRouteSpeedSpineCandidateLocalDbRows,
  loadRouteSpeedSpineLocalDbRows,
} from "../src/local-db";

function row(
  input: Partial<RouteSpeedSpineSourceRow> & {
    month: string;
    direction: string;
    stop_order: number;
    timepoint_stop_id: string;
    timepoint_stop_name: string;
    timepoint_stop_latitude: number;
    timepoint_stop_longitude: number;
    next_timepoint_stop_id: string;
    next_timepoint_stop_name: string;
    next_timepoint_stop_latitude: number;
    next_timepoint_stop_longitude: number;
  },
): RouteSpeedSpineSourceRow {
  return {
    route_id: "B41",
    source_row_count: 10,
    bus_trip_count: 100,
    average_road_speed_mph: 8,
    average_travel_time_minutes: 4,
    average_road_distance_miles: 0.5,
    ...input,
  };
}

describe("route speed spine feature history", () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  test("collapses nearby renamed timepoints into one geographic segment", () => {
    const artifact = buildRouteSpeedSpineArtifact({
      routeId: "B41",
      rows: [
        row({
          month: "2025-12",
          direction: "N",
          stop_order: 19,
          timepoint_stop_id: "303222",
          timepoint_stop_name: "FLATBUSH AV/TROY AV",
          timepoint_stop_latitude: 40.62492,
          timepoint_stop_longitude: -73.93612,
          next_timepoint_stop_id: "303232",
          next_timepoint_stop_name: "FLATBUSH AV/NOSTRAND AV",
          next_timepoint_stop_latitude: 40.6328,
          next_timepoint_stop_longitude: -73.9475,
        }),
        row({
          month: "2026-01",
          direction: "N",
          stop_order: 19,
          timepoint_stop_id: "303222",
          timepoint_stop_name: "FLATBUSH AV/TROY AV",
          timepoint_stop_latitude: 40.62492,
          timepoint_stop_longitude: -73.93612,
          next_timepoint_stop_id: "307839",
          next_timepoint_stop_name: "FLATBUSH AV / E 31 ST",
          next_timepoint_stop_latitude: 40.63206,
          next_timepoint_stop_longitude: -73.94672,
        }),
      ],
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
      startMonth: "2025-12",
      endMonth: "2026-01",
      toleranceMeters: 125,
    });

    expect(artifact.validation.status).toBe("pass");
    expect(artifact.summary.rawSegmentKeyCount).toBe(2);
    expect(artifact.summary.rawStopPairCount).toBe(2);
    expect(artifact.summary.spineSegmentCount).toBe(1);
    expect(artifact.summary.mergedNodeCount).toBe(1);
    expect(artifact.segments[0]?.raw.rawStopPairCount).toBe(2);
    expect(artifact.monthCoverage.map((month) => month.spineSegmentCount)).toEqual([1, 1]);
  });

  test("loads route speed spine source rows from local SQLite", () => {
    sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_segment_speed (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL,
        direction TEXT NOT NULL,
        stop_order INTEGER NOT NULL,
        timepoint_stop_id TEXT,
        timepoint_stop_name TEXT,
        timepoint_stop_latitude REAL,
        timepoint_stop_longitude REAL,
        next_timepoint_stop_id TEXT,
        next_timepoint_stop_name TEXT,
        next_timepoint_stop_latitude REAL,
        next_timepoint_stop_longitude REAL,
        bus_trip_count INTEGER,
        average_road_speed_mph REAL,
        average_travel_time_minutes REAL,
        road_distance_miles REAL
      );

      INSERT INTO local_route_segment_speed
        (route_id, month, direction, stop_order, timepoint_stop_id, timepoint_stop_name,
         timepoint_stop_latitude, timepoint_stop_longitude, next_timepoint_stop_id,
         next_timepoint_stop_name, next_timepoint_stop_latitude, next_timepoint_stop_longitude,
         bus_trip_count, average_road_speed_mph, average_travel_time_minutes, road_distance_miles)
      VALUES
        ('B41', '2026-01', 'N', 1, 'a', 'A', 40.1, -73.1, 'b', 'B', 40.2, -73.2, 10, 8, 4, 0.5),
        ('B41', '2026-01', 'N', 1, 'a', 'A', 40.1, -73.1, 'b', 'B', 40.2, -73.2, 30, 10, 6, 0.7),
        ('B42', '2026-01', 'N', 1, 'x', 'X', 40.3, -73.3, 'y', 'Y', 40.4, -73.4, 50, 12, 8, 1.1);
    `);

    expect(
      loadRouteSpeedSpineLocalDbRows({
        sqlite,
        routeId: "B41",
        startMonth: "2026-01",
        endMonth: "2026-01",
      }),
    ).toEqual([
      {
        route_id: "B41",
        month: "2026-01",
        direction: "N",
        stop_order: 1,
        timepoint_stop_id: "a",
        timepoint_stop_name: "A",
        timepoint_stop_latitude: 40.1,
        timepoint_stop_longitude: -73.1,
        next_timepoint_stop_id: "b",
        next_timepoint_stop_name: "B",
        next_timepoint_stop_latitude: 40.2,
        next_timepoint_stop_longitude: -73.2,
        source_row_count: 2,
        bus_trip_count: 40,
        average_road_speed_mph: 9.5,
        average_travel_time_minutes: 5.5,
        average_road_distance_miles: 0.65,
      },
    ]);
  });

  test("loads candidate and catalog route ids from local SQLite", () => {
    sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_segment_speed (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL
      );
      CREATE TABLE local_route_catalog (
        route_id TEXT NOT NULL
      );

      INSERT INTO local_route_segment_speed (route_id, month)
      VALUES
        ('B41', '2026-01'),
        ('B41', '2026-02'),
        ('B42', '2026-01'),
        ('M15', '2025-12');

      INSERT INTO local_route_catalog (route_id)
      VALUES ('b41'), ('M15'), ('Q44+');
    `);

    expect(
      loadRouteSpeedSpineCandidateLocalDbRows({
        sqlite,
        startMonth: "2026-01",
        endMonth: "2026-12",
        routeIds: ["B41", "B42"],
      }),
    ).toEqual([
      {
        routeId: "B41",
        sourceRowCount: 2,
        monthCount: 2,
        startMonth: "2026-01",
        endMonth: "2026-02",
      },
      {
        routeId: "B42",
        sourceRowCount: 1,
        monthCount: 1,
        startMonth: "2026-01",
        endMonth: "2026-01",
      },
    ]);
    expect(loadCurrentRouteSpeedSpineCatalogRouteIds(sqlite)).toEqual(
      new Set(["B41", "M15", "Q44+"]),
    );
  });

  test("classifies route speed spine readiness", () => {
    const artifact = {
      summary: {
        monthCount: 10,
        spineSegmentCount: 8,
        monthsWithPartialSpineCoverageCount: 2,
        monthsWithRawKeyDriftCount: 1,
      },
      monthCoverage: [
        ...Array.from({ length: 8 }, () => ({ coverageShare: 1 })),
        { coverageShare: 0.875 },
        { coverageShare: 0.875 },
      ],
      validation: { status: "pass" },
    } as RouteSpeedSpineArtifact;

    expect(classifyRouteSpeedSpineArtifact(artifact)).toEqual({
      readiness: "series_ready_with_gaps",
      reasons: ["partial_months_within_gap_tolerance"],
      coverage: {
        minCoverageShare: 0.875,
        meanCoverageShare: 0.975,
        fullCoverageMonthCount: 8,
        partialCoverageMonthCount: 2,
        partialCoverageMonthShare: 0.2,
        rawKeyDriftMonthCount: 1,
        rawKeyDriftMonthShare: 0.1,
      },
    });
  });

  test("uses the Studio v2 route speed-spine namespace", () => {
    expect(routeSpeedSpineArtifactPath({ artifactRoot: "data/artifacts", routeSlug: "b41" })).toBe(
      "data/artifacts/studio/v2/routes/b41/speed-spine.json",
    );
  });
});

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { routeSpeedHistoryArtifactPath, routeSpeedHistoryManifestPath } from "../src/artifacts";
import {
  buildRouteExpectedServiceContext,
  buildRouteSpeedHistoryArtifact,
  buildRouteSpeedHistoryBatchManifest,
  parseRouteSpeedHistoryReadinessList,
  type RouteSpeedHistoryBatchRoute,
  type RouteSpeedHistorySourceRow,
  type RouteSpeedSpineArtifact,
  summarizeRouteSpeedHistoryBatch,
} from "../src/feature-history";
import {
  loadCompleteRouteSpeedScheduleMonths,
  loadRouteSpeedHistoryLocalDbRows,
  loadRouteSpeedScheduleLocalDbRows,
} from "../src/local-db";

function spine(): RouteSpeedSpineArtifact {
  return {
    artifactKind: "studio_route_speed_spine",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    routeId: "B41",
    routeSlug: "b41",
    source: {
      table: "local_route_segment_speed",
      dbPath: "data/local/pipeline.sqlite",
      startMonth: "2026-01",
      endMonth: "2026-02",
      toleranceMeters: 110,
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
    },
    summary: {
      monthCount: 2,
      sourceRowCount: 20,
      busTripCount: 200,
      nodeCount: 2,
      spineSegmentCount: 1,
      rawSegmentKeyCount: 1,
      rawStopPairCount: 1,
      monthsWithRawKeyDriftCount: 0,
      monthsWithPartialSpineCoverageCount: 0,
      mergedNodeCount: 0,
      segmentWithRawVariantCount: 0,
      issueCount: 0,
    },
    nodes: [],
    segments: [
      {
        segmentId: "b41-n-node-001-node-002",
        direction: "N",
        displayOrder: 10,
        fromNodeId: "node-001",
        toNodeId: "node-002",
        label: "A to B",
        months: ["2026-01", "2026-02"],
        monthCount: 2,
        sourceRowCount: 20,
        busTripCount: 200,
        averageRoadDistanceMiles: 0.5,
        averageSpeedMph: 10,
        stopOrder: { min: 10, median: 10, max: 10, values: [10], changed: false },
        raw: {
          rawSegmentKeyCount: 1,
          rawStopPairCount: 1,
          sourceStopPairs: [
            {
              fromStopId: "a",
              fromStopName: "A",
              toStopId: "b",
              toStopName: "B",
              stopOrders: [10],
              months: ["2026-01", "2026-02"],
              sourceRowCount: 20,
            },
          ],
        },
      },
    ],
    monthCoverage: [
      {
        month: "2026-01",
        sourceRowCount: 10,
        busTripCount: 100,
        rawSegmentKeyCount: 1,
        rawStopPairCount: 1,
        spineSegmentCount: 1,
        coverageShare: 1,
      },
      {
        month: "2026-02",
        sourceRowCount: 10,
        busTripCount: 100,
        rawSegmentKeyCount: 1,
        rawStopPairCount: 1,
        spineSegmentCount: 1,
        coverageShare: 1,
      },
    ],
    validation: { status: "pass", issues: [] },
  };
}

function row(input: {
  month: string;
  daypart: RouteSpeedHistorySourceRow["daypart"];
  average_speed_mph: number;
}): RouteSpeedHistorySourceRow {
  return {
    route_id: "B41",
    month: input.month,
    direction: "N",
    stop_order: 10,
    timepoint_stop_id: "a",
    next_timepoint_stop_id: "b",
    daypart: input.daypart,
    observation_count: 5,
    traversal_count: 50,
    average_speed_mph: input.average_speed_mph,
    average_travel_time_minutes: 3,
    average_road_distance_miles: 0.5,
  };
}

describe("route speed history feature artifact", () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  test("maps source rows through the stable spine and emits explicit missing cells", () => {
    const artifact = buildRouteSpeedHistoryArtifact({
      routeId: "B41",
      spine: spine(),
      rows: [
        row({ month: "2026-01", daypart: "am_peak", average_speed_mph: 8 }),
        row({ month: "2026-02", daypart: "am_peak", average_speed_mph: 12 }),
      ],
      expectedService: {
        completeMonths: new Set(["2026-01", "2026-02"]),
        expectedCellKeys: new Set([
          "b41-n-node-001-node-002|2026-01|am_peak",
          "b41-n-node-001-node-002|2026-02|am_peak",
        ]),
        routeScheduleRowCount: 4,
        matchedSchedulePairCount: 2,
        unmatchedSchedulePairCount: 0,
      },
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      speedSpinePath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-history.json",
    });

    expect(artifact.summary).toMatchObject({
      cellCount: 8,
      expectedCellCount: 2,
      availableExpectedCellCount: 2,
      notExpectedCellCount: 6,
      availableCellCount: 2,
      missingCellCount: 0,
    });
    expect(
      artifact.cells.find((cell) => cell.month === "2026-01" && cell.daypart === "am_peak"),
    ).toMatchObject({
      status: "available",
      averageSpeedMph: 8,
      segmentDaypartMeanSpeedMph: 10,
      deltaFromSegmentDaypartMeanMph: -2,
      pctFromSegmentDaypartMean: -0.2,
    });
  });

  test("derives expected service cells and loads local history/schedule rows", () => {
    sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_segment_speed (
        route_id TEXT,
        month TEXT,
        direction TEXT,
        stop_order INTEGER,
        timepoint_stop_id TEXT,
        next_timepoint_stop_id TEXT,
        hour_of_day INTEGER,
        bus_trip_count INTEGER,
        average_road_speed_mph REAL,
        average_travel_time_minutes REAL,
        road_distance_miles REAL
      );
      CREATE TABLE local_route_schedule_stop (
        source_year INTEGER,
        route_id TEXT,
        schedule_date TEXT,
        direction TEXT,
        shape_id TEXT,
        stop_sequence INTEGER,
        stop_id TEXT,
        schedule_time TEXT,
        block_id TEXT,
        origin INTEGER,
        destination INTEGER
      );

      INSERT INTO local_route_segment_speed
      VALUES ('B41', '2026-01', 'N', 10, 'a', 'b', 7, 20, 8, 4, 0.5);

      INSERT INTO local_route_schedule_stop
      VALUES
        (2026, 'B41', '2026-01-01T00:00:00.000', 'N', 'shape', 1, 'a', '2026-01-01T07:00:00.000', 'block', 1, 0),
        (2026, 'B41', '2026-01-01T00:00:00.000', 'N', 'shape', 2, 'b', '2026-01-01T07:05:00.000', 'block', 0, 1);
    `);

    const historyRows = loadRouteSpeedHistoryLocalDbRows({
      sqlite,
      routeId: "B41",
      startMonth: "2026-01",
      endMonth: "2026-01",
    });
    const scheduleRows = loadRouteSpeedScheduleLocalDbRows({
      sqlite,
      routeId: "B41",
      startMonth: "2026-01",
      endMonth: "2026-01",
    });
    const context = buildRouteExpectedServiceContext({
      spine: spine(),
      scheduleRows,
      completeMonths: new Set(["2026-01"]),
    });

    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.daypart).toBe("am_peak");
    expect(scheduleRows).toHaveLength(2);
    expect(context.expectedCellKeys).toContain("b41-n-node-001-node-002|2026-01|am_peak");
    expect(
      loadCompleteRouteSpeedScheduleMonths({
        sqlite,
        startMonth: "2026-01",
        endMonth: "2026-01",
      }),
    ).toEqual(new Set());
  });

  test("uses the Studio v2 route speed-history namespace", () => {
    expect(
      routeSpeedHistoryArtifactPath({ artifactRoot: "data/artifacts", routeSlug: "b41" }),
    ).toBe("data/artifacts/studio/v2/routes/b41/speed-history.json");
    expect(
      routeSpeedHistoryManifestPath({
        artifactRoot: "data/artifacts",
        startMonth: "2026-01",
        endMonth: null,
      }),
    ).toBe("data/artifacts/studio/v2/speed-histories/2026-01_to_latest/manifest.json");
  });

  test("parses readiness filters for the route speed-history batch", () => {
    expect(parseRouteSpeedHistoryReadinessList(undefined)).toEqual([
      "series_ready",
      "series_ready_with_gaps",
      "needs_pattern_review",
    ]);
    expect(parseRouteSpeedHistoryReadinessList("series_ready,failed,nope")).toEqual([
      "series_ready",
      "failed",
    ]);
  });

  test("summarizes and builds route speed-history batch manifests", () => {
    const routes = [
      {
        routeId: "B41",
        routeSlug: "b41",
        readiness: "series_ready",
        status: "written",
        reasons: [],
        spinePath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
        artifactPath: "data/artifacts/studio/v2/routes/b41/speed-history.json",
        monthCount: 2,
        segmentCount: 1,
        cellCount: 8,
        availableCellCount: 2,
        missingCellCount: 6,
        unmappedRawKeyCount: 1,
      },
      {
        routeId: "B42",
        routeSlug: "b42",
        readiness: "needs_pattern_review",
        status: "blocked",
        reasons: ["spine_artifact_not_written"],
        spinePath: "data/artifacts/studio/v2/routes/b42/speed-spine.json",
        artifactPath: "data/artifacts/studio/v2/routes/b42/speed-history.json",
        monthCount: null,
        segmentCount: null,
        cellCount: null,
        availableCellCount: null,
        missingCellCount: null,
        unmappedRawKeyCount: null,
      },
    ] satisfies RouteSpeedHistoryBatchRoute[];

    expect(summarizeRouteSpeedHistoryBatch(routes)).toEqual({
      routeCount: 2,
      writtenRouteCount: 1,
      skippedExistingRouteCount: 0,
      blockedRouteCount: 1,
      failedRouteCount: 0,
      artifactReadyRouteCount: 1,
      totalCellCount: 8,
      availableCellCount: 2,
      missingCellCount: 6,
      unmappedRawKeyCount: 1,
    });
    expect(
      buildRouteSpeedHistoryBatchManifest({
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactRoot: "data/artifacts",
        spineManifestPath: "data/artifacts/studio/v2/speed-spines/2026-01_to_latest/manifest.json",
        startMonth: "2026-01",
        endMonth: null,
        readiness: ["series_ready"],
        force: false,
        routeFilterCount: 0,
        completeScheduleMonthCount: 1,
        routes,
      }),
    ).toMatchObject({
      artifactKind: "studio_route_speed_history_manifest",
      source: {
        readiness: ["series_ready"],
        expectedService: { completeMonthCount: 1 },
      },
      summary: {
        routeCount: 2,
        artifactReadyRouteCount: 1,
      },
    });
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeSpeedHistoryArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteExpectedServiceContext,
  buildRouteSpeedHistoryArtifact,
  type RouteSpeedHistorySourceRow,
  type RouteSpeedSpineArtifact,
} from "@bp/analytics/feature-history";

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

describe("studio route speed history", () => {
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
    });

    expect(artifact.summary).toMatchObject({
      monthCount: 2,
      segmentCount: 1,
      daypartCount: 4,
      cellCount: 8,
      expectedCellCount: 2,
      availableExpectedCellCount: 2,
      missingExpectedCellCount: 0,
      notExpectedCellCount: 6,
      availableCellCount: 2,
      missingCellCount: 0,
      unmappedRawKeyCount: 0,
    });
    const january = artifact.cells.find(
      (cell) => cell.month === "2026-01" && cell.daypart === "am_peak",
    );
    expect(january).toMatchObject({
      status: "available",
      averageSpeedMph: 8,
      segmentDaypartMeanSpeedMph: 10,
      deltaFromSegmentDaypartMeanMph: -2,
      pctFromSegmentDaypartMean: -0.2,
    });
    const missing = artifact.cells.find(
      (cell) => cell.month === "2026-01" && cell.daypart === "midday",
    );
    expect(missing).toMatchObject({ status: "not_expected", averageSpeedMph: null });
    expect(artifact.source.expectedService).toMatchObject({
      table: "local_route_schedule_stop",
      completeMonths: ["2026-01", "2026-02"],
      incompleteMonths: [],
      routeScheduleRowCount: 4,
      matchedSchedulePairCount: 2,
      unmatchedSchedulePairCount: 0,
    });
  });

  test("treats missing cells as source missing without schedule proof", () => {
    const artifact = buildRouteSpeedHistoryArtifact({
      routeId: "B41",
      spine: spine(),
      rows: [row({ month: "2026-01", daypart: "am_peak", average_speed_mph: 8 })],
    });

    expect(artifact.summary).toMatchObject({
      expectedCellCount: 8,
      availableExpectedCellCount: 1,
      missingExpectedCellCount: 7,
      notExpectedCellCount: 0,
      availableCellCount: 1,
      missingCellCount: 7,
    });
    expect(artifact.cells.find((cell) => cell.daypart === "midday")).toMatchObject({
      status: "source_missing",
    });
  });

  test("derives expected service cells from schedule stop pairs", () => {
    const context = buildRouteExpectedServiceContext({
      spine: spine(),
      completeMonths: new Set(["2026-01"]),
      scheduleRows: [
        {
          schedule_date: "2026-01-02T00:00:00.000",
          direction: "N",
          shape_id: "B410001",
          stop_sequence: 1,
          stop_id: "a",
          schedule_time: "2026-01-02T07:00:00.000",
          block_id: "block-1",
          origin: 1,
          destination: 0,
        },
        {
          schedule_date: "2026-01-02T00:00:00.000",
          direction: "N",
          shape_id: "B410001",
          stop_sequence: 2,
          stop_id: "b",
          schedule_time: "2026-01-02T07:10:00.000",
          block_id: "block-1",
          origin: 0,
          destination: 1,
        },
      ],
    });

    expect(context.expectedCellKeys.has("b41-n-node-001-node-002|2026-01|am_peak")).toBe(true);
    expect(context).toMatchObject({
      routeScheduleRowCount: 2,
      matchedSchedulePairCount: 1,
      unmatchedSchedulePairCount: 0,
    });
  });

  test("uses the Studio v2 route speed-history namespace", () => {
    expect(
      routeSpeedHistoryArtifactPath({ artifactRoot: "data/artifacts", routeSlug: "b41" }),
    ).toBe("data/artifacts/studio/v2/routes/b41/speed-history.json");
  });

  test("keeps speed-history artifact construction and SQL out of the command", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../src/commands/studio/route-speed-history.ts"),
      "utf8",
    );

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/feature-history"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).not.toContain("function buildRouteSpeedHistoryArtifact");
    expect(source).not.toContain("function buildRouteExpectedServiceContext");
    expect(source).not.toContain("FROM local_route_segment_speed");
    expect(source).not.toContain("FROM local_route_schedule_stop");
    expect(source).not.toContain("function queryRouteSpeedHistoryRows");
  });
});

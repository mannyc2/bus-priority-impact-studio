import { describe, expect, test } from "bun:test";
import {
  buildRouteBriefHotspotProjection,
  buildRouteBriefSegmentUniverse,
  busLaneMatches,
  emptyRouteBriefHotspotSummary,
  planRouteBriefModelRoutes,
  routeBriefComparisonRankRows,
  routeBriefModelServingProjection,
  routeBriefVisibilityReason,
} from "../src/route-briefs";

describe("route brief applied research model", () => {
  test("builds empty hotspot projections without observed speed rows", () => {
    const projection = buildRouteBriefHotspotProjection({
      routeId: "M14A+",
      month: "2026-03",
      generatedAt: "2026-04-01T00:00:00.000Z",
      speedRows: [],
      ridershipRows: [],
      hotspotLimit: 10,
    });

    expect(projection).toEqual(
      emptyRouteBriefHotspotSummary({
        routeId: "M14A+",
        month: "2026-03",
        generatedAt: "2026-04-01T00:00:00.000Z",
        ridershipWindowCount: 0,
      }),
    );
  });

  test("keeps missing ridership exposure out of public visibility", () => {
    expect(
      routeBriefVisibilityReason({
        reason: "standard_route",
        coverageStatus: "full",
        totalRidership: 0,
      }),
    ).toEqual({
      publicVisible: false,
      publicVisibilityReason: "missing_ridership_exposure",
    });
  });

  test("projects serving visibility into brief rows and route-slice metrics", () => {
    const projection = routeBriefModelServingProjection({
      routeScorecardRow: {
        coverageStatus: "full",
      },
      routeBriefRows: {
        summary: {
          publicVisible: true,
          publicVisibilityReason: "standard_route",
          totalRidership: 0,
        },
      },
      briefInput: {
        metrics: {
          routeScore: 50,
        },
      },
    } as Parameters<typeof routeBriefModelServingProjection>[0]);

    expect(projection.routeBriefRows.summary.publicVisible).toBe(false);
    expect(projection.routeBriefRows.summary.publicVisibilityReason).toBe(
      "missing_ridership_exposure",
    );
    expect(projection.briefInput.metrics).toEqual({
      routeScore: 50,
      publicVisible: false,
      publicVisibilityReason: "missing_ridership_exposure",
    });
  });

  test("ranks route brief summaries by score, speed, ridership, then route id", () => {
    const rows = routeBriefComparisonRankRows("2026-03", [
      {
        routeId: "M2",
        month: "2026-03",
        routeScore: 20,
        publicVisible: true,
        publicVisibilityReason: "standard_route",
        averageSpeedMph: 5,
        hotspotCount: 2,
        totalRidership: 100,
        totalTransfers: 0,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
        scheduleMatchRate: 0,
      },
      {
        routeId: "M1",
        month: "2026-03",
        routeScore: 10,
        publicVisible: true,
        publicVisibilityReason: "standard_route",
        averageSpeedMph: 6,
        hotspotCount: 1,
        totalRidership: 50,
        totalTransfers: 0,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
        scheduleMatchRate: 0,
      },
    ]);

    expect(rows.map((row) => row.routeId)).toEqual(["M1", "M2"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
  });

  test("plans route brief model route universe and unknown-route issues", () => {
    const catalog = [{ routeId: "M2" }, { routeId: "M1" }] as Parameters<
      typeof planRouteBriefModelRoutes
    >[0]["catalog"];

    expect(
      planRouteBriefModelRoutes({
        catalog,
        requestedRoutes: [],
      }),
    ).toEqual({
      routeIds: ["M2", "M1"],
      issues: [],
      shouldBuildComparisonRanks: true,
    });

    expect(
      planRouteBriefModelRoutes({
        catalog,
        requestedRoutes: ["M2", "ZZZ", "M2", "M1"],
      }),
    ).toEqual({
      routeIds: ["M1", "M2"],
      issues: [
        {
          routeId: "ZZZ",
          code: "route_not_in_catalog",
          message: "Route ZZZ was requested but is not present in local_route_catalog.",
        },
      ],
      shouldBuildComparisonRanks: false,
    });
  });

  test("returns an explicit empty segment universe when no observed speeds exist", () => {
    const universe = buildRouteBriefSegmentUniverse({
      speedRows: [],
      ridershipRows: [],
      schedules: [],
      year: 2026,
      month: 3,
    });

    expect(universe.segmentUniverse.segmentCount).toBe(0);
    expect(universe.segmentUniverse.grain).toBe("all_observed_timepoint_segments");
    expect(universe.segments).toEqual([]);
    expect(universe.scheduleComparisons).toEqual([]);
  });

  test("exposes bus-lane matching as package-owned route brief metrics", () => {
    expect(busLaneMatches([], [])).toEqual([]);
  });
});

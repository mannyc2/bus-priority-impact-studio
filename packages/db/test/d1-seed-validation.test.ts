import { describe, expect, test } from "bun:test";
import { buildD1AppendixSeedSql, buildD1SeedSql, type D1SeedInput } from "../src/d1/seed";

function emptySeedInput(): D1SeedInput {
  return {
    month: "2026-03",
    routeCatalog: [],
    routeCoverage: [],
    routeReadiness: [],
    routeBuildPlan: [],
    routeReliabilityBaseline: [],
    routeReliabilityGapWindows: [],
    routeObservedReliabilitySummaries: [],
    interventionEvents: [],
    routeInterventionComparisons: [],
    routeArtifacts: [],
    corridors: [],
    corridorArtifacts: [],
    corridorRouteMembers: [],
    corridorMonthSummaries: [],
    corridorInterventionContexts: [],
    corridorHotspots: [],
    routeMonthSourceStatuses: [],
    routeMonthTrends: [],
    routeTimelineIndex: [],
    routeSpeedHistoryCoverage: [],
    sourceMonthCoverage: [],
    routeEquityContext: [],
    routeScorecards: [],
    routeBriefSummaries: [],
    routeBriefPeakWindows: [],
    routeBriefSlowestWindows: [],
    routeComparisonRanks: [],
    routeBatchStatus: null,
    routeBatchBuiltRoutes: [],
    routeBatchIssues: [],
  };
}

describe("D1 seed validation", () => {
  test("rejects malformed public serving rows before rendering SQL", () => {
    const input = emptySeedInput();
    input.routeScorecards = [
      {
        routeId: "M1",
        month: "2026-03",
        routeScore: 10,
        coverageStatus: "bogus",
        averageSpeedMph: 6.5,
        hotspotCount: 2,
      } as D1SeedInput["routeScorecards"][number],
    ];

    expect(() => buildD1SeedSql(input)).toThrow(
      /D1 seed row failed validation for route_scorecard/,
    );
  });

  test("rejects malformed route catalog rows before rendering SQL", () => {
    const input = emptySeedInput();
    input.routeCatalog = [
      {
        routeId: "M1",
        routeShortName: "M1",
        routeLongName: null,
        routeTypes: ["local"],
        directions: ["Northbound"],
        shapeCount: "many",
        stopCount: 10,
        timepointStopCount: 4,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      } as unknown as D1SeedInput["routeCatalog"][number],
    ];

    expect(() => buildD1SeedSql(input)).toThrow(
      /D1 seed row failed validation for route_catalog/,
    );
  });

  test("validates appendix reliability rows at the same seed boundary", () => {
    expect(() =>
      buildD1AppendixSeedSql({
        month: "2026-05",
        routeObservedReliabilitySummaries: [
          {
            routeId: "M1",
            month: "2026-05",
            runId: "run",
            reliabilityStatus: "not-a-real-status",
            minSampleThreshold: 100,
            sampleCount: 100,
            stopCount: 10,
            directionCount: 2,
            averageObservedHeadwayMinutes: null,
            medianObservedHeadwayMinutes: null,
            p90ObservedHeadwayMinutes: null,
            maxObservedHeadwayMinutes: null,
            scheduledMedianHeadwayMinutes: null,
            bunchingThresholdMinutes: null,
            longGapThresholdMinutes: null,
            observedBunchingShare: null,
            observedLongGapShare: null,
            expectedWaitMinutes: null,
            scheduledExpectedWaitMinutes: null,
            excessWaitMinutes: null,
            waitReliabilityRatio: null,
          } as D1SeedInput["routeObservedReliabilitySummaries"][number],
        ],
        routeMonthSourceStatuses: [],
      }),
    ).toThrow(/D1 seed row failed validation for route_observed_reliability_summary/);
  });
});

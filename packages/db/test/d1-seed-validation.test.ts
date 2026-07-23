import { describe, expect, test } from "bun:test";
import {
  buildD1AppendixSeedSql,
  buildD1SeedSql,
  buildPlan097RecoverySeedSql,
  type D1SeedInput,
} from "../src/d1/seed";

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
      } as unknown as D1SeedInput["routeScorecards"][number],
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
        tripTypes: ["1"],
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

    expect(() => buildD1SeedSql(input)).toThrow(/D1 seed row failed validation for route_catalog/);
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
          } as unknown as D1SeedInput["routeObservedReliabilitySummaries"][number],
        ],
        routeMonthSourceStatuses: [],
      }),
    ).toThrow(/D1 seed row failed validation for route_observed_reliability_summary/);
  });

  test("rejects invalid route speed-history spine readiness and reason JSON", () => {
    const input = emptySeedInput();
    input.routeSpeedHistoryCoverage = [
      {
        routeId: "B41",
        month: "2026-03",
        routeSlug: "b41",
        historyStartMonth: "2023-04",
        historyEndMonth: "2026-03",
        artifactPath: "studio/v2/routes/b41/speed-history.json",
        artifactStatus: "written",
        spineReadiness: "not_ready",
        spineReasonJson: "{}",
        matchedCurrentSegmentCount: null,
        unmatchedCurrentSegmentCount: null,
        monthCount: 36,
        segmentCount: 16,
        cellCount: 2304,
        availableCellCount: 2200,
        missingCellCount: 104,
        generatedAt: "2026-07-11T00:00:00.000Z",
      } as unknown as D1SeedInput["routeSpeedHistoryCoverage"][number],
    ];

    expect(() => buildD1SeedSql(input)).toThrow(/spineReadiness: Invalid enum value/);
    const coverage = input.routeSpeedHistoryCoverage[0];
    if (coverage === undefined) throw new Error("Missing coverage fixture.");
    coverage.spineReadiness = "series_ready";
    expect(() => buildD1SeedSql(input)).toThrow(/spineReasonJson: Expected string array/);
  });

  test("Plan 097 recovery seed preserves appendix signals and citations and activates last", () => {
    const input = emptySeedInput();
    input.routeObservedReliabilitySummaries = [
      {
        routeId: "M1",
        month: "2026-03",
        runId: "live-run",
        reliabilityStatus: "observed",
        minSampleThreshold: 100,
        sampleCount: 1000,
        stopCount: 50,
        directionCount: 2,
        averageObservedHeadwayMinutes: 5,
        medianObservedHeadwayMinutes: 5,
        p90ObservedHeadwayMinutes: 10,
        maxObservedHeadwayMinutes: 15,
        scheduledMedianHeadwayMinutes: 5,
        bunchingThresholdMinutes: 2,
        longGapThresholdMinutes: 10,
        observedBunchingShare: 0.1,
        observedLongGapShare: 0.05,
        expectedWaitMinutes: 3,
        scheduledExpectedWaitMinutes: 2.5,
        excessWaitMinutes: 0.5,
        waitReliabilityRatio: 1.2,
      },
    ];
    input.routeMonthSourceStatuses = [
      {
        routeId: "M1",
        month: "2026-03",
        sourceScope: "reliability",
        sourceId: "observedHeadways",
        status: "ok",
        rowCount: 10,
        snapshotId: "live",
        note: null,
      },
      {
        routeId: "M1",
        month: "2026-03",
        sourceScope: "speed",
        sourceId: "routeSpeeds",
        status: "ok",
        rowCount: 20,
        snapshotId: "candidate",
        note: null,
      },
    ];
    input.routeBatchBuiltRoutes = [
      {
        month: "2026-03",
        routeRank: 1,
        routeId: "M1",
        artifactCount: 1,
        status: "pass",
      },
    ];
    input.routeBatchIssues = [
      {
        month: "2026-03",
        issueRank: 1,
        routeId: "M1",
        severity: "warning",
        issueCode: "fixture",
        message: "fixture warning",
      },
    ];
    input.routeBatchStatus = {
      month: "2026-03",
      generatedAt: "2026-07-22T12:00:00.000Z",
      status: "pass",
      routeCount: 1,
      artifactCount: 1,
      missingArtifactCount: 0,
      hashMismatchCount: 0,
      byteLengthMismatchCount: 0,
      totalByteLength: 100,
      issueCount: 1,
    };

    const result = buildPlan097RecoverySeedSql(input);
    expect(result.seedSql).not.toContain('delete from "route_observed_reliability_summary"');
    expect(result.seedSql).not.toContain('insert into "route_observed_reliability_summary"');
    expect(result.seedSql).not.toContain('delete from "route_scorecard_citation"');
    expect(
      result.seedSql
        .split("\n")
        .filter((line) => line.startsWith('insert into "route_month_source_status"')),
    ).not.toEqual(expect.arrayContaining([expect.stringContaining("'observedHeadways'")]));
    expect(result.seedSql).toContain("'routeSpeeds'");
    expect(result.routeObservedReliabilitySummaryRowCount).toBe(0);
    expect(result.routeMonthSourceStatusRowCount).toBe(1);
    expect(result.seedSql.trimEnd().split("\n").at(-1)).toContain(
      'insert into "route_batch_status"',
    );
    expect(result.seedSql.indexOf('insert into "route_batch_built_route"')).toBeLessThan(
      result.seedSql.indexOf('insert into "route_batch_status"'),
    );
    expect(result.seedSql.indexOf('insert into "route_batch_issue"')).toBeLessThan(
      result.seedSql.indexOf('insert into "route_batch_status"'),
    );
  });
});

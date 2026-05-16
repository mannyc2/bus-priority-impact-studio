import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceRouteBriefRows,
  replaceRouteBuildPlan,
  replaceRouteCatalog,
  replaceRouteComparisonRanks,
  replaceRouteEquityRows,
  replaceRouteInterventionEvaluationRows,
  replaceRouteMonthCoverage,
  replaceRouteMonthTrends,
  replaceRouteObservedReliabilityRows,
  replaceRouteReadiness,
  replaceRouteReliabilityRows,
  replaceRouteScorecard,
} from "@bp/db/local";
import { exportD1Seed } from "../src/jobs/export/export-d1.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-04";
const exportDir = fromRepoRoot(join("data/exports/d1", isoMonth));
const dbPath = fromRepoRoot(join("data/fixtures/export-d1/pipeline.sqlite"));

function routeDir(routeId: string): string {
  return fromRepoRoot(join("data/artifacts/route-slices", `${routeId.toLowerCase()}-${isoMonth}`));
}

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(exportDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
    rm(routeDir("T1"), { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(routeDir("T1"), { recursive: true });
  const local = await openLocalPipelineDb(dbPath);

  await replaceRouteCatalog(local.db, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "Fixture route",
      routeTypes: ["Local"],
      directions: ["N", "S"],
      shapeCount: 2,
      stopCount: 10,
      timepointStopCount: 4,
      latitudeMin: 40,
      latitudeMax: 41,
      longitudeMin: -74,
      longitudeMax: -73,
    },
  ]);
  await replaceRouteMonthCoverage(local.db, isoMonth, [
    {
      routeId: "T1",
      isoMonth,
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 6,
      scheduleTimepointCount: 100,
      hasSpeedData: true,
      hasScheduleData: true,
    },
  ]);
  await replaceRouteReadiness(local.db, isoMonth, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "Fixture route",
      isoMonth,
      readinessStatus: "ready",
      buildEligible: true,
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 6,
      scheduleTimepointCount: 100,
      shapeCount: 2,
      stopCount: 10,
      timepointStopCount: 4,
    },
  ]);
  await replaceRouteBuildPlan(local.db, isoMonth, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "Fixture route",
      isoMonth,
      candidateRank: 1,
      planStatus: "selected",
      selectedForNextBatch: true,
      alreadyBuilt: false,
      buildEligible: true,
      priorityScore: 2938.5,
      readinessStatus: "ready",
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 6,
      scheduleTimepointCount: 100,
      shapeCount: 2,
      stopCount: 10,
      timepointStopCount: 4,
    },
  ]);
  await replaceRouteReliabilityRows(local.db, isoMonth, {
    baselines: [
      {
        routeId: "T1",
        month: isoMonth,
        reliabilityStatus: "scheduled_baseline_only",
        scheduledTimepointCount: 100,
        stopHeadwayGroupCount: 10,
        headwaySampleCount: 90,
        medianScheduledHeadwayMinutes: 10,
        p90ScheduledHeadwayMinutes: 20,
        maxScheduledHeadwayMinutes: 30,
        scheduledShortHeadwayShare: 0.1,
        scheduledLongGapShare: 0.2,
      },
    ],
    gapWindows: [],
    sourceStatuses: [
      {
        routeId: "T1",
        month: isoMonth,
        sourceScope: "reliability",
        sourceId: "scheduledHeadways",
        status: "available",
        rowCount: null,
        snapshotId: null,
        note: null,
      },
      {
        routeId: "T1",
        month: isoMonth,
        sourceScope: "reliability",
        sourceId: "observedHeadways",
        status: "needs_gtfs_rt_collection",
        rowCount: null,
        snapshotId: null,
        note: null,
      },
    ],
  });
  await replaceRouteObservedReliabilityRows(local.db, isoMonth, "fixture-gtfs-rt", {
    summaries: [
      {
        routeId: "T1",
        month: isoMonth,
        runId: "fixture-gtfs-rt",
        reliabilityStatus: "observed",
        minSampleThreshold: 3,
        sampleCount: 42,
        stopCount: 5,
        directionCount: 2,
        averageObservedHeadwayMinutes: 8.5,
        medianObservedHeadwayMinutes: 8,
        p90ObservedHeadwayMinutes: 15,
        maxObservedHeadwayMinutes: 22,
        scheduledMedianHeadwayMinutes: 10,
        bunchingThresholdMinutes: 5,
        longGapThresholdMinutes: 20,
        observedBunchingShare: 0.12,
        observedLongGapShare: 0.05,
        expectedWaitMinutes: 5.1,
        scheduledExpectedWaitMinutes: 5,
        excessWaitMinutes: 0.1,
        waitReliabilityRatio: 1.02,
      },
    ],
    sourceStatuses: [
      {
        routeId: "T1",
        month: isoMonth,
        sourceScope: "reliability",
        sourceId: "observedHeadways",
        status: "available",
        rowCount: 42,
        snapshotId: "fixture-gtfs-rt",
        note: null,
      },
      {
        routeId: "T1",
        month: isoMonth,
        sourceScope: "reliability",
        sourceId: "bunching",
        status: "available",
        rowCount: 42,
        snapshotId: "fixture-gtfs-rt",
        note: null,
      },
      {
        routeId: "T1",
        month: isoMonth,
        sourceScope: "reliability",
        sourceId: "waitTimeReliability",
        status: "available",
        rowCount: 42,
        snapshotId: "fixture-gtfs-rt",
        note: null,
      },
    ],
  });
  await replaceRouteInterventionEvaluationRows(local.db, isoMonth, "mta_ace_routes", {
    events: [
      {
        eventId: "ace:T1:ACE:2026-01-15",
        routeId: "T1",
        interventionType: "automated_bus_lane_enforcement",
        sourceId: "mta_ace_routes",
        program: "ACE",
        implementationDate: "2026-01-15T00:00:00.000Z",
        implementationMonth: "2026-01",
        eventStatus: "implemented",
        description: "ACE automated bus lane enforcement for T1",
      },
    ],
    comparisons: [
      {
        routeId: "T1",
        month: isoMonth,
        eventId: "ace:T1:ACE:2026-01-15",
        interventionType: "automated_bus_lane_enforcement",
        sourceId: "mta_ace_routes",
        evaluationLevel: "descriptive_before_after",
        comparisonStatus: "evaluated",
        preStartMonth: "2025-11",
        preEndMonth: "2025-12",
        postStartMonth: "2026-02",
        postEndMonth: "2026-03",
        requestedPreMonthCount: 2,
        requestedPostMonthCount: 2,
        preSampleMonthCount: 2,
        postSampleMonthCount: 2,
        preSpeedObservationCount: 30,
        postSpeedObservationCount: 70,
        preAverageSpeedMph: 6.3333,
        postAverageSpeedMph: 8,
        speedDeltaMph: 1.6667,
        preAverageMonthlyRidership: 1100,
        postAverageMonthlyRidership: 1400,
        ridershipDelta: 300,
        caveat:
          "Descriptive before/after only; not seasonality-adjusted and not matched to comparison routes.",
      },
    ],
  });
  await replaceRouteMonthTrends(local.db, [
    {
      routeId: "T1",
      month: isoMonth,
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 6,
      ridership: 1000,
      transfers: 100,
      hasSpeedTrend: true,
      hasRidershipTrend: true,
    },
  ]);
  await replaceRouteEquityRows(local.db, isoMonth, {
    rows: [
      {
        routeId: "T1",
        month: isoMonth,
        acsYear: 2024,
        assignmentGeography: "county_proxy",
        assignedCountyFips: "061",
        assignedCountyName: "New York County",
        assignmentMethod: "route_id_prefix",
        tractCount: 300,
        totalPopulation: 1600000,
        occupiedHousingUnits: 800000,
        noVehicleHouseholds: 500000,
        noVehicleHouseholdShare: 0.625,
        medianHouseholdIncome: 90000,
        povertyRate: 15,
        publicTransitCommuterShare: 60,
        hispanicShare: 25,
        nonHispanicWhiteShare: 40,
        nonHispanicBlackShare: 15,
        nonHispanicAsianShare: 15,
      },
    ],
    sourceStatuses: [
      {
        routeId: "T1",
        month: isoMonth,
        sourceScope: "equity_context",
        sourceId: "routeSpatialJoin",
        status: "pending_tract_geometry_join",
        rowCount: null,
        snapshotId: null,
        note: null,
      },
    ],
  });
  await replaceRouteScorecard(local.db, {
    routeId: "T1",
    month: isoMonth,
    routeScore: 40,
    coverageStatus: "full",
    averageSpeedMph: 6,
    hotspotCount: 2,
  });
  await replaceRouteBriefRows(local.db, {
    summary: {
      routeId: "T1",
      month: isoMonth,
      routeScore: 40,
      publicVisible: true,
      publicVisibilityReason: "included",
      averageSpeedMph: 6,
      hotspotCount: 2,
      totalRidership: 1000,
      totalTransfers: 100,
      aceActive: true,
      aceViolationCount: 12,
      busLaneMatchedLaneCount: 3,
      scheduleMatchRate: 0.5,
    },
    peakWindows: [
      {
        routeId: "T1",
        month: isoMonth,
        windowRank: 1,
        dayOfWeek: "Monday",
        hourOfDay: 8,
        ridership: 500,
        transfers: null,
        matchedObservationCount: null,
        busTripCount: null,
        weightedAverageSpeedMph: null,
        slowObservationShare: null,
      },
    ],
    slowestWindows: [
      {
        routeId: "T1",
        month: isoMonth,
        windowRank: 1,
        dayOfWeek: "Tuesday",
        hourOfDay: 12,
        observationCount: null,
        busTripCount: null,
        segmentCount: null,
        weightedAverageSpeedMph: null,
        weightedAverageTravelTimeMinutes: null,
        slowObservationShare: null,
      },
    ],
  });
  await replaceRouteComparisonRanks(local.db, isoMonth, [
    {
      month: isoMonth,
      rank: 1,
      routeId: "T1",
      routeScore: 40,
      averageSpeedMph: 6,
      totalRidership: 1000,
      aceViolationCount: 12,
      busLaneMatchedLaneCount: 3,
    },
  ]);
  local.sqlite.close();
  await Bun.write(
    join(routeDir("T1"), "route-brief-input.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId: "T1",
        analysisPeriod: isoMonth,
        metrics: {
          routeScore: 40,
          averageSpeedMph: 6,
          hotspotCount: 2,
          totalRidership: 1000,
          totalTransfers: 100,
          scheduleMatchedHotspotCount: 1,
        },
        interventionStatus: {
          aceActiveDuringAnalysisPeriod: true,
          aceViolationCount: 12,
          busLaneMatchedLaneCount: 3,
        },
        ridershipProfile: {
          peakRidershipWindow: { dayOfWeek: "Monday", hourOfDay: 8, ridership: 500 },
        },
        speedProfile: {
          slowestDayHourWindows: [{ dayOfWeek: "Tuesday", hourOfDay: 12 }],
        },
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("D1 seed export", () => {
  test("writes schema and seed SQL from local DB projections", async () => {
    await writeFixtureArtifacts();

    const result = await exportD1Seed({ year: 2026, month: 4, dbPath });
    const schema = await Bun.file(result.schemaPath).text();
    const seed = await Bun.file(result.seedPath).text();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 1,
        routeCatalogRowCount: 1,
        routeCatalogTypeRowCount: 1,
        routeDirectionRowCount: 2,
        routeCoverageRowCount: 1,
        routeReadinessRowCount: 1,
        routeReadinessMissingInputRowCount: 0,
        routeBuildPlanRowCount: 1,
        routeReliabilityBaselineRowCount: 1,
        routeReliabilityGapWindowRowCount: 0,
        routeObservedReliabilitySummaryRowCount: 1,
        interventionEventRowCount: 1,
        routeInterventionComparisonRowCount: 1,
        routeMonthSourceStatusRowCount: 5,
        routeMonthTrendRowCount: 1,
        routeEquityContextRowCount: 1,
        routeBatchStatusRowCount: 1,
        routeBatchBuiltRouteRowCount: 0,
        routeBatchIssueRowCount: 0,
        routeBriefPeakWindowRowCount: 1,
        routeBriefSlowestWindowRowCount: 1,
        routeScorecardCitationRowCount: 0,
        comparisonRowCount: 1,
      }),
    );
    expect(schema).toContain("CREATE TABLE `route_scorecard`");
    expect(schema).toContain("CREATE TABLE `route_observed_reliability_summary`");
    expect(schema).toContain("CREATE TABLE `route_intervention_comparison`");
    expect(seed).not.toContain("CREATE TABLE");
    expect(seed).toContain('delete from "route_catalog";');
    expect(seed).toContain(
      'delete from "route_month_coverage" where "route_month_coverage"."month" = \'2026-04\';',
    );
    expect(seed).toContain(
      'delete from "route_readiness" where "route_readiness"."month" = \'2026-04\';',
    );
    expect(seed).toContain(
      'delete from "route_build_plan" where "route_build_plan"."month" = \'2026-04\';',
    );
    expect(seed).toContain(
      'delete from "route_reliability_baseline" where "route_reliability_baseline"."month" = \'2026-04\';',
    );
    expect(seed).toContain(
      'delete from "route_observed_reliability_summary" where "route_observed_reliability_summary"."month" = \'2026-04\';',
    );
    expect(seed).toContain('delete from "intervention_event";');
    expect(seed).toContain(
      'delete from "route_intervention_comparison" where "route_intervention_comparison"."month" = \'2026-04\';',
    );
    expect(seed).toContain('delete from "route_month_trend";');
    expect(seed).toContain(
      'delete from "route_equity_context" where "route_equity_context"."month" = \'2026-04\';',
    );
    expect(seed).toContain(
      'delete from "route_scorecard" where "route_scorecard"."month" = \'2026-04\';',
    );
    expect(seed).toContain(
      'delete from "route_batch_status" where "route_batch_status"."month" = \'2026-04\';',
    );
    expect(seed).toContain('insert into "route_catalog"');
    expect(seed).toContain('insert into "route_catalog_type"');
    expect(seed).toContain('insert into "route_direction"');
    expect(seed).toContain('insert into "route_month_coverage"');
    expect(seed).toContain('insert into "route_readiness"');
    expect(seed).toContain('insert into "route_build_plan"');
    expect(seed).toContain('insert into "route_reliability_baseline"');
    expect(seed).toContain('insert into "route_observed_reliability_summary"');
    expect(seed).toContain('insert into "intervention_event"');
    expect(seed).toContain('insert into "route_intervention_comparison"');
    expect(seed).toContain('insert into "route_month_source_status"');
    expect(seed).toContain('insert into "route_month_trend"');
    expect(seed).toContain('insert into "route_equity_context"');
    expect(seed).toContain('insert into "route_brief_summary"');
    expect(seed).toContain('insert into "route_brief_peak_window"');
    expect(seed).toContain('insert into "route_brief_slowest_window"');
    expect(seed).toContain('insert into "route_comparison_rank"');
    expect(seed).toContain('insert into "route_batch_status"');
    expect(seed).not.toContain("_json");
  });
});

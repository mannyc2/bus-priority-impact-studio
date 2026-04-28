import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceRouteArtifacts,
  replaceRouteBriefRows,
  replaceRouteBuildPlan,
  replaceRouteCatalog,
  replaceRouteComparisonRanks,
  replaceRouteEquityRows,
  replaceRouteMonthCoverage,
  replaceRouteMonthTrends,
  replaceRouteReadiness,
  replaceRouteReliabilityRows,
  replaceRouteScorecard,
} from "@bp/db/local";
import { exportD1Seed } from "../src/jobs/export/export-d1.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-04";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const exportDir = fromRepoRoot(join("data/exports/d1", isoMonth));
const dbPath = fromRepoRoot(join("data/fixtures/export-d1/pipeline.sqlite"));

function routeDir(routeId: string): string {
  return fromRepoRoot(join("data/artifacts/route-slices", `${routeId.toLowerCase()}-${isoMonth}`));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(exportDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
    rm(routeDir("T1"), { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(batchDir, { recursive: true });
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
  await replaceRouteArtifacts(local.db, "T1", isoMonth, [
    {
      routeId: "T1",
      month: isoMonth,
      artifactName: "route-brief-input.json",
      artifactKey: "route-slices/t1-2026-04/route-brief-input.json",
      contentType: "application/json",
      byteLength: 123,
      sha256: digest("brief"),
    },
  ]);
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
    join(batchDir, "batch-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        routeCount: 1,
        routes: [{ routeId: "T1", isoMonth }],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(batchDir, "route-reliability-baseline.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        rows: [
          {
            routeId: "T1",
            isoMonth,
            reliabilityStatus: "scheduled_baseline_only",
            scheduledTimepointCount: 100,
            stopHeadwayGroupCount: 10,
            headwaySampleCount: 90,
            medianScheduledHeadwayMinutes: 10,
            p90ScheduledHeadwayMinutes: 20,
            maxScheduledHeadwayMinutes: 30,
            scheduledShortHeadwayShare: 0.1,
            scheduledLongGapShare: 0.2,
            topLongGapWindows: [],
            sourceStatus: {
              scheduledHeadways: "available",
              observedHeadways: "needs_gtfs_rt_collection",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(batchDir, "route-comparison.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        rankedRoutes: [
          {
            routeId: "T1",
            routeScore: 40,
            averageSpeedMph: 6,
            totalRidership: 1000,
            aceViolationCount: 12,
            busLaneMatchedLaneCount: 3,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(batchDir, "route-equity-context.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        acsYear: 2024,
        rows: [
          {
            routeId: "T1",
            isoMonth,
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
            raceEthnicityShare: {
              hispanic: 25,
              nonHispanicWhite: 40,
              nonHispanicBlack: 15,
              nonHispanicAsian: 15,
            },
            sourceStatus: {
              routeSpatialJoin: "pending_tract_geometry_join",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
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
  test("writes schema, seed SQL, and export summary from batch artifacts", async () => {
    await writeFixtureArtifacts();

    const result = await exportD1Seed({ year: 2026, month: 4, dbPath });
    const schema = await Bun.file(result.schemaPath).text();
    const seed = await Bun.file(result.seedPath).text();
    const summary = await Bun.file(result.summaryPath).json();

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
        routeMonthSourceStatusRowCount: 3,
        routeMonthTrendRowCount: 1,
        routeEquityContextRowCount: 1,
        routeBatchStatusRowCount: 1,
        routeBatchBuiltRouteRowCount: 1,
        routeBatchIssueRowCount: 10,
        routeBriefPeakWindowRowCount: 1,
        routeBriefSlowestWindowRowCount: 1,
        routeScorecardCitationRowCount: 0,
        artifactRowCount: 1,
        comparisonRowCount: 1,
      }),
    );
    expect(schema).toContain("CREATE TABLE `route_scorecard`");
    expect(seed).not.toContain("CREATE TABLE");
    expect(seed).toContain("DELETE FROM route_catalog;");
    expect(seed).toContain("DELETE FROM route_month_coverage WHERE month = '2026-04';");
    expect(seed).toContain("DELETE FROM route_readiness WHERE month = '2026-04';");
    expect(seed).toContain("DELETE FROM route_build_plan WHERE month = '2026-04';");
    expect(seed).toContain("DELETE FROM route_reliability_baseline WHERE month = '2026-04';");
    expect(seed).toContain("DELETE FROM route_month_trend;");
    expect(seed).toContain("DELETE FROM route_equity_context WHERE month = '2026-04';");
    expect(seed).toContain("DELETE FROM route_scorecard WHERE month = '2026-04';");
    expect(seed).toContain("DELETE FROM route_batch_status WHERE month = '2026-04';");
    expect(seed).toContain("INSERT INTO route_catalog");
    expect(seed).toContain("INSERT INTO route_catalog_type");
    expect(seed).toContain("INSERT INTO route_direction");
    expect(seed).toContain("INSERT INTO route_month_coverage");
    expect(seed).toContain("INSERT INTO route_readiness");
    expect(seed).toContain("INSERT INTO route_build_plan");
    expect(seed).toContain("INSERT INTO route_reliability_baseline");
    expect(seed).toContain("INSERT INTO route_month_source_status");
    expect(seed).toContain("INSERT INTO route_month_trend");
    expect(seed).toContain("INSERT INTO route_equity_context");
    expect(seed).toContain("INSERT INTO route_brief_summary");
    expect(seed).toContain("INSERT INTO route_brief_peak_window");
    expect(seed).toContain("INSERT INTO route_brief_slowest_window");
    expect(seed).toContain("INSERT INTO route_artifact");
    expect(seed).toContain("INSERT INTO route_comparison_rank");
    expect(seed).toContain("INSERT INTO route_batch_status");
    expect(seed).toContain("INSERT INTO route_batch_built_route");
    expect(seed).toContain("INSERT INTO route_batch_issue");
    expect(seed).not.toContain("_json");
    expect(summary.routeCatalogRowCount).toBe(1);
    expect(summary.routeCatalogTypeRowCount).toBe(1);
    expect(summary.routeDirectionRowCount).toBe(2);
    expect(summary.routeCoverageRowCount).toBe(1);
    expect(summary.routeReadinessRowCount).toBe(1);
    expect(summary.routeReadinessMissingInputRowCount).toBe(0);
    expect(summary.routeBuildPlanRowCount).toBe(1);
    expect(summary.routeReliabilityBaselineRowCount).toBe(1);
    expect(summary.routeReliabilityGapWindowRowCount).toBe(0);
    expect(summary.routeMonthSourceStatusRowCount).toBe(3);
    expect(summary.routeMonthTrendRowCount).toBe(1);
    expect(summary.routeEquityContextRowCount).toBe(1);
    expect(summary.routeBatchStatusRowCount).toBe(1);
    expect(summary.routeBatchBuiltRouteRowCount).toBe(1);
    expect(summary.routeBatchIssueRowCount).toBe(10);
    expect(summary.routeBriefPeakWindowRowCount).toBe(1);
    expect(summary.routeBriefSlowestWindowRowCount).toBe(1);
    expect(summary.artifactRowCount).toBe(1);
  });
});

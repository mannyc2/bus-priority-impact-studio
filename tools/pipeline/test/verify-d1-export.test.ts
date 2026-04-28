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
import { verifyD1Export } from "../src/jobs/export/verify-d1-export.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-09";
const exportDir = fromRepoRoot(join("data/exports/d1", isoMonth));
const dbPath = fromRepoRoot(join("data/fixtures/verify-d1/pipeline.sqlite"));
const routeDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-09"));
const artifactNames = [
  "summary.json",
  "hotspots.json",
  "ridership-profile.json",
  "speed-profile.json",
  "intervention-overlay.json",
  "bus-lane-overlay.json",
  "schedule-comparison.json",
  "route-scorecard.json",
  "route-brief-input.json",
] as const;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(exportDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
    rm(routeDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureNetwork(): Promise<void> {
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
      candidateRank: null,
      planStatus: "already_built",
      selectedForNextBatch: false,
      alreadyBuilt: true,
      buildEligible: true,
      priorityScore: 2900,
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
}

async function writeFixtureRouteArtifacts(): Promise<void> {
  await mkdir(routeDir, { recursive: true });
  const artifactValues = new Map<string, unknown>(
    artifactNames.map((name) => [name, { schemaVersion: 1, routeId: "T1", name }]),
  );

  artifactValues.set("route-brief-input.json", {
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
  });

  const artifacts = await Promise.all(
    artifactNames.map(async (name) => {
      const text = `${JSON.stringify(artifactValues.get(name), null, 2)}\n`;
      const path = join(routeDir, name);

      await Bun.write(path, text);

      return {
        name,
        path,
        artifactKey: `route-slices/t1-2026-09/${name}`,
        contentType: "application/json",
        byteLength: text.length,
        sha256: digest(text),
      };
    }),
  );

  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteArtifacts(
      local.db,
      "T1",
      isoMonth,
      artifacts.map((artifact) => ({
        routeId: "T1",
        month: isoMonth,
        artifactName: artifact.name,
        artifactKey: artifact.artifactKey,
        contentType: artifact.contentType,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
      })),
    );
  } finally {
    local.sqlite.close();
  }
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await Promise.all([writeFixtureNetwork(), writeFixtureRouteArtifacts()]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("D1 export verification", () => {
  test("loads generated seed SQL and validates serving counts and typed repository reads", async () => {
    await writeFixtureArtifacts();

    const result = await verifyD1Export({ year: 2026, month: 9, dbPath });

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        status: "pass",
        issueCount: 0,
      }),
    );
    expect(result.tableCounts).toEqual(
      expect.objectContaining({
        route_catalog: 1,
        route_catalog_type: 1,
        route_direction: 2,
        route_reliability_baseline: 1,
        route_month_source_status: 3,
        route_month_trend: 1,
        route_equity_context: 1,
        route_artifact: artifactNames.length,
        route_brief_peak_window: 1,
        route_brief_slowest_window: 1,
        route_batch_status: 1,
        route_batch_built_route: 1,
      }),
    );
    expect(result.repositoryChecks).toEqual(
      expect.objectContaining({
        batchStatus: "pass",
        routeBriefSummaryRows: 1,
        comparisonRankRows: 1,
        reliabilityBaselineRows: 1,
        routeMonthTrendRows: 1,
        routeEquityContextRows: 1,
        firstRouteId: "T1",
        firstRouteArtifactCount: artifactNames.length,
      }),
    );
  });
});

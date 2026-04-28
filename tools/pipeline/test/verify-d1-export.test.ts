import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { verifyD1Export } from "../src/jobs/export/verify-d1-export.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-09";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const exportDir = fromRepoRoot(join("data/exports/d1", isoMonth));
const networkDir = fromRepoRoot(join("data/fixtures/verify-d1-network"));
const trendsDir = fromRepoRoot(join("data/fixtures/verify-d1-trends"));
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
    rm(batchDir, { force: true, recursive: true }),
    rm(exportDir, { force: true, recursive: true }),
    rm(networkDir, { force: true, recursive: true }),
    rm(trendsDir, { force: true, recursive: true }),
    rm(routeDir, { force: true, recursive: true }),
  ]);
}

async function writeJson(path: string, value: unknown): Promise<number> {
  return Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFixtureNetwork(): Promise<void> {
  await mkdir(networkDir, { recursive: true });
  await mkdir(trendsDir, { recursive: true });
  await writeJson(join(networkDir, "route-catalog.json"), {
    schemaVersion: 1,
    rows: [
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
    ],
  });
  await writeJson(join(networkDir, `route-month-coverage-${isoMonth}.json`), {
    schemaVersion: 1,
    analysisPeriod: isoMonth,
    rows: [
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
    ],
  });
  await writeJson(join(trendsDir, `route-month-trends-2025-01_through_${isoMonth}.json`), {
    schemaVersion: 1,
    startMonth: "2025-01",
    endMonth: isoMonth,
    rows: [
      {
        routeId: "T1",
        isoMonth,
        speedObservationCount: 20,
        speedBusTripCount: 200,
        averageSpeedMph: 6,
        ridership: 1000,
        transfers: 100,
        trendCoverage: {
          speed: true,
          ridership: true,
        },
      },
    ],
  });
}

async function writeFixtureBatch(): Promise<void> {
  await mkdir(batchDir, { recursive: true });
  await writeJson(join(batchDir, "batch-summary.json"), {
    schemaVersion: 1,
    analysisPeriod: isoMonth,
    routeCount: 1,
    routes: [{ routeId: "T1", isoMonth }],
  });
  await writeJson(join(batchDir, "route-readiness.json"), {
    schemaVersion: 1,
    analysisPeriod: isoMonth,
    rows: [
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
    ],
  });
  await writeJson(join(batchDir, "route-build-plan.json"), {
    schemaVersion: 1,
    analysisPeriod: isoMonth,
    rows: [
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
      },
    ],
  });
  await writeJson(join(batchDir, "route-reliability-baseline.json"), {
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
  });
  await writeJson(join(batchDir, "route-comparison.json"), {
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
  });
  await writeJson(join(batchDir, "route-equity-context.json"), {
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
  });
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

  await writeJson(join(routeDir, "artifact-manifest.json"), {
    schemaVersion: 1,
    routeId: "T1",
    isoMonth,
    generatedAt: "2026-04-27T12:00:00.000Z",
    artifactRoot: routeDir,
    artifacts,
  });
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await Promise.all([writeFixtureNetwork(), writeFixtureBatch(), writeFixtureRouteArtifacts()]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("D1 export verification", () => {
  test("loads generated seed SQL and validates serving counts and typed repository reads", async () => {
    await writeFixtureArtifacts();

    const result = await verifyD1Export({ year: 2026, month: 9, networkDir, trendsDir });
    const summary = await Bun.file(result.verifyPath).json();

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
    expect(summary.repositoryChecks).toEqual(
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

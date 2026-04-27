import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { classifyPublicRouteVisibility } from "@bp/analytics";
import { boolInt, createServingTablesSql, sqlJson, sqlNullableNumber, sqlString } from "@bp/db";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";

const schemaVersion = 1;

const BatchSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const ArtifactManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    artifacts: z.array(
      z
        .object({
          name: z.string().min(1),
          artifactKey: z.string().min(1),
          contentType: z.string().min(1),
          byteLength: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteBriefInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    metrics: z
      .object({
        routeScore: z.number().int().nonnegative(),
        coverageStatus: z.enum(["full", "no_observed_speed"]).optional(),
        averageSpeedMph: z.number().nonnegative(),
        hotspotCount: z.number().int().nonnegative(),
        totalRidership: z.number().nonnegative(),
        totalTransfers: z.number().nonnegative(),
        scheduleMatchedHotspotCount: z.number().int().nonnegative(),
      })
      .passthrough(),
    interventionStatus: z
      .object({
        aceActiveDuringAnalysisPeriod: z.boolean(),
        aceViolationCount: z.number().int().nonnegative(),
        busLaneMatchedLaneCount: z.number().int().nonnegative(),
      })
      .passthrough(),
    ridershipProfile: z
      .object({
        peakRidershipWindow: z.unknown().nullable(),
      })
      .passthrough(),
    speedProfile: z
      .object({
        slowestDayHourWindows: z.array(z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

const RouteComparisonSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    rankedRoutes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          routeScore: z.number().int().nonnegative(),
          averageSpeedMph: z.number().nonnegative(),
          totalRidership: z.number().nonnegative(),
          aceViolationCount: z.number().int().nonnegative(),
          busLaneMatchedLaneCount: z.number().int().nonnegative(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          routeShortName: z.string().min(1),
          routeLongName: z.string().nullable(),
          routeTypes: z.array(z.string()),
          directions: z.array(z.string()),
          shapeCount: z.number().int().nonnegative(),
          stopCount: z.number().int().nonnegative(),
          timepointStopCount: z.number().int().nonnegative(),
          latitudeMin: z.number().nullable(),
          latitudeMax: z.number().nullable(),
          longitudeMin: z.number().nullable(),
          longitudeMax: z.number().nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteMonthCoverageSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          speedObservationCount: z.number().int().nonnegative(),
          speedBusTripCount: z.number().int().nonnegative(),
          averageSpeedMph: z.number().nonnegative().nullable(),
          scheduleTimepointCount: z.number().int().nonnegative(),
          hasSpeedData: z.boolean(),
          hasScheduleData: z.boolean(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteReadinessSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          routeShortName: z.string().min(1),
          routeLongName: z.string().nullable(),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          readinessStatus: z.enum([
            "ready",
            "partial",
            "missing_geometry",
            "missing_schedule",
            "missing_speed",
          ]),
          buildEligible: z.boolean(),
          readinessScore: z.number().int().min(0).max(100),
          missingInputs: z.array(z.string()),
          speedObservationCount: z.number().int().nonnegative(),
          speedBusTripCount: z.number().int().nonnegative(),
          averageSpeedMph: z.number().nonnegative().nullable(),
          scheduleTimepointCount: z.number().int().nonnegative(),
          shapeCount: z.number().int().nonnegative(),
          stopCount: z.number().int().nonnegative(),
          timepointStopCount: z.number().int().nonnegative(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteBuildPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          routeShortName: z.string().min(1),
          routeLongName: z.string().nullable(),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          candidateRank: z.number().int().positive().nullable(),
          planStatus: z.enum(["selected", "backlog", "already_built", "blocked"]),
          selectedForNextBatch: z.boolean(),
          alreadyBuilt: z.boolean(),
          buildEligible: z.boolean(),
          priorityScore: z.number().nonnegative(),
          readinessStatus: z.enum([
            "ready",
            "partial",
            "missing_geometry",
            "missing_schedule",
            "missing_speed",
          ]),
          readinessScore: z.number().int().min(0).max(100),
          missingInputs: z.array(z.string()),
          speedObservationCount: z.number().int().nonnegative(),
          speedBusTripCount: z.number().int().nonnegative(),
          averageSpeedMph: z.number().nonnegative().nullable(),
          scheduleTimepointCount: z.number().int().nonnegative(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteBatchAuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.string().min(1),
    status: z.enum(["pass", "fail"]),
    routeCount: z.number().int().nonnegative(),
    artifactCount: z.number().int().nonnegative(),
    missingArtifactCount: z.number().int().nonnegative(),
    hashMismatchCount: z.number().int().nonnegative(),
    byteLengthMismatchCount: z.number().int().nonnegative(),
    totalByteLength: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
    builtRouteIds: z.array(z.string()),
    issues: z.array(z.string()),
  })
  .passthrough();

const RouteReliabilityBaselineSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          reliabilityStatus: z.literal("scheduled_baseline_only"),
          scheduledTimepointCount: z.number().int().nonnegative(),
          stopHeadwayGroupCount: z.number().int().nonnegative(),
          headwaySampleCount: z.number().int().nonnegative(),
          medianScheduledHeadwayMinutes: z.number().nonnegative().nullable(),
          p90ScheduledHeadwayMinutes: z.number().nonnegative().nullable(),
          maxScheduledHeadwayMinutes: z.number().nonnegative().nullable(),
          scheduledShortHeadwayShare: z.number().nonnegative().nullable(),
          scheduledLongGapShare: z.number().nonnegative().nullable(),
          topLongGapWindows: z.array(z.unknown()),
          sourceStatus: z.unknown(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteMonthTrendsSchema = z
  .object({
    schemaVersion: z.literal(1),
    startMonth: z.string().regex(/^\d{4}-\d{2}$/),
    endMonth: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          speedObservationCount: z.number().int().nonnegative(),
          speedBusTripCount: z.number().int().nonnegative(),
          averageSpeedMph: z.number().nonnegative().nullable(),
          ridership: z.number().nonnegative().nullable(),
          transfers: z.number().nonnegative().nullable(),
          trendCoverage: z
            .object({
              speed: z.boolean(),
              ridership: z.boolean(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteEquityContextSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          acsYear: z.number().int().min(2000),
          assignmentGeography: z.literal("county_proxy"),
          assignedCountyFips: z.string().nullable(),
          assignedCountyName: z.string().nullable(),
          assignmentMethod: z.enum(["route_id_prefix", "unassigned"]),
          tractCount: z.number().int().nonnegative(),
          totalPopulation: z.number().int().nonnegative().nullable(),
          occupiedHousingUnits: z.number().int().nonnegative().nullable(),
          noVehicleHouseholds: z.number().int().nonnegative().nullable(),
          noVehicleHouseholdShare: z.number().nonnegative().nullable(),
          medianHouseholdIncome: z.number().nonnegative().nullable(),
          povertyRate: z.number().nonnegative().nullable(),
          publicTransitCommuterShare: z.number().nonnegative().nullable(),
          raceEthnicityShare: z
            .object({
              hispanic: z.number().nonnegative().nullable(),
              nonHispanicWhite: z.number().nonnegative().nullable(),
              nonHispanicBlack: z.number().nonnegative().nullable(),
              nonHispanicAsian: z.number().nonnegative().nullable(),
            })
            .strict(),
          sourceStatus: z.unknown(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type D1ExportArgs = {
  year?: number;
  month?: number;
  networkDir?: string;
  trendsDir?: string;
};

type D1ExportResult = {
  isoMonth: string;
  schemaPath: string;
  seedPath: string;
  summaryPath: string;
  routeCount: number;
  artifactRowCount: number;
  comparisonRowCount: number;
  routeCatalogRowCount: number;
  routeCoverageRowCount: number;
  routeReadinessRowCount: number;
  routeBuildPlanRowCount: number;
  routeReliabilityBaselineRowCount: number;
  routeMonthTrendRowCount: number;
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
};

function parseBuildArgs(args: D1ExportArgs = {}): Required<D1ExportArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    networkDir: args.networkDir ?? fromRepoRoot(join("data/working/network")),
    trendsDir: args.trendsDir ?? fromRepoRoot(join("data/working/trends")),
  };
}

function parseCliArgs(args: string[]): D1ExportArgs {
  const output: D1ExportArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--network-dir" && value !== undefined) {
      output.networkDir = fromCliPath(value);
      index += 1;
      continue;
    }

    if (arg === "--trends-dir" && value !== undefined) {
      output.trendsDir = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

async function readRouteMonthTrends(
  path: string,
): Promise<z.output<typeof RouteMonthTrendsSchema>> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return {
      schemaVersion,
      startMonth: "1970-01",
      endMonth: "1970-01",
      rows: [],
    };
  }

  return RouteMonthTrendsSchema.parse(await file.json());
}

export async function exportD1Seed(args: D1ExportArgs = {}): Promise<D1ExportResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const exportDir = fromRepoRoot(join("data/exports/d1", month));
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  const summaryPath = join(exportDir, "export-summary.json");
  await buildRouteBatchAudit({
    year: options.year,
    month: options.month,
  });
  const batch = BatchSummarySchema.parse(
    await Bun.file(join(batchDir, "batch-summary.json")).json(),
  );
  const comparison = RouteComparisonSchema.parse(
    await Bun.file(join(batchDir, "route-comparison.json")).json(),
  );
  const routeCatalog = RouteCatalogSchema.parse(
    await Bun.file(join(options.networkDir, "route-catalog.json")).json(),
  );
  const routeCoverage = RouteMonthCoverageSchema.parse(
    await Bun.file(join(options.networkDir, `route-month-coverage-${month}.json`)).json(),
  );
  const routeReadiness = RouteReadinessSchema.parse(
    await Bun.file(join(batchDir, "route-readiness.json")).json(),
  );
  const routeBuildPlan = RouteBuildPlanSchema.parse(
    await Bun.file(join(batchDir, "route-build-plan.json")).json(),
  );
  const routeBatchAudit = RouteBatchAuditSchema.parse(
    await Bun.file(join(batchDir, "route-batch-audit.json")).json(),
  );
  const routeReliabilityBaseline = RouteReliabilityBaselineSchema.parse(
    await Bun.file(join(batchDir, "route-reliability-baseline.json")).json(),
  );
  const routeMonthTrends = await readRouteMonthTrends(
    join(options.trendsDir, `route-month-trends-2025-01_through_${month}.json`),
  );
  const routeEquityContext = RouteEquityContextSchema.parse(
    await Bun.file(join(batchDir, "route-equity-context.json")).json(),
  );
  const statements: string[] = [
    createServingTablesSql.trim(),
    "DELETE FROM route_catalog;",
    `DELETE FROM route_month_coverage WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_readiness WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_build_plan WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_reliability_baseline WHERE month = ${sqlString(month)};`,
    "DELETE FROM route_month_trend;",
    `DELETE FROM route_equity_context WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_scorecard WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_artifact WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_brief_summary WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_comparison_rank WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_batch_status WHERE month = ${sqlString(month)};`,
  ];
  let artifactRowCount = 0;

  for (const route of routeCatalog.rows) {
    statements.push(
      [
        "INSERT INTO route_catalog",
        "(route_id, route_short_name, route_long_name, route_types_json, directions_json, shape_count, stop_count, timepoint_stop_count, latitude_min, latitude_max, longitude_min, longitude_max)",
        "VALUES",
        `(${sqlString(route.routeId)}, ${sqlString(route.routeShortName)}, ${route.routeLongName === null ? "NULL" : sqlString(route.routeLongName)}, ${sqlJson(route.routeTypes)}, ${sqlJson(route.directions)}, ${route.shapeCount}, ${route.stopCount}, ${route.timepointStopCount}, ${sqlNullableNumber(route.latitudeMin)}, ${sqlNullableNumber(route.latitudeMax)}, ${sqlNullableNumber(route.longitudeMin)}, ${sqlNullableNumber(route.longitudeMax)});`,
      ].join(" "),
    );
  }

  for (const coverage of routeCoverage.rows) {
    statements.push(
      [
        "INSERT INTO route_month_coverage",
        "(route_id, month, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count, has_speed_data, has_schedule_data)",
        "VALUES",
        `(${sqlString(coverage.routeId)}, ${sqlString(month)}, ${coverage.speedObservationCount}, ${coverage.speedBusTripCount}, ${sqlNullableNumber(coverage.averageSpeedMph)}, ${coverage.scheduleTimepointCount}, ${boolInt(coverage.hasSpeedData)}, ${boolInt(coverage.hasScheduleData)});`,
      ].join(" "),
    );
  }

  for (const row of routeReadiness.rows) {
    statements.push(
      [
        "INSERT INTO route_readiness",
        "(route_id, month, route_short_name, route_long_name, readiness_status, build_eligible, readiness_score, missing_inputs_json, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count, shape_count, stop_count, timepoint_stop_count)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.routeShortName)}, ${row.routeLongName === null ? "NULL" : sqlString(row.routeLongName)}, ${sqlString(row.readinessStatus)}, ${boolInt(row.buildEligible)}, ${row.readinessScore}, ${sqlJson(row.missingInputs)}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${row.scheduleTimepointCount}, ${row.shapeCount}, ${row.stopCount}, ${row.timepointStopCount});`,
      ].join(" "),
    );
  }

  for (const row of routeBuildPlan.rows) {
    statements.push(
      [
        "INSERT INTO route_build_plan",
        "(route_id, month, route_short_name, route_long_name, candidate_rank, plan_status, selected_for_next_batch, already_built, build_eligible, priority_score, readiness_status, readiness_score, missing_inputs_json, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.routeShortName)}, ${row.routeLongName === null ? "NULL" : sqlString(row.routeLongName)}, ${sqlNullableNumber(row.candidateRank)}, ${sqlString(row.planStatus)}, ${boolInt(row.selectedForNextBatch)}, ${boolInt(row.alreadyBuilt)}, ${boolInt(row.buildEligible)}, ${row.priorityScore}, ${sqlString(row.readinessStatus)}, ${row.readinessScore}, ${sqlJson(row.missingInputs)}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${row.scheduleTimepointCount});`,
      ].join(" "),
    );
  }

  for (const row of routeReliabilityBaseline.rows) {
    statements.push(
      [
        "INSERT INTO route_reliability_baseline",
        "(route_id, month, reliability_status, scheduled_timepoint_count, stop_headway_group_count, headway_sample_count, median_scheduled_headway_minutes, p90_scheduled_headway_minutes, max_scheduled_headway_minutes, scheduled_short_headway_share, scheduled_long_gap_share, top_long_gap_windows_json, source_status_json)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.reliabilityStatus)}, ${row.scheduledTimepointCount}, ${row.stopHeadwayGroupCount}, ${row.headwaySampleCount}, ${sqlNullableNumber(row.medianScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.p90ScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.maxScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.scheduledShortHeadwayShare)}, ${sqlNullableNumber(row.scheduledLongGapShare)}, ${sqlJson(row.topLongGapWindows)}, ${sqlJson(row.sourceStatus)});`,
      ].join(" "),
    );
  }

  for (const row of routeMonthTrends.rows) {
    statements.push(
      [
        "INSERT INTO route_month_trend",
        "(route_id, month, speed_observation_count, speed_bus_trip_count, average_speed_mph, ridership, transfers, has_speed_trend, has_ridership_trend)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.isoMonth)}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${sqlNullableNumber(row.ridership)}, ${sqlNullableNumber(row.transfers)}, ${boolInt(row.trendCoverage.speed)}, ${boolInt(row.trendCoverage.ridership)});`,
      ].join(" "),
    );
  }

  for (const row of routeEquityContext.rows) {
    statements.push(
      [
        "INSERT INTO route_equity_context",
        "(route_id, month, acs_year, assignment_geography, assigned_county_fips, assigned_county_name, assignment_method, tract_count, total_population, occupied_housing_units, no_vehicle_households, no_vehicle_household_share, median_household_income, poverty_rate, public_transit_commuter_share, hispanic_share, non_hispanic_white_share, non_hispanic_black_share, non_hispanic_asian_share, source_status_json)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.isoMonth)}, ${row.acsYear}, ${sqlString(row.assignmentGeography)}, ${row.assignedCountyFips === null ? "NULL" : sqlString(row.assignedCountyFips)}, ${row.assignedCountyName === null ? "NULL" : sqlString(row.assignedCountyName)}, ${sqlString(row.assignmentMethod)}, ${row.tractCount}, ${sqlNullableNumber(row.totalPopulation)}, ${sqlNullableNumber(row.occupiedHousingUnits)}, ${sqlNullableNumber(row.noVehicleHouseholds)}, ${sqlNullableNumber(row.noVehicleHouseholdShare)}, ${sqlNullableNumber(row.medianHouseholdIncome)}, ${sqlNullableNumber(row.povertyRate)}, ${sqlNullableNumber(row.publicTransitCommuterShare)}, ${sqlNullableNumber(row.raceEthnicityShare.hispanic)}, ${sqlNullableNumber(row.raceEthnicityShare.nonHispanicWhite)}, ${sqlNullableNumber(row.raceEthnicityShare.nonHispanicBlack)}, ${sqlNullableNumber(row.raceEthnicityShare.nonHispanicAsian)}, ${sqlJson(row.sourceStatus)});`,
      ].join(" "),
    );
  }

  for (const route of batch.routes) {
    const routeDir = fromRepoRoot(
      join("data/artifacts/route-slices", routeSliceKey(route.routeId, month)),
    );
    const catalogRow = routeCatalog.rows.find((row) => row.routeId === route.routeId);
    const manifest = ArtifactManifestSchema.parse(
      await Bun.file(join(routeDir, "artifact-manifest.json")).json(),
    );
    const brief = RouteBriefInputSchema.parse(
      await Bun.file(join(routeDir, "route-brief-input.json")).json(),
    );
    const scheduleMatchRate =
      brief.metrics.hotspotCount === 0
        ? 0
        : brief.metrics.scheduleMatchedHotspotCount / brief.metrics.hotspotCount;
    const coverageStatus = brief.metrics.coverageStatus ?? "full";
    const visibility = classifyPublicRouteVisibility({
      routeId: brief.routeId,
      routeLongName: catalogRow?.routeLongName ?? null,
      routeTypes: catalogRow?.routeTypes ?? [],
      shapeCount: catalogRow?.shapeCount ?? 0,
      coverageStatus,
    });

    statements.push(
      [
        "INSERT INTO route_scorecard",
        "(route_id, month, route_score, coverage_status, average_speed_mph, hotspot_count, citations_json)",
        "VALUES",
        `(${sqlString(brief.routeId)}, ${sqlString(month)}, ${brief.metrics.routeScore}, ${sqlString(coverageStatus)}, ${brief.metrics.averageSpeedMph}, ${brief.metrics.hotspotCount}, '[]');`,
      ].join(" "),
    );
    statements.push(
      [
        "INSERT INTO route_brief_summary",
        "(route_id, month, route_score, public_visible, public_visibility_reason, average_speed_mph, hotspot_count, total_ridership, total_transfers, ace_active, ace_violation_count, bus_lane_matched_lane_count, schedule_match_rate, peak_ridership_json, slowest_window_json)",
        "VALUES",
        `(${sqlString(brief.routeId)}, ${sqlString(month)}, ${brief.metrics.routeScore}, ${boolInt(visibility.publicVisible)}, ${sqlString(visibility.reason)}, ${brief.metrics.averageSpeedMph}, ${brief.metrics.hotspotCount}, ${brief.metrics.totalRidership}, ${brief.metrics.totalTransfers}, ${boolInt(brief.interventionStatus.aceActiveDuringAnalysisPeriod)}, ${brief.interventionStatus.aceViolationCount}, ${brief.interventionStatus.busLaneMatchedLaneCount}, ${scheduleMatchRate}, ${sqlJson(brief.ridershipProfile.peakRidershipWindow)}, ${sqlJson(brief.speedProfile.slowestDayHourWindows[0] ?? null)});`,
      ].join(" "),
    );

    for (const artifact of manifest.artifacts) {
      artifactRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_artifact",
          "(route_id, month, artifact_name, artifact_key, content_type, byte_length, sha256)",
          "VALUES",
          `(${sqlString(manifest.routeId)}, ${sqlString(month)}, ${sqlString(artifact.name)}, ${sqlString(artifact.artifactKey)}, ${sqlString(artifact.contentType)}, ${artifact.byteLength}, ${sqlString(artifact.sha256)});`,
        ].join(" "),
      );
    }
  }

  comparison.rankedRoutes.forEach((route, index) => {
    statements.push(
      [
        "INSERT INTO route_comparison_rank",
        "(month, rank, route_id, route_score, average_speed_mph, total_ridership, ace_violation_count, bus_lane_matched_lane_count)",
        "VALUES",
        `(${sqlString(month)}, ${index + 1}, ${sqlString(route.routeId)}, ${route.routeScore}, ${route.averageSpeedMph}, ${route.totalRidership}, ${route.aceViolationCount}, ${route.busLaneMatchedLaneCount});`,
      ].join(" "),
    );
  });

  statements.push(
    [
      "INSERT INTO route_batch_status",
      "(month, generated_at, status, route_count, artifact_count, missing_artifact_count, hash_mismatch_count, byte_length_mismatch_count, total_byte_length, issue_count, built_route_ids_json, issues_json)",
      "VALUES",
      `(${sqlString(month)}, ${sqlString(routeBatchAudit.generatedAt)}, ${sqlString(routeBatchAudit.status)}, ${routeBatchAudit.routeCount}, ${routeBatchAudit.artifactCount}, ${routeBatchAudit.missingArtifactCount}, ${routeBatchAudit.hashMismatchCount}, ${routeBatchAudit.byteLengthMismatchCount}, ${routeBatchAudit.totalByteLength}, ${routeBatchAudit.issueCount}, ${sqlJson(routeBatchAudit.builtRouteIds)}, ${sqlJson(routeBatchAudit.issues)});`,
    ].join(" "),
  );

  const summary = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    routeCount: batch.routes.length,
    artifactRowCount,
    comparisonRowCount: comparison.rankedRoutes.length,
    routeCatalogRowCount: routeCatalog.rows.length,
    routeCoverageRowCount: routeCoverage.rows.length,
    routeReadinessRowCount: routeReadiness.rows.length,
    routeBuildPlanRowCount: routeBuildPlan.rows.length,
    routeReliabilityBaselineRowCount: routeReliabilityBaseline.rows.length,
    routeMonthTrendRowCount: routeMonthTrends.rows.length,
    routeEquityContextRowCount: routeEquityContext.rows.length,
    routeBatchStatusRowCount: 1,
    schemaPath,
    seedPath,
  };

  await mkdir(exportDir, { recursive: true });
  await Promise.all([
    Bun.write(schemaPath, `${createServingTablesSql.trim()}\n`),
    Bun.write(seedPath, `${statements.join("\n")}\n`),
    writeJson(summaryPath, summary),
  ]);

  return {
    isoMonth: month,
    schemaPath,
    seedPath,
    summaryPath,
    routeCount: batch.routes.length,
    artifactRowCount,
    comparisonRowCount: comparison.rankedRoutes.length,
    routeCatalogRowCount: routeCatalog.rows.length,
    routeCoverageRowCount: routeCoverage.rows.length,
    routeReadinessRowCount: routeReadiness.rows.length,
    routeBuildPlanRowCount: routeBuildPlan.rows.length,
    routeReliabilityBaselineRowCount: routeReliabilityBaseline.rows.length,
    routeMonthTrendRowCount: routeMonthTrends.rows.length,
    routeEquityContextRowCount: routeEquityContext.rows.length,
    routeBatchStatusRowCount: 1,
  };
}

export async function exportD1SeedFromCli(args: string[]): Promise<D1ExportResult> {
  return exportD1Seed(parseCliArgs(args));
}

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { classifyPublicRouteVisibility } from "@bp/analytics";
import { boolInt, sqlNullableNumber, sqlNullableString, sqlString } from "@bp/db/d1/seed";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";
import { readD1MigrationSql } from "./d1-migrations.js";

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

const PeakRidershipWindowSchema = z
  .object({
    dayOfWeek: z.string().min(1),
    hourOfDay: z.number().int().min(0).max(23),
    ridership: z.number().nonnegative().optional(),
    transfers: z.number().nonnegative().optional(),
    matchedObservationCount: z.number().int().nonnegative().optional(),
    busTripCount: z.number().int().nonnegative().optional(),
    weightedAverageSpeedMph: z.number().nonnegative().optional(),
    slowObservationShare: z.number().nonnegative().optional(),
  })
  .passthrough();

const SlowestWindowSchema = z
  .object({
    dayOfWeek: z.string().min(1),
    hourOfDay: z.number().int().min(0).max(23),
    observationCount: z.number().int().nonnegative().optional(),
    busTripCount: z.number().int().nonnegative().optional(),
    segmentCount: z.number().int().nonnegative().optional(),
    weightedAverageSpeedMph: z.number().nonnegative().optional(),
    weightedAverageTravelTimeMinutes: z.number().nonnegative().optional(),
    slowObservationShare: z.number().nonnegative().optional(),
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

const ReliabilityGapWindowSchema = z
  .object({
    dayType: z.string().min(1),
    direction: z.string().min(1),
    stopId: z.string().min(1),
    stopName: z.string().nullable().optional(),
    sampleCount: z.number().int().nonnegative(),
    medianHeadwayMinutes: z.number().nonnegative(),
    p90HeadwayMinutes: z.number().nonnegative(),
    maxHeadwayMinutes: z.number().nonnegative(),
  })
  .passthrough();

const SourceStatusSchema = z.record(z.string(), z.unknown());

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
  routeCatalogTypeRowCount: number;
  routeDirectionRowCount: number;
  routeCoverageRowCount: number;
  routeReadinessRowCount: number;
  routeReadinessMissingInputRowCount: number;
  routeBuildPlanRowCount: number;
  routeReliabilityBaselineRowCount: number;
  routeReliabilityGapWindowRowCount: number;
  routeMonthSourceStatusRowCount: number;
  routeMonthTrendRowCount: number;
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
  routeBatchBuiltRouteRowCount: number;
  routeBatchIssueRowCount: number;
  routeBriefPeakWindowRowCount: number;
  routeBriefSlowestWindowRowCount: number;
  routeScorecardCitationRowCount: number;
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

function sqlOptionalNumber(value: number | undefined): string {
  return sqlNullableNumber(value ?? null);
}

function sourceStatusRows(input: {
  routeId: string;
  month: string;
  sourceScope: "reliability" | "equity_context";
  sourceStatus: unknown;
}): string[] {
  const status = SourceStatusSchema.parse(input.sourceStatus);

  return Object.entries(status).map(([sourceId, value]) =>
    [
      "INSERT INTO route_month_source_status",
      "(route_id, month, source_scope, source_id, status, row_count, snapshot_id, note)",
      "VALUES",
      `(${sqlString(input.routeId)}, ${sqlString(input.month)}, ${sqlString(input.sourceScope)}, ${sqlString(sourceId)}, ${sqlString(String(value))}, NULL, NULL, NULL);`,
    ].join(" "),
  );
}

function routeBatchIssueParts(issue: string): {
  routeId: string | null;
  issueCode: string;
  message: string;
} {
  const [routeId, issueCode] = issue.split(":");

  return {
    routeId: routeId === undefined || routeId.length === 0 ? null : routeId,
    issueCode: issueCode === undefined || issueCode.length === 0 ? "unknown" : issueCode,
    message: issue,
  };
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
  const schemaSql = await readD1MigrationSql();
  const statements: string[] = [
    "DELETE FROM route_catalog_type;",
    "DELETE FROM route_direction;",
    "DELETE FROM route_catalog;",
    `DELETE FROM route_month_coverage WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_readiness_missing_input WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_readiness WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_build_plan WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_reliability_gap_window WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_month_source_status WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_reliability_baseline WHERE month = ${sqlString(month)};`,
    "DELETE FROM route_month_trend;",
    `DELETE FROM route_equity_context WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_scorecard_citation WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_scorecard WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_artifact WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_brief_peak_window WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_brief_slowest_window WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_brief_summary WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_comparison_rank WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_batch_built_route WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_batch_issue WHERE month = ${sqlString(month)};`,
    `DELETE FROM route_batch_status WHERE month = ${sqlString(month)};`,
  ];
  let artifactRowCount = 0;
  let routeCatalogTypeRowCount = 0;
  let routeDirectionRowCount = 0;
  let routeReadinessMissingInputRowCount = 0;
  let routeReliabilityGapWindowRowCount = 0;
  let routeMonthSourceStatusRowCount = 0;
  let routeBriefPeakWindowRowCount = 0;
  let routeBriefSlowestWindowRowCount = 0;
  let routeBatchBuiltRouteRowCount = 0;
  let routeBatchIssueRowCount = 0;
  const routeScorecardCitationRowCount = 0;

  for (const route of routeCatalog.rows) {
    statements.push(
      [
        "INSERT INTO route_catalog",
        "(route_id, route_short_name, route_long_name, shape_count, stop_count, timepoint_stop_count, latitude_min, latitude_max, longitude_min, longitude_max)",
        "VALUES",
        `(${sqlString(route.routeId)}, ${sqlString(route.routeShortName)}, ${sqlNullableString(route.routeLongName)}, ${route.shapeCount}, ${route.stopCount}, ${route.timepointStopCount}, ${sqlNullableNumber(route.latitudeMin)}, ${sqlNullableNumber(route.latitudeMax)}, ${sqlNullableNumber(route.longitudeMin)}, ${sqlNullableNumber(route.longitudeMax)});`,
      ].join(" "),
    );

    route.routeTypes.forEach((routeType, index) => {
      routeCatalogTypeRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_catalog_type",
          "(route_id, type_rank, route_type)",
          "VALUES",
          `(${sqlString(route.routeId)}, ${index + 1}, ${sqlString(routeType)});`,
        ].join(" "),
      );
    });

    route.directions.forEach((direction, index) => {
      routeDirectionRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_direction",
          "(route_id, direction_id, direction_name)",
          "VALUES",
          `(${sqlString(route.routeId)}, ${index}, ${sqlString(direction)});`,
        ].join(" "),
      );
    });
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
        "(route_id, month, route_short_name, route_long_name, readiness_status, build_eligible, readiness_score, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count, shape_count, stop_count, timepoint_stop_count)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.routeShortName)}, ${sqlNullableString(row.routeLongName)}, ${sqlString(row.readinessStatus)}, ${boolInt(row.buildEligible)}, ${row.readinessScore}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${row.scheduleTimepointCount}, ${row.shapeCount}, ${row.stopCount}, ${row.timepointStopCount});`,
      ].join(" "),
    );

    row.missingInputs.forEach((inputName, index) => {
      routeReadinessMissingInputRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_readiness_missing_input",
          "(route_id, month, input_rank, input_name, severity, note)",
          "VALUES",
          `(${sqlString(row.routeId)}, ${sqlString(month)}, ${index + 1}, ${sqlString(inputName)}, 'blocking', NULL);`,
        ].join(" "),
      );
    });
  }

  for (const row of routeBuildPlan.rows) {
    statements.push(
      [
        "INSERT INTO route_build_plan",
        "(route_id, month, route_short_name, route_long_name, candidate_rank, plan_status, selected_for_next_batch, already_built, build_eligible, priority_score, readiness_status, readiness_score, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.routeShortName)}, ${sqlNullableString(row.routeLongName)}, ${sqlNullableNumber(row.candidateRank)}, ${sqlString(row.planStatus)}, ${boolInt(row.selectedForNextBatch)}, ${boolInt(row.alreadyBuilt)}, ${boolInt(row.buildEligible)}, ${row.priorityScore}, ${sqlString(row.readinessStatus)}, ${row.readinessScore}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${row.scheduleTimepointCount});`,
      ].join(" "),
    );
  }

  for (const row of routeReliabilityBaseline.rows) {
    statements.push(
      [
        "INSERT INTO route_reliability_baseline",
        "(route_id, month, reliability_status, scheduled_timepoint_count, stop_headway_group_count, headway_sample_count, median_scheduled_headway_minutes, p90_scheduled_headway_minutes, max_scheduled_headway_minutes, scheduled_short_headway_share, scheduled_long_gap_share)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.reliabilityStatus)}, ${row.scheduledTimepointCount}, ${row.stopHeadwayGroupCount}, ${row.headwaySampleCount}, ${sqlNullableNumber(row.medianScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.p90ScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.maxScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.scheduledShortHeadwayShare)}, ${sqlNullableNumber(row.scheduledLongGapShare)});`,
      ].join(" "),
    );

    row.topLongGapWindows.forEach((window, index) => {
      const parsed = ReliabilityGapWindowSchema.parse(window);
      routeReliabilityGapWindowRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_reliability_gap_window",
          "(route_id, month, window_rank, day_type, direction_id, stop_id, stop_name, sample_count, median_headway_minutes, p90_headway_minutes, max_headway_minutes)",
          "VALUES",
          `(${sqlString(row.routeId)}, ${sqlString(month)}, ${index + 1}, ${sqlString(parsed.dayType)}, ${sqlString(parsed.direction)}, ${sqlString(parsed.stopId)}, ${sqlNullableString(parsed.stopName ?? null)}, ${parsed.sampleCount}, ${parsed.medianHeadwayMinutes}, ${parsed.p90HeadwayMinutes}, ${parsed.maxHeadwayMinutes});`,
        ].join(" "),
      );
    });

    const statusStatements = sourceStatusRows({
      routeId: row.routeId,
      month,
      sourceScope: "reliability",
      sourceStatus: row.sourceStatus,
    });
    routeMonthSourceStatusRowCount += statusStatements.length;
    statements.push(...statusStatements);
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
        "(route_id, month, acs_year, assignment_geography, assigned_county_fips, assigned_county_name, assignment_method, tract_count, total_population, occupied_housing_units, no_vehicle_households, no_vehicle_household_share, median_household_income, poverty_rate, public_transit_commuter_share, hispanic_share, non_hispanic_white_share, non_hispanic_black_share, non_hispanic_asian_share)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.isoMonth)}, ${row.acsYear}, ${sqlString(row.assignmentGeography)}, ${sqlNullableString(row.assignedCountyFips)}, ${sqlNullableString(row.assignedCountyName)}, ${sqlString(row.assignmentMethod)}, ${row.tractCount}, ${sqlNullableNumber(row.totalPopulation)}, ${sqlNullableNumber(row.occupiedHousingUnits)}, ${sqlNullableNumber(row.noVehicleHouseholds)}, ${sqlNullableNumber(row.noVehicleHouseholdShare)}, ${sqlNullableNumber(row.medianHouseholdIncome)}, ${sqlNullableNumber(row.povertyRate)}, ${sqlNullableNumber(row.publicTransitCommuterShare)}, ${sqlNullableNumber(row.raceEthnicityShare.hispanic)}, ${sqlNullableNumber(row.raceEthnicityShare.nonHispanicWhite)}, ${sqlNullableNumber(row.raceEthnicityShare.nonHispanicBlack)}, ${sqlNullableNumber(row.raceEthnicityShare.nonHispanicAsian)});`,
      ].join(" "),
    );

    const statusStatements = sourceStatusRows({
      routeId: row.routeId,
      month: row.isoMonth,
      sourceScope: "equity_context",
      sourceStatus: row.sourceStatus,
    });
    routeMonthSourceStatusRowCount += statusStatements.length;
    statements.push(...statusStatements);
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
        "(route_id, month, route_score, coverage_status, average_speed_mph, hotspot_count)",
        "VALUES",
        `(${sqlString(brief.routeId)}, ${sqlString(month)}, ${brief.metrics.routeScore}, ${sqlString(coverageStatus)}, ${brief.metrics.averageSpeedMph}, ${brief.metrics.hotspotCount});`,
      ].join(" "),
    );
    statements.push(
      [
        "INSERT INTO route_brief_summary",
        "(route_id, month, route_score, public_visible, public_visibility_reason, average_speed_mph, hotspot_count, total_ridership, total_transfers, ace_active, ace_violation_count, bus_lane_matched_lane_count, schedule_match_rate)",
        "VALUES",
        `(${sqlString(brief.routeId)}, ${sqlString(month)}, ${brief.metrics.routeScore}, ${boolInt(visibility.publicVisible)}, ${sqlString(visibility.reason)}, ${brief.metrics.averageSpeedMph}, ${brief.metrics.hotspotCount}, ${brief.metrics.totalRidership}, ${brief.metrics.totalTransfers}, ${boolInt(brief.interventionStatus.aceActiveDuringAnalysisPeriod)}, ${brief.interventionStatus.aceViolationCount}, ${brief.interventionStatus.busLaneMatchedLaneCount}, ${scheduleMatchRate});`,
      ].join(" "),
    );

    if (brief.ridershipProfile.peakRidershipWindow !== null) {
      const window = PeakRidershipWindowSchema.parse(brief.ridershipProfile.peakRidershipWindow);
      routeBriefPeakWindowRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_brief_peak_window",
          "(route_id, month, window_rank, day_of_week, hour_of_day, ridership, transfers, matched_observation_count, bus_trip_count, weighted_average_speed_mph, slow_observation_share)",
          "VALUES",
          `(${sqlString(brief.routeId)}, ${sqlString(month)}, 1, ${sqlString(window.dayOfWeek)}, ${window.hourOfDay}, ${sqlOptionalNumber(window.ridership)}, ${sqlOptionalNumber(window.transfers)}, ${sqlOptionalNumber(window.matchedObservationCount)}, ${sqlOptionalNumber(window.busTripCount)}, ${sqlOptionalNumber(window.weightedAverageSpeedMph)}, ${sqlOptionalNumber(window.slowObservationShare)});`,
        ].join(" "),
      );
    }

    const slowestWindow = brief.speedProfile.slowestDayHourWindows[0];
    if (slowestWindow !== undefined) {
      const window = SlowestWindowSchema.parse(slowestWindow);
      routeBriefSlowestWindowRowCount += 1;
      statements.push(
        [
          "INSERT INTO route_brief_slowest_window",
          "(route_id, month, window_rank, day_of_week, hour_of_day, observation_count, bus_trip_count, segment_count, weighted_average_speed_mph, weighted_average_travel_time_minutes, slow_observation_share)",
          "VALUES",
          `(${sqlString(brief.routeId)}, ${sqlString(month)}, 1, ${sqlString(window.dayOfWeek)}, ${window.hourOfDay}, ${sqlOptionalNumber(window.observationCount)}, ${sqlOptionalNumber(window.busTripCount)}, ${sqlOptionalNumber(window.segmentCount)}, ${sqlOptionalNumber(window.weightedAverageSpeedMph)}, ${sqlOptionalNumber(window.weightedAverageTravelTimeMinutes)}, ${sqlOptionalNumber(window.slowObservationShare)});`,
        ].join(" "),
      );
    }

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
      "(month, generated_at, status, route_count, artifact_count, missing_artifact_count, hash_mismatch_count, byte_length_mismatch_count, total_byte_length, issue_count)",
      "VALUES",
      `(${sqlString(month)}, ${sqlString(routeBatchAudit.generatedAt)}, ${sqlString(routeBatchAudit.status)}, ${routeBatchAudit.routeCount}, ${routeBatchAudit.artifactCount}, ${routeBatchAudit.missingArtifactCount}, ${routeBatchAudit.hashMismatchCount}, ${routeBatchAudit.byteLengthMismatchCount}, ${routeBatchAudit.totalByteLength}, ${routeBatchAudit.issueCount});`,
    ].join(" "),
  );

  routeBatchAudit.builtRouteIds.forEach((routeId, index) => {
    routeBatchBuiltRouteRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_batch_built_route",
        "(month, route_rank, route_id, artifact_count, status)",
        "VALUES",
        `(${sqlString(month)}, ${index + 1}, ${sqlString(routeId)}, NULL, 'built');`,
      ].join(" "),
    );
  });

  routeBatchAudit.issues.forEach((issue, index) => {
    const parts = routeBatchIssueParts(issue);
    routeBatchIssueRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_batch_issue",
        "(month, issue_rank, route_id, severity, issue_code, message)",
        "VALUES",
        `(${sqlString(month)}, ${index + 1}, ${sqlNullableString(parts.routeId)}, 'error', ${sqlString(parts.issueCode)}, ${sqlString(parts.message)});`,
      ].join(" "),
    );
  });

  const summary = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    routeCount: batch.routes.length,
    artifactRowCount,
    comparisonRowCount: comparison.rankedRoutes.length,
    routeCatalogRowCount: routeCatalog.rows.length,
    routeCatalogTypeRowCount,
    routeDirectionRowCount,
    routeCoverageRowCount: routeCoverage.rows.length,
    routeReadinessRowCount: routeReadiness.rows.length,
    routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: routeBuildPlan.rows.length,
    routeReliabilityBaselineRowCount: routeReliabilityBaseline.rows.length,
    routeReliabilityGapWindowRowCount,
    routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: routeMonthTrends.rows.length,
    routeEquityContextRowCount: routeEquityContext.rows.length,
    routeBatchStatusRowCount: 1,
    routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount,
    schemaPath,
    seedPath,
  };

  await mkdir(exportDir, { recursive: true });
  await Promise.all([
    Bun.write(schemaPath, schemaSql),
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
    routeCatalogTypeRowCount,
    routeDirectionRowCount,
    routeCoverageRowCount: routeCoverage.rows.length,
    routeReadinessRowCount: routeReadiness.rows.length,
    routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: routeBuildPlan.rows.length,
    routeReliabilityBaselineRowCount: routeReliabilityBaseline.rows.length,
    routeReliabilityGapWindowRowCount,
    routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: routeMonthTrends.rows.length,
    routeEquityContextRowCount: routeEquityContext.rows.length,
    routeBatchStatusRowCount: 1,
    routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount,
  };
}

export async function exportD1SeedFromCli(args: string[]): Promise<D1ExportResult> {
  return exportD1Seed(parseCliArgs(args));
}

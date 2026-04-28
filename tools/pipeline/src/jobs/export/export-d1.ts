import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { boolInt, sqlNullableNumber, sqlNullableString, sqlString } from "@bp/db/d1/seed";
import {
  getRouteBatchStatus,
  listRouteArtifacts,
  listRouteBatchBuiltRoutes,
  listRouteBatchIssues,
  listRouteBriefPeakWindows,
  listRouteBriefSlowestWindows,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteCatalog,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteMonthCoverage,
  listRouteMonthSourceStatuses,
  listRouteMonthTrends,
  listRouteReadiness,
  listRouteReliabilityBaselines,
  listRouteReliabilityGapWindows,
  listRouteScorecards,
} from "@bp/db/local";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";
import { readD1MigrationSql } from "./d1-migrations.js";

const schemaVersion = 1;

type D1ExportArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
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
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
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

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
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

async function readLocalD1Inputs(path: string, month: string) {
  const local = await openLocalPipelineDb(path);

  try {
    const [
      routeCatalog,
      routeCoverage,
      routeReadiness,
      routeBuildPlan,
      routeReliabilityBaseline,
      routeReliabilityGapWindows,
      routeMonthSourceStatuses,
      routeMonthTrends,
      routeEquityContext,
      routeArtifacts,
      routeScorecards,
      routeBriefSummaries,
      routeBriefPeakWindows,
      routeBriefSlowestWindows,
      routeComparisonRanks,
      routeBatchStatus,
      routeBatchBuiltRoutes,
      routeBatchIssues,
    ] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteMonthCoverage(local.db, month),
      listRouteReadiness(local.db, month),
      listRouteBuildPlan(local.db, month),
      listRouteReliabilityBaselines(local.db, month),
      listRouteReliabilityGapWindows(local.db, month),
      listRouteMonthSourceStatuses(local.db, month),
      listRouteMonthTrends(local.db),
      listRouteEquityContexts(local.db, month),
      listRouteArtifacts(local.db, month),
      listRouteScorecards(local.db, month),
      listRouteBriefSummaries(local.db, month),
      listRouteBriefPeakWindows(local.db, month),
      listRouteBriefSlowestWindows(local.db, month),
      listRouteComparisonRanks(local.db, month),
      getRouteBatchStatus(local.db, month),
      listRouteBatchBuiltRoutes(local.db, month),
      listRouteBatchIssues(local.db, month),
    ]);

    return {
      routeCatalog,
      routeCoverage,
      routeReadiness,
      routeBuildPlan,
      routeReliabilityBaseline,
      routeReliabilityGapWindows,
      routeMonthSourceStatuses,
      routeMonthTrends,
      routeEquityContext,
      routeArtifacts,
      routeScorecards,
      routeBriefSummaries,
      routeBriefPeakWindows,
      routeBriefSlowestWindows,
      routeComparisonRanks,
      routeBatchStatus,
      routeBatchBuiltRoutes,
      routeBatchIssues,
    };
  } finally {
    local.sqlite.close();
  }
}

export async function exportD1Seed(args: D1ExportArgs = {}): Promise<D1ExportResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const exportDir = fromRepoRoot(join("data/exports/d1", month));
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  const summaryPath = join(exportDir, "export-summary.json");
  await buildRouteBatchAudit({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  });
  const {
    routeCatalog,
    routeCoverage,
    routeReadiness,
    routeBuildPlan,
    routeReliabilityBaseline,
    routeReliabilityGapWindows,
    routeMonthSourceStatuses,
    routeMonthTrends,
    routeEquityContext,
    routeArtifacts,
    routeScorecards,
    routeBriefSummaries,
    routeBriefPeakWindows,
    routeBriefSlowestWindows,
    routeComparisonRanks,
    routeBatchStatus,
    routeBatchBuiltRoutes,
    routeBatchIssues,
  } = await readLocalD1Inputs(options.dbPath, month);
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

  for (const route of routeCatalog) {
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

  for (const coverage of routeCoverage) {
    statements.push(
      [
        "INSERT INTO route_month_coverage",
        "(route_id, month, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count, has_speed_data, has_schedule_data)",
        "VALUES",
        `(${sqlString(coverage.routeId)}, ${sqlString(month)}, ${coverage.speedObservationCount}, ${coverage.speedBusTripCount}, ${sqlNullableNumber(coverage.averageSpeedMph)}, ${coverage.scheduleTimepointCount}, ${boolInt(coverage.hasSpeedData)}, ${boolInt(coverage.hasScheduleData)});`,
      ].join(" "),
    );
  }

  for (const row of routeReadiness) {
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

  for (const row of routeBuildPlan) {
    statements.push(
      [
        "INSERT INTO route_build_plan",
        "(route_id, month, route_short_name, route_long_name, candidate_rank, plan_status, selected_for_next_batch, already_built, build_eligible, priority_score, readiness_status, readiness_score, speed_observation_count, speed_bus_trip_count, average_speed_mph, schedule_timepoint_count)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(month)}, ${sqlString(row.routeShortName)}, ${sqlNullableString(row.routeLongName)}, ${sqlNullableNumber(row.candidateRank)}, ${sqlString(row.planStatus)}, ${boolInt(row.selectedForNextBatch)}, ${boolInt(row.alreadyBuilt)}, ${boolInt(row.buildEligible)}, ${row.priorityScore}, ${sqlString(row.readinessStatus)}, ${row.readinessScore}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${row.scheduleTimepointCount});`,
      ].join(" "),
    );
  }

  for (const row of routeReliabilityBaseline) {
    statements.push(
      [
        "INSERT INTO route_reliability_baseline",
        "(route_id, month, reliability_status, scheduled_timepoint_count, stop_headway_group_count, headway_sample_count, median_scheduled_headway_minutes, p90_scheduled_headway_minutes, max_scheduled_headway_minutes, scheduled_short_headway_share, scheduled_long_gap_share)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.month)}, ${sqlString(row.reliabilityStatus)}, ${row.scheduledTimepointCount}, ${row.stopHeadwayGroupCount}, ${row.headwaySampleCount}, ${sqlNullableNumber(row.medianScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.p90ScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.maxScheduledHeadwayMinutes)}, ${sqlNullableNumber(row.scheduledShortHeadwayShare)}, ${sqlNullableNumber(row.scheduledLongGapShare)});`,
      ].join(" "),
    );
  }

  for (const window of routeReliabilityGapWindows) {
    routeReliabilityGapWindowRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_reliability_gap_window",
        "(route_id, month, window_rank, day_type, direction_id, stop_id, stop_name, sample_count, median_headway_minutes, p90_headway_minutes, max_headway_minutes)",
        "VALUES",
        `(${sqlString(window.routeId)}, ${sqlString(window.month)}, ${window.windowRank}, ${sqlString(window.dayType)}, ${sqlString(window.directionId)}, ${sqlString(window.stopId)}, ${sqlNullableString(window.stopName)}, ${window.sampleCount}, ${window.medianHeadwayMinutes}, ${window.p90HeadwayMinutes}, ${window.maxHeadwayMinutes});`,
      ].join(" "),
    );
  }

  for (const row of routeMonthSourceStatuses) {
    routeMonthSourceStatusRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_month_source_status",
        "(route_id, month, source_scope, source_id, status, row_count, snapshot_id, note)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.month)}, ${sqlString(row.sourceScope)}, ${sqlString(row.sourceId)}, ${sqlString(row.status)}, ${sqlNullableNumber(row.rowCount)}, ${sqlNullableString(row.snapshotId)}, ${sqlNullableString(row.note)});`,
      ].join(" "),
    );
  }

  for (const row of routeMonthTrends) {
    statements.push(
      [
        "INSERT INTO route_month_trend",
        "(route_id, month, speed_observation_count, speed_bus_trip_count, average_speed_mph, ridership, transfers, has_speed_trend, has_ridership_trend)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.month)}, ${row.speedObservationCount}, ${row.speedBusTripCount}, ${sqlNullableNumber(row.averageSpeedMph)}, ${sqlNullableNumber(row.ridership)}, ${sqlNullableNumber(row.transfers)}, ${boolInt(row.hasSpeedTrend)}, ${boolInt(row.hasRidershipTrend)});`,
      ].join(" "),
    );
  }

  for (const row of routeEquityContext) {
    statements.push(
      [
        "INSERT INTO route_equity_context",
        "(route_id, month, acs_year, assignment_geography, assigned_county_fips, assigned_county_name, assignment_method, tract_count, total_population, occupied_housing_units, no_vehicle_households, no_vehicle_household_share, median_household_income, poverty_rate, public_transit_commuter_share, hispanic_share, non_hispanic_white_share, non_hispanic_black_share, non_hispanic_asian_share)",
        "VALUES",
        `(${sqlString(row.routeId)}, ${sqlString(row.month)}, ${row.acsYear}, ${sqlString(row.assignmentGeography)}, ${sqlNullableString(row.assignedCountyFips)}, ${sqlNullableString(row.assignedCountyName)}, ${sqlString(row.assignmentMethod)}, ${row.tractCount}, ${sqlNullableNumber(row.totalPopulation)}, ${sqlNullableNumber(row.occupiedHousingUnits)}, ${sqlNullableNumber(row.noVehicleHouseholds)}, ${sqlNullableNumber(row.noVehicleHouseholdShare)}, ${sqlNullableNumber(row.medianHouseholdIncome)}, ${sqlNullableNumber(row.povertyRate)}, ${sqlNullableNumber(row.publicTransitCommuterShare)}, ${sqlNullableNumber(row.hispanicShare)}, ${sqlNullableNumber(row.nonHispanicWhiteShare)}, ${sqlNullableNumber(row.nonHispanicBlackShare)}, ${sqlNullableNumber(row.nonHispanicAsianShare)});`,
      ].join(" "),
    );
  }

  for (const scorecard of routeScorecards) {
    statements.push(
      [
        "INSERT INTO route_scorecard",
        "(route_id, month, route_score, coverage_status, average_speed_mph, hotspot_count)",
        "VALUES",
        `(${sqlString(scorecard.routeId)}, ${sqlString(scorecard.month)}, ${scorecard.routeScore}, ${sqlString(scorecard.coverageStatus)}, ${scorecard.averageSpeedMph}, ${scorecard.hotspotCount});`,
      ].join(" "),
    );
  }

  for (const brief of routeBriefSummaries) {
    statements.push(
      [
        "INSERT INTO route_brief_summary",
        "(route_id, month, route_score, public_visible, public_visibility_reason, average_speed_mph, hotspot_count, total_ridership, total_transfers, ace_active, ace_violation_count, bus_lane_matched_lane_count, schedule_match_rate)",
        "VALUES",
        `(${sqlString(brief.routeId)}, ${sqlString(brief.month)}, ${brief.routeScore}, ${boolInt(brief.publicVisible)}, ${sqlString(brief.publicVisibilityReason)}, ${brief.averageSpeedMph}, ${brief.hotspotCount}, ${brief.totalRidership}, ${brief.totalTransfers}, ${boolInt(brief.aceActive)}, ${brief.aceViolationCount}, ${brief.busLaneMatchedLaneCount}, ${brief.scheduleMatchRate});`,
      ].join(" "),
    );
  }

  for (const window of routeBriefPeakWindows) {
    routeBriefPeakWindowRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_brief_peak_window",
        "(route_id, month, window_rank, day_of_week, hour_of_day, ridership, transfers, matched_observation_count, bus_trip_count, weighted_average_speed_mph, slow_observation_share)",
        "VALUES",
        `(${sqlString(window.routeId)}, ${sqlString(window.month)}, ${window.windowRank}, ${sqlString(window.dayOfWeek)}, ${window.hourOfDay}, ${sqlNullableNumber(window.ridership)}, ${sqlNullableNumber(window.transfers)}, ${sqlNullableNumber(window.matchedObservationCount)}, ${sqlNullableNumber(window.busTripCount)}, ${sqlNullableNumber(window.weightedAverageSpeedMph)}, ${sqlNullableNumber(window.slowObservationShare)});`,
      ].join(" "),
    );
  }

  for (const window of routeBriefSlowestWindows) {
    routeBriefSlowestWindowRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_brief_slowest_window",
        "(route_id, month, window_rank, day_of_week, hour_of_day, observation_count, bus_trip_count, segment_count, weighted_average_speed_mph, weighted_average_travel_time_minutes, slow_observation_share)",
        "VALUES",
        `(${sqlString(window.routeId)}, ${sqlString(window.month)}, ${window.windowRank}, ${sqlString(window.dayOfWeek)}, ${window.hourOfDay}, ${sqlNullableNumber(window.observationCount)}, ${sqlNullableNumber(window.busTripCount)}, ${sqlNullableNumber(window.segmentCount)}, ${sqlNullableNumber(window.weightedAverageSpeedMph)}, ${sqlNullableNumber(window.weightedAverageTravelTimeMinutes)}, ${sqlNullableNumber(window.slowObservationShare)});`,
      ].join(" "),
    );
  }

  for (const artifact of routeArtifacts) {
    artifactRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_artifact",
        "(route_id, month, artifact_name, artifact_key, content_type, byte_length, sha256)",
        "VALUES",
        `(${sqlString(artifact.routeId)}, ${sqlString(artifact.month)}, ${sqlString(artifact.artifactName)}, ${sqlString(artifact.artifactKey)}, ${sqlString(artifact.contentType)}, ${artifact.byteLength}, ${sqlString(artifact.sha256)});`,
      ].join(" "),
    );
  }

  for (const route of routeComparisonRanks) {
    statements.push(
      [
        "INSERT INTO route_comparison_rank",
        "(month, rank, route_id, route_score, average_speed_mph, total_ridership, ace_violation_count, bus_lane_matched_lane_count)",
        "VALUES",
        `(${sqlString(route.month)}, ${route.rank}, ${sqlString(route.routeId)}, ${route.routeScore}, ${route.averageSpeedMph}, ${route.totalRidership}, ${route.aceViolationCount}, ${route.busLaneMatchedLaneCount});`,
      ].join(" "),
    );
  }

  if (routeBatchStatus !== null) {
    statements.push(
      [
        "INSERT INTO route_batch_status",
        "(month, generated_at, status, route_count, artifact_count, missing_artifact_count, hash_mismatch_count, byte_length_mismatch_count, total_byte_length, issue_count)",
        "VALUES",
        `(${sqlString(routeBatchStatus.month)}, ${sqlString(routeBatchStatus.generatedAt)}, ${sqlString(routeBatchStatus.status)}, ${routeBatchStatus.routeCount}, ${routeBatchStatus.artifactCount}, ${routeBatchStatus.missingArtifactCount}, ${routeBatchStatus.hashMismatchCount}, ${routeBatchStatus.byteLengthMismatchCount}, ${routeBatchStatus.totalByteLength}, ${routeBatchStatus.issueCount});`,
      ].join(" "),
    );
  }

  for (const route of routeBatchBuiltRoutes) {
    routeBatchBuiltRouteRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_batch_built_route",
        "(month, route_rank, route_id, artifact_count, status)",
        "VALUES",
        `(${sqlString(route.month)}, ${route.routeRank}, ${sqlString(route.routeId)}, ${sqlNullableNumber(route.artifactCount)}, ${sqlString(route.status)});`,
      ].join(" "),
    );
  }

  for (const issue of routeBatchIssues) {
    routeBatchIssueRowCount += 1;
    statements.push(
      [
        "INSERT INTO route_batch_issue",
        "(month, issue_rank, route_id, severity, issue_code, message)",
        "VALUES",
        `(${sqlString(issue.month)}, ${issue.issueRank}, ${sqlNullableString(issue.routeId)}, ${sqlString(issue.severity)}, ${sqlString(issue.issueCode)}, ${sqlString(issue.message)});`,
      ].join(" "),
    );
  }

  const summary = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    routeCount: routeBatchStatus?.routeCount ?? routeBriefSummaries.length,
    artifactRowCount,
    comparisonRowCount: routeComparisonRanks.length,
    routeCatalogRowCount: routeCatalog.length,
    routeCatalogTypeRowCount,
    routeDirectionRowCount,
    routeCoverageRowCount: routeCoverage.length,
    routeReadinessRowCount: routeReadiness.length,
    routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: routeBuildPlan.length,
    routeReliabilityBaselineRowCount: routeReliabilityBaseline.length,
    routeReliabilityGapWindowRowCount,
    routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: routeMonthTrends.length,
    routeEquityContextRowCount: routeEquityContext.length,
    routeBatchStatusRowCount: routeBatchStatus === null ? 0 : 1,
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
    routeCount: routeBatchStatus?.routeCount ?? routeBriefSummaries.length,
    artifactRowCount,
    comparisonRowCount: routeComparisonRanks.length,
    routeCatalogRowCount: routeCatalog.length,
    routeCatalogTypeRowCount,
    routeDirectionRowCount,
    routeCoverageRowCount: routeCoverage.length,
    routeReadinessRowCount: routeReadiness.length,
    routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: routeBuildPlan.length,
    routeReliabilityBaselineRowCount: routeReliabilityBaseline.length,
    routeReliabilityGapWindowRowCount,
    routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: routeMonthTrends.length,
    routeEquityContextRowCount: routeEquityContext.length,
    routeBatchStatusRowCount: routeBatchStatus === null ? 0 : 1,
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

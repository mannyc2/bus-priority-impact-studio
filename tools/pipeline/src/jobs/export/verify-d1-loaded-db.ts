import { Database } from "bun:sqlite";
import type { D1ServingDb } from "@bp/db/d1";
import {
  getRouteBatchStatus,
  listBuildEligibleRoutes,
  listCorridorSummaries,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteInterventionComparisons,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReliabilityBaselines,
  listSelectedRouteBuildCandidates,
} from "@bp/db/d1";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";
import type { D1SeedOutputResult } from "./route-d1-seed-output.js";

type CountRow = {
  count: number;
};

export type RepositoryCheckResult = {
  batchStatus: string | null;
  batchStatusRouteCount: number;
  routeBriefSummaryRows: number;
  comparisonRankRows: number;
  buildPlanRows: number;
  selectedBuildPlanRows: number;
  buildEligibleReadinessRows: number;
  reliabilityBaselineRows: number;
  routeObservedReliabilityRows: number;
  routeInterventionComparisonRows: number;
  corridorSummaryRows: number;
  routeMonthTrendRows: number;
  routeEquityContextRows: number;
  firstRouteId: string | null;
};

export type LoadedD1Database = {
  database: Database;
  db: D1ServingDb;
};

function countTable(database: Database, tableName: string): number {
  const row = database.query<CountRow, []>(`SELECT count(*) AS count FROM ${tableName}`).get();
  return row?.count ?? 0;
}

function countQuery(database: Database, query: string): number {
  const row = database.query<CountRow, []>(query).get();
  return row?.count ?? 0;
}

export function loadD1Database(schemaSql: string, seedSql: string): LoadedD1Database {
  const database = new Database(":memory:");
  database.exec(schemaSql);
  database.exec(seedSql);

  return {
    database,
    db: createBunSqliteServingDb(database),
  };
}

export function collectD1TableCounts(database: Database): {
  tableCounts: Record<string, number>;
  publicTableCounts: { route_brief_summary: number };
} {
  return {
    tableCounts: {
      route_catalog: countTable(database, "route_catalog"),
      route_catalog_type: countTable(database, "route_catalog_type"),
      route_direction: countTable(database, "route_direction"),
      route_month_coverage: countTable(database, "route_month_coverage"),
      route_readiness: countTable(database, "route_readiness"),
      route_readiness_missing_input: countTable(database, "route_readiness_missing_input"),
      route_build_plan: countTable(database, "route_build_plan"),
      route_reliability_baseline: countTable(database, "route_reliability_baseline"),
      route_reliability_gap_window: countTable(database, "route_reliability_gap_window"),
      route_observed_reliability_summary: countTable(
        database,
        "route_observed_reliability_summary",
      ),
      intervention_event: countTable(database, "intervention_event"),
      route_intervention_comparison: countTable(database, "route_intervention_comparison"),
      corridor: countTable(database, "corridor"),
      corridor_route_member: countTable(database, "corridor_route_member"),
      corridor_month_summary: countTable(database, "corridor_month_summary"),
      corridor_hotspot: countTable(database, "corridor_hotspot"),
      route_month_source_status: countTable(database, "route_month_source_status"),
      route_month_trend: countTable(database, "route_month_trend"),
      route_equity_context: countTable(database, "route_equity_context"),
      route_scorecard: countTable(database, "route_scorecard"),
      route_scorecard_citation: countTable(database, "route_scorecard_citation"),
      route_brief_summary: countTable(database, "route_brief_summary"),
      route_brief_peak_window: countTable(database, "route_brief_peak_window"),
      route_brief_slowest_window: countTable(database, "route_brief_slowest_window"),
      route_comparison_rank: countTable(database, "route_comparison_rank"),
      route_batch_status: countTable(database, "route_batch_status"),
      route_batch_built_route: countTable(database, "route_batch_built_route"),
      route_batch_issue: countTable(database, "route_batch_issue"),
    },
    publicTableCounts: {
      route_brief_summary: countQuery(
        database,
        "SELECT count(*) AS count FROM route_brief_summary WHERE public_visible = 1",
      ),
    },
  };
}

function compareCount(input: {
  issues: string[];
  tableName: string;
  actual: number;
  expected: number;
}): void {
  if (input.actual !== input.expected) {
    input.issues.push(`${input.tableName}:expected_${input.expected}:actual_${input.actual}`);
  }
}

export function verifyD1TableCounts(input: {
  issues: string[];
  tableCounts: Record<string, number>;
  exportResult: D1SeedOutputResult;
}): void {
  const count = (table: string): number => input.tableCounts[table] ?? 0;

  compareCount({
    issues: input.issues,
    tableName: "route_catalog",
    actual: count("route_catalog"),
    expected: input.exportResult.routeCatalogRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_catalog_type",
    actual: count("route_catalog_type"),
    expected: input.exportResult.routeCatalogTypeRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_direction",
    actual: count("route_direction"),
    expected: input.exportResult.routeDirectionRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_month_coverage",
    actual: count("route_month_coverage"),
    expected: input.exportResult.routeCoverageRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_readiness",
    actual: count("route_readiness"),
    expected: input.exportResult.routeReadinessRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_readiness_missing_input",
    actual: count("route_readiness_missing_input"),
    expected: input.exportResult.routeReadinessMissingInputRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_build_plan",
    actual: count("route_build_plan"),
    expected: input.exportResult.routeBuildPlanRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_reliability_baseline",
    actual: count("route_reliability_baseline"),
    expected: input.exportResult.routeReliabilityBaselineRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_reliability_gap_window",
    actual: count("route_reliability_gap_window"),
    expected: input.exportResult.routeReliabilityGapWindowRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_observed_reliability_summary",
    actual: count("route_observed_reliability_summary"),
    expected: input.exportResult.routeObservedReliabilitySummaryRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "intervention_event",
    actual: count("intervention_event"),
    expected: input.exportResult.interventionEventRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_intervention_comparison",
    actual: count("route_intervention_comparison"),
    expected: input.exportResult.routeInterventionComparisonRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "corridor",
    actual: count("corridor"),
    expected: input.exportResult.corridorRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "corridor_route_member",
    actual: count("corridor_route_member"),
    expected: input.exportResult.corridorRouteMemberRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "corridor_month_summary",
    actual: count("corridor_month_summary"),
    expected: input.exportResult.corridorMonthSummaryRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "corridor_hotspot",
    actual: count("corridor_hotspot"),
    expected: input.exportResult.corridorHotspotRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_month_source_status",
    actual: count("route_month_source_status"),
    expected: input.exportResult.routeMonthSourceStatusRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_month_trend",
    actual: count("route_month_trend"),
    expected: input.exportResult.routeMonthTrendRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_equity_context",
    actual: count("route_equity_context"),
    expected: input.exportResult.routeEquityContextRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_scorecard",
    actual: count("route_scorecard"),
    expected: input.exportResult.routeCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_scorecard_citation",
    actual: count("route_scorecard_citation"),
    expected: input.exportResult.routeScorecardCitationRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_brief_summary",
    actual: count("route_brief_summary"),
    expected: input.exportResult.routeCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_brief_peak_window",
    actual: count("route_brief_peak_window"),
    expected: input.exportResult.routeBriefPeakWindowRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_brief_slowest_window",
    actual: count("route_brief_slowest_window"),
    expected: input.exportResult.routeBriefSlowestWindowRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_comparison_rank",
    actual: count("route_comparison_rank"),
    expected: input.exportResult.comparisonRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_batch_status",
    actual: count("route_batch_status"),
    expected: input.exportResult.routeBatchStatusRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_batch_built_route",
    actual: count("route_batch_built_route"),
    expected: input.exportResult.routeBatchBuiltRouteRowCount,
  });
  compareCount({
    issues: input.issues,
    tableName: "route_batch_issue",
    actual: count("route_batch_issue"),
    expected: input.exportResult.routeBatchIssueRowCount,
  });
}

export async function runD1RepositoryChecks(input: {
  db: D1ServingDb;
  month: string;
}): Promise<RepositoryCheckResult> {
  const batchStatus = await getRouteBatchStatus(input.db, input.month);
  const briefSummaries = await listRouteBriefSummaries(input.db, input.month);
  const comparisonRanks = await listRouteComparisonRanks(input.db, input.month);
  const buildPlan = await listRouteBuildPlan(input.db, input.month);
  const selectedBuildPlan = await listSelectedRouteBuildCandidates(input.db, input.month);
  const buildEligibleRoutes = await listBuildEligibleRoutes(input.db, input.month);
  const reliabilityBaselines = await listRouteReliabilityBaselines(input.db, input.month);
  const routeObservedReliability = await listRouteObservedReliabilitySummaries(
    input.db,
    input.month,
  );
  const routeInterventionComparisons = await listRouteInterventionComparisons(
    input.db,
    input.month,
  );
  const corridorSummaries = await listCorridorSummaries(input.db, input.month);
  const routeEquityContexts = await listRouteEquityContexts(input.db, input.month);
  const firstRouteId = briefSummaries[0]?.routeId ?? null;
  const routeMonthTrends =
    firstRouteId === null ? [] : await listRouteMonthTrends(input.db, firstRouteId);

  return {
    batchStatus: batchStatus?.status ?? null,
    batchStatusRouteCount: batchStatus?.routeCount ?? 0,
    routeBriefSummaryRows: briefSummaries.length,
    comparisonRankRows: comparisonRanks.length,
    buildPlanRows: buildPlan.length,
    selectedBuildPlanRows: selectedBuildPlan.length,
    buildEligibleReadinessRows: buildEligibleRoutes.length,
    reliabilityBaselineRows: reliabilityBaselines.length,
    routeObservedReliabilityRows: routeObservedReliability.length,
    routeInterventionComparisonRows: routeInterventionComparisons.length,
    corridorSummaryRows: corridorSummaries.length,
    routeMonthTrendRows: routeMonthTrends.length,
    routeEquityContextRows: routeEquityContexts.length,
    firstRouteId,
  };
}

export function verifyD1RepositoryChecks(input: {
  issues: string[];
  checks: RepositoryCheckResult;
  exportResult: D1SeedOutputResult;
  publicTableCounts: { route_brief_summary: number };
}): void {
  if (input.checks.batchStatus !== "pass") {
    input.issues.push(`route_batch_status:status_${String(input.checks.batchStatus)}`);
  }
  if (input.checks.routeBriefSummaryRows !== input.publicTableCounts.route_brief_summary) {
    input.issues.push(
      `repository:routeBriefSummaryRows_expected_${input.publicTableCounts.route_brief_summary}_actual_${input.checks.routeBriefSummaryRows}`,
    );
  }
  if (input.checks.comparisonRankRows !== input.exportResult.comparisonRowCount) {
    input.issues.push(
      `repository:comparisonRankRows_expected_${input.exportResult.comparisonRowCount}_actual_${input.checks.comparisonRankRows}`,
    );
  }
  if (
    input.checks.routeObservedReliabilityRows !==
    input.exportResult.routeObservedReliabilitySummaryRowCount
  ) {
    input.issues.push(
      `repository:routeObservedReliabilityRows_expected_${input.exportResult.routeObservedReliabilitySummaryRowCount}_actual_${input.checks.routeObservedReliabilityRows}`,
    );
  }
  if (
    input.checks.routeInterventionComparisonRows !==
    input.exportResult.routeInterventionComparisonRowCount
  ) {
    input.issues.push(
      `repository:routeInterventionComparisonRows_expected_${input.exportResult.routeInterventionComparisonRowCount}_actual_${input.checks.routeInterventionComparisonRows}`,
    );
  }
  if (input.checks.corridorSummaryRows !== input.exportResult.corridorMonthSummaryRowCount) {
    input.issues.push(
      `repository:corridorSummaryRows_expected_${input.exportResult.corridorMonthSummaryRowCount}_actual_${input.checks.corridorSummaryRows}`,
    );
  }
}

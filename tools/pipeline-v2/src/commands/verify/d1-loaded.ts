import type { Database } from "bun:sqlite";
import type { D1ServingDb } from "@bp/db/d1";
import {
  getRouteBatchStatus,
  listBuildEligibleRoutes,
  listCorridorArtifacts,
  listCorridorSummaries,
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteInterventionComparisons,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReliabilityBaselines,
  listRouteSpeedHistoryCoverage,
  listSelectedRouteBuildCandidates,
  listSourceMonthCoverage,
} from "@bp/db/d1";
import type { D1SeedOutputResult } from "../export/d1.ts";

type CountRow = { count: number };

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
  routeArtifactRows: number;
  corridorSummaryRows: number;
  corridorInterventionContextRows: number;
  corridorArtifactRows: number;
  routeMonthTrendRows: number;
  routeSpeedHistoryCoverageRows: number;
  sourceMonthCoverageRows: number;
  routeEquityContextRows: number;
  firstRouteId: string | null;
};

function countTable(database: Database, tableName: string): number {
  const row = database.query<CountRow, []>(`SELECT count(*) AS count FROM ${tableName}`).get();
  return row?.count ?? 0;
}

function countQuery(database: Database, query: string): number {
  const row = database.query<CountRow, []>(query).get();
  return row?.count ?? 0;
}

const COUNTED_TABLES = [
  "route_catalog",
  "route_catalog_type",
  "route_catalog_trip_type",
  "route_direction",
  "route_month_coverage",
  "route_readiness",
  "route_readiness_missing_input",
  "route_build_plan",
  "route_reliability_baseline",
  "route_reliability_gap_window",
  "route_observed_reliability_summary",
  "intervention_event",
  "route_intervention_comparison",
  "route_artifact",
  "corridor",
  "corridor_artifact",
  "corridor_route_member",
  "corridor_month_summary",
  "corridor_intervention_context",
  "corridor_hotspot",
  "route_month_source_status",
  "route_month_trend",
  "route_timeline_index",
  "route_speed_history_coverage",
  "source_month_coverage",
  "route_equity_context",
  "route_scorecard",
  "route_scorecard_citation",
  "route_brief_summary",
  "route_brief_peak_window",
  "route_brief_slowest_window",
  "route_comparison_rank",
  "route_batch_status",
  "route_batch_built_route",
  "route_batch_issue",
] as const;

export function collectD1TableCounts(database: Database): {
  tableCounts: Record<string, number>;
  publicTableCounts: { route_brief_summary: number };
} {
  const tableCounts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    tableCounts[table] = countTable(database, table);
  }
  return {
    tableCounts,
    publicTableCounts: {
      route_brief_summary: countQuery(
        database,
        "SELECT count(*) AS count FROM route_brief_summary WHERE public_visible = 1",
      ),
    },
  };
}

const TABLE_COUNT_EXPECTATIONS: ReadonlyArray<{
  table: string;
  pick: (r: D1SeedOutputResult) => number;
}> = [
  { table: "route_catalog", pick: (r) => r.routeCatalogRowCount },
  { table: "route_catalog_type", pick: (r) => r.routeCatalogTypeRowCount },
  { table: "route_catalog_trip_type", pick: (r) => r.routeCatalogTripTypeRowCount },
  { table: "route_direction", pick: (r) => r.routeDirectionRowCount },
  { table: "route_month_coverage", pick: (r) => r.routeCoverageRowCount },
  { table: "route_readiness", pick: (r) => r.routeReadinessRowCount },
  { table: "route_readiness_missing_input", pick: (r) => r.routeReadinessMissingInputRowCount },
  { table: "route_build_plan", pick: (r) => r.routeBuildPlanRowCount },
  { table: "route_reliability_baseline", pick: (r) => r.routeReliabilityBaselineRowCount },
  { table: "route_reliability_gap_window", pick: (r) => r.routeReliabilityGapWindowRowCount },
  {
    table: "route_observed_reliability_summary",
    pick: (r) => r.routeObservedReliabilitySummaryRowCount,
  },
  { table: "intervention_event", pick: (r) => r.interventionEventRowCount },
  { table: "route_intervention_comparison", pick: (r) => r.routeInterventionComparisonRowCount },
  { table: "route_artifact", pick: (r) => r.routeArtifactRowCount },
  { table: "corridor", pick: (r) => r.corridorRowCount },
  { table: "corridor_artifact", pick: (r) => r.corridorArtifactRowCount },
  { table: "corridor_route_member", pick: (r) => r.corridorRouteMemberRowCount },
  { table: "corridor_month_summary", pick: (r) => r.corridorMonthSummaryRowCount },
  { table: "corridor_intervention_context", pick: (r) => r.corridorInterventionContextRowCount },
  { table: "corridor_hotspot", pick: (r) => r.corridorHotspotRowCount },
  { table: "route_month_source_status", pick: (r) => r.routeMonthSourceStatusRowCount },
  { table: "route_month_trend", pick: (r) => r.routeMonthTrendRowCount },
  { table: "route_timeline_index", pick: (r) => r.routeTimelineIndexRowCount },
  {
    table: "route_speed_history_coverage",
    pick: (r) => r.routeSpeedHistoryCoverageRowCount,
  },
  { table: "source_month_coverage", pick: (r) => r.sourceMonthCoverageRowCount },
  { table: "route_equity_context", pick: (r) => r.routeEquityContextRowCount },
  { table: "route_scorecard", pick: (r) => r.routeCount },
  { table: "route_scorecard_citation", pick: (r) => r.routeScorecardCitationRowCount },
  { table: "route_brief_summary", pick: (r) => r.routeCount },
  { table: "route_brief_peak_window", pick: (r) => r.routeBriefPeakWindowRowCount },
  { table: "route_brief_slowest_window", pick: (r) => r.routeBriefSlowestWindowRowCount },
  { table: "route_comparison_rank", pick: (r) => r.comparisonRowCount },
  { table: "route_batch_status", pick: (r) => r.routeBatchStatusRowCount },
  { table: "route_batch_built_route", pick: (r) => r.routeBatchBuiltRouteRowCount },
  { table: "route_batch_issue", pick: (r) => r.routeBatchIssueRowCount },
];

export function verifyD1TableCounts(input: {
  issues: string[];
  tableCounts: Record<string, number>;
  exportResult: D1SeedOutputResult;
}): void {
  for (const { table, pick } of TABLE_COUNT_EXPECTATIONS) {
    const actual = input.tableCounts[table] ?? 0;
    const expected = pick(input.exportResult);
    if (actual !== expected) {
      input.issues.push(`${table}:expected_${expected}:actual_${actual}`);
    }
  }
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
  const routeArtifacts = await listRouteArtifacts(input.db, input.month);
  const routeSpeedHistoryCoverage = await listRouteSpeedHistoryCoverage(input.db, input.month);
  const sourceMonthCoverage = await listSourceMonthCoverage(input.db);
  const corridorSummaries = await listCorridorSummaries(input.db, input.month);
  const corridorArtifacts = await listCorridorArtifacts(input.db, input.month);
  const corridorInterventionContextRows = corridorSummaries.reduce(
    (sum, s) => sum + s.interventionContext.length,
    0,
  );
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
    routeArtifactRows: routeArtifacts.length,
    corridorSummaryRows: corridorSummaries.length,
    corridorInterventionContextRows,
    corridorArtifactRows: corridorArtifacts.length,
    routeMonthTrendRows: routeMonthTrends.length,
    routeSpeedHistoryCoverageRows: routeSpeedHistoryCoverage.length,
    sourceMonthCoverageRows: sourceMonthCoverage.length,
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
  if (input.checks.routeArtifactRows !== input.exportResult.routeArtifactRowCount) {
    input.issues.push(
      `repository:routeArtifactRows_expected_${input.exportResult.routeArtifactRowCount}_actual_${input.checks.routeArtifactRows}`,
    );
  }
  if (input.checks.corridorSummaryRows !== input.exportResult.corridorMonthSummaryRowCount) {
    input.issues.push(
      `repository:corridorSummaryRows_expected_${input.exportResult.corridorMonthSummaryRowCount}_actual_${input.checks.corridorSummaryRows}`,
    );
  }
  if (
    input.checks.corridorInterventionContextRows !==
    input.exportResult.corridorInterventionContextRowCount
  ) {
    input.issues.push(
      `repository:corridorInterventionContextRows_expected_${input.exportResult.corridorInterventionContextRowCount}_actual_${input.checks.corridorInterventionContextRows}`,
    );
  }
  if (input.checks.corridorArtifactRows !== input.exportResult.corridorArtifactRowCount) {
    input.issues.push(
      `repository:corridorArtifactRows_expected_${input.exportResult.corridorArtifactRowCount}_actual_${input.checks.corridorArtifactRows}`,
    );
  }
  if (
    input.checks.routeSpeedHistoryCoverageRows !==
    input.exportResult.routeSpeedHistoryCoverageRowCount
  ) {
    input.issues.push(
      `repository:routeSpeedHistoryCoverageRows_expected_${input.exportResult.routeSpeedHistoryCoverageRowCount}_actual_${input.checks.routeSpeedHistoryCoverageRows}`,
    );
  }
  if (input.checks.sourceMonthCoverageRows !== input.exportResult.sourceMonthCoverageRowCount) {
    input.issues.push(
      `repository:sourceMonthCoverageRows_expected_${input.exportResult.sourceMonthCoverageRowCount}_actual_${input.checks.sourceMonthCoverageRows}`,
    );
  }
}

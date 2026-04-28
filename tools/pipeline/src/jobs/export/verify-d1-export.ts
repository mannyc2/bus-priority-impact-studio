import { Database } from "bun:sqlite";
import type { D1ServingDb } from "@bp/db/d1";
import {
  getRouteBatchStatus,
  listBuildEligibleRoutes,
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteMonthTrends,
  listRouteReliabilityBaselines,
  listSelectedRouteBuildCandidates,
} from "@bp/db/d1";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { exportD1Seed } from "./export-d1.js";

type D1VerifyArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type D1VerifyResult = {
  isoMonth: string;
  status: "pass" | "fail";
  issueCount: number;
  tableCounts: Record<string, number>;
  repositoryChecks: RepositoryCheckResult;
};

type CountRow = {
  count: number;
};

type RepositoryCheckResult = {
  batchStatus: string | null;
  batchStatusRouteCount: number;
  routeBriefSummaryRows: number;
  comparisonRankRows: number;
  buildPlanRows: number;
  selectedBuildPlanRows: number;
  buildEligibleReadinessRows: number;
  reliabilityBaselineRows: number;
  routeMonthTrendRows: number;
  routeEquityContextRows: number;
  firstRouteId: string | null;
  firstRouteArtifactCount: number;
};

function parseBuildArgs(args: D1VerifyArgs = {}): Required<D1VerifyArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): D1VerifyArgs {
  const output: D1VerifyArgs = {};

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

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function countTable(database: Database, tableName: string): number {
  const row = database.query<CountRow, []>(`SELECT count(*) AS count FROM ${tableName}`).get();

  return row?.count ?? 0;
}

function countQuery(database: Database, query: string): number {
  const row = database.query<CountRow, []>(query).get();

  return row?.count ?? 0;
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

async function repositoryChecks(input: {
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
  const routeEquityContexts = await listRouteEquityContexts(input.db, input.month);
  const firstRouteId = briefSummaries[0]?.routeId ?? null;
  const routeMonthTrends =
    firstRouteId === null ? [] : await listRouteMonthTrends(input.db, firstRouteId);
  const firstRouteArtifactCount =
    firstRouteId === null
      ? 0
      : (await listRouteArtifacts(input.db, firstRouteId, input.month)).length;

  return {
    batchStatus: batchStatus?.status ?? null,
    batchStatusRouteCount: batchStatus?.routeCount ?? 0,
    routeBriefSummaryRows: briefSummaries.length,
    comparisonRankRows: comparisonRanks.length,
    buildPlanRows: buildPlan.length,
    selectedBuildPlanRows: selectedBuildPlan.length,
    buildEligibleReadinessRows: buildEligibleRoutes.length,
    reliabilityBaselineRows: reliabilityBaselines.length,
    routeMonthTrendRows: routeMonthTrends.length,
    routeEquityContextRows: routeEquityContexts.length,
    firstRouteId,
    firstRouteArtifactCount,
  };
}

export async function verifyD1Export(args: D1VerifyArgs = {}): Promise<D1VerifyResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const exportResult = await exportD1Seed({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  });
  const schemaSql = await Bun.file(exportResult.schemaPath).text();
  const seedSql = await Bun.file(exportResult.seedPath).text();
  const database = new Database(":memory:");
  const issues: string[] = [];

  database.exec(schemaSql);
  database.exec(seedSql);

  const tableCounts = {
    route_catalog: countTable(database, "route_catalog"),
    route_catalog_type: countTable(database, "route_catalog_type"),
    route_direction: countTable(database, "route_direction"),
    route_month_coverage: countTable(database, "route_month_coverage"),
    route_readiness: countTable(database, "route_readiness"),
    route_readiness_missing_input: countTable(database, "route_readiness_missing_input"),
    route_build_plan: countTable(database, "route_build_plan"),
    route_reliability_baseline: countTable(database, "route_reliability_baseline"),
    route_reliability_gap_window: countTable(database, "route_reliability_gap_window"),
    route_month_source_status: countTable(database, "route_month_source_status"),
    route_month_trend: countTable(database, "route_month_trend"),
    route_equity_context: countTable(database, "route_equity_context"),
    route_scorecard: countTable(database, "route_scorecard"),
    route_scorecard_citation: countTable(database, "route_scorecard_citation"),
    route_artifact: countTable(database, "route_artifact"),
    route_brief_summary: countTable(database, "route_brief_summary"),
    route_brief_peak_window: countTable(database, "route_brief_peak_window"),
    route_brief_slowest_window: countTable(database, "route_brief_slowest_window"),
    route_comparison_rank: countTable(database, "route_comparison_rank"),
    route_batch_status: countTable(database, "route_batch_status"),
    route_batch_built_route: countTable(database, "route_batch_built_route"),
    route_batch_issue: countTable(database, "route_batch_issue"),
  };
  const publicTableCounts = {
    route_brief_summary: countQuery(
      database,
      "SELECT count(*) AS count FROM route_brief_summary WHERE public_visible = 1",
    ),
  };

  compareCount({
    issues,
    tableName: "route_catalog",
    actual: tableCounts.route_catalog,
    expected: exportResult.routeCatalogRowCount,
  });
  compareCount({
    issues,
    tableName: "route_catalog_type",
    actual: tableCounts.route_catalog_type,
    expected: exportResult.routeCatalogTypeRowCount,
  });
  compareCount({
    issues,
    tableName: "route_direction",
    actual: tableCounts.route_direction,
    expected: exportResult.routeDirectionRowCount,
  });
  compareCount({
    issues,
    tableName: "route_month_coverage",
    actual: tableCounts.route_month_coverage,
    expected: exportResult.routeCoverageRowCount,
  });
  compareCount({
    issues,
    tableName: "route_readiness",
    actual: tableCounts.route_readiness,
    expected: exportResult.routeReadinessRowCount,
  });
  compareCount({
    issues,
    tableName: "route_readiness_missing_input",
    actual: tableCounts.route_readiness_missing_input,
    expected: exportResult.routeReadinessMissingInputRowCount,
  });
  compareCount({
    issues,
    tableName: "route_build_plan",
    actual: tableCounts.route_build_plan,
    expected: exportResult.routeBuildPlanRowCount,
  });
  compareCount({
    issues,
    tableName: "route_reliability_baseline",
    actual: tableCounts.route_reliability_baseline,
    expected: exportResult.routeReliabilityBaselineRowCount,
  });
  compareCount({
    issues,
    tableName: "route_reliability_gap_window",
    actual: tableCounts.route_reliability_gap_window,
    expected: exportResult.routeReliabilityGapWindowRowCount,
  });
  compareCount({
    issues,
    tableName: "route_month_source_status",
    actual: tableCounts.route_month_source_status,
    expected: exportResult.routeMonthSourceStatusRowCount,
  });
  compareCount({
    issues,
    tableName: "route_month_trend",
    actual: tableCounts.route_month_trend,
    expected: exportResult.routeMonthTrendRowCount,
  });
  compareCount({
    issues,
    tableName: "route_equity_context",
    actual: tableCounts.route_equity_context,
    expected: exportResult.routeEquityContextRowCount,
  });
  compareCount({
    issues,
    tableName: "route_scorecard",
    actual: tableCounts.route_scorecard,
    expected: exportResult.routeCount,
  });
  compareCount({
    issues,
    tableName: "route_scorecard_citation",
    actual: tableCounts.route_scorecard_citation,
    expected: exportResult.routeScorecardCitationRowCount,
  });
  compareCount({
    issues,
    tableName: "route_artifact",
    actual: tableCounts.route_artifact,
    expected: exportResult.artifactRowCount,
  });
  compareCount({
    issues,
    tableName: "route_brief_summary",
    actual: tableCounts.route_brief_summary,
    expected: exportResult.routeCount,
  });
  compareCount({
    issues,
    tableName: "route_brief_peak_window",
    actual: tableCounts.route_brief_peak_window,
    expected: exportResult.routeBriefPeakWindowRowCount,
  });
  compareCount({
    issues,
    tableName: "route_brief_slowest_window",
    actual: tableCounts.route_brief_slowest_window,
    expected: exportResult.routeBriefSlowestWindowRowCount,
  });
  compareCount({
    issues,
    tableName: "route_comparison_rank",
    actual: tableCounts.route_comparison_rank,
    expected: exportResult.comparisonRowCount,
  });
  compareCount({
    issues,
    tableName: "route_batch_status",
    actual: tableCounts.route_batch_status,
    expected: exportResult.routeBatchStatusRowCount,
  });
  compareCount({
    issues,
    tableName: "route_batch_built_route",
    actual: tableCounts.route_batch_built_route,
    expected: exportResult.routeBatchBuiltRouteRowCount,
  });
  compareCount({
    issues,
    tableName: "route_batch_issue",
    actual: tableCounts.route_batch_issue,
    expected: exportResult.routeBatchIssueRowCount,
  });

  const checks = await repositoryChecks({
    db: createBunSqliteServingDb(database),
    month,
  });

  if (checks.batchStatus !== "pass") {
    issues.push(`route_batch_status:status_${String(checks.batchStatus)}`);
  }
  if (checks.routeBriefSummaryRows !== publicTableCounts.route_brief_summary) {
    issues.push(
      `repository:routeBriefSummaryRows_expected_${publicTableCounts.route_brief_summary}_actual_${checks.routeBriefSummaryRows}`,
    );
  }
  if (checks.comparisonRankRows !== exportResult.comparisonRowCount) {
    issues.push(
      `repository:comparisonRankRows_expected_${exportResult.comparisonRowCount}_actual_${checks.comparisonRankRows}`,
    );
  }
  if (checks.firstRouteId !== null && checks.firstRouteArtifactCount === 0) {
    issues.push(`repository:firstRouteArtifacts_missing:${checks.firstRouteId}`);
  }

  database.close();

  if (issues.length > 0) {
    throw new Error(`D1 export verification failed: ${issues.join(", ")}`);
  }

  return {
    isoMonth: month,
    status: "pass",
    issueCount: 0,
    tableCounts,
    repositoryChecks: checks,
  };
}

export async function verifyD1ExportFromCli(args: string[]): Promise<D1VerifyResult> {
  return verifyD1Export(parseCliArgs(args));
}

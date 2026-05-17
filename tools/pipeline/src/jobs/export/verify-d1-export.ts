import { dirname, join } from "node:path";
import { fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { exportD1Seed } from "./export-d1.js";
import {
  collectD1TableCounts,
  loadD1Database,
  type RepositoryCheckResult,
  runD1RepositoryChecks,
  verifyD1RepositoryChecks,
  verifyD1TableCounts,
} from "./verify-d1-loaded-db.js";

type D1VerifyArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  exportRoot?: string;
};

type D1VerifyResult = {
  schemaVersion: number;
  isoMonth: string;
  analysisPeriod: string;
  generatedAt: string;
  summaryPath: string;
  seedPath: string;
  status: "pass" | "fail";
  issueCount: number;
  tableCounts: Record<string, number>;
  expectedCounts: Record<string, number>;
  repositoryChecks: RepositoryCheckResult;
};

function parseBuildArgs(args: D1VerifyArgs = {}) {
  return createMonthContext(args);
}

function parseCliArgs(args: string[]): D1VerifyArgs {
  return parseMonthDbCliArgs(args, {} as D1VerifyArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--export-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.exportRoot = fromCliPath(value);
        }
      },
    },
  ]);
}

function expectedTableCounts(exportResult: Awaited<ReturnType<typeof exportD1Seed>>) {
  return {
    route_catalog: exportResult.routeCatalogRowCount,
    route_catalog_type: exportResult.routeCatalogTypeRowCount,
    route_direction: exportResult.routeDirectionRowCount,
    route_month_coverage: exportResult.routeCoverageRowCount,
    route_readiness: exportResult.routeReadinessRowCount,
    route_readiness_missing_input: exportResult.routeReadinessMissingInputRowCount,
    route_build_plan: exportResult.routeBuildPlanRowCount,
    route_reliability_baseline: exportResult.routeReliabilityBaselineRowCount,
    route_reliability_gap_window: exportResult.routeReliabilityGapWindowRowCount,
    route_observed_reliability_summary: exportResult.routeObservedReliabilitySummaryRowCount,
    intervention_event: exportResult.interventionEventRowCount,
    route_intervention_comparison: exportResult.routeInterventionComparisonRowCount,
    route_artifact: exportResult.routeArtifactRowCount,
    corridor: exportResult.corridorRowCount,
    corridor_artifact: exportResult.corridorArtifactRowCount,
    corridor_route_member: exportResult.corridorRouteMemberRowCount,
    corridor_month_summary: exportResult.corridorMonthSummaryRowCount,
    corridor_hotspot: exportResult.corridorHotspotRowCount,
    route_month_source_status: exportResult.routeMonthSourceStatusRowCount,
    route_month_trend: exportResult.routeMonthTrendRowCount,
    route_equity_context: exportResult.routeEquityContextRowCount,
    route_scorecard: exportResult.routeCount,
    route_scorecard_citation: exportResult.routeScorecardCitationRowCount,
    route_brief_summary: exportResult.routeCount,
    route_brief_peak_window: exportResult.routeBriefPeakWindowRowCount,
    route_brief_slowest_window: exportResult.routeBriefSlowestWindowRowCount,
    route_comparison_rank: exportResult.comparisonRowCount,
    route_batch_status: exportResult.routeBatchStatusRowCount,
    route_batch_built_route: exportResult.routeBatchBuiltRouteRowCount,
    route_batch_issue: exportResult.routeBatchIssueRowCount,
  };
}

export async function verifyD1Export(args: D1VerifyArgs = {}): Promise<D1VerifyResult> {
  const options = parseBuildArgs(args);
  const month = options.isoMonth;
  const exportResult = await exportD1Seed({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
    ...(args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot }),
  });
  const schemaSql = await Bun.file(exportResult.schemaPath).text();
  const seedSql = await Bun.file(exportResult.seedPath).text();
  const issues: string[] = [];
  const { database, db } = loadD1Database(schemaSql, seedSql);
  const { tableCounts, publicTableCounts } = collectD1TableCounts(database);
  verifyD1TableCounts({
    issues,
    tableCounts,
    exportResult,
  });
  const checks = await runD1RepositoryChecks({
    db,
    month,
  });
  verifyD1RepositoryChecks({
    issues,
    checks,
    exportResult,
    publicTableCounts,
  });
  database.close();

  if (issues.length > 0) {
    throw new Error(`D1 export verification failed: ${issues.join(", ")}`);
  }

  const result: D1VerifyResult = {
    schemaVersion: 1,
    isoMonth: month,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    summaryPath: join(dirname(exportResult.seedPath), "verify-summary.json"),
    seedPath: exportResult.seedPath,
    status: "pass",
    issueCount: 0,
    tableCounts,
    expectedCounts: expectedTableCounts(exportResult),
    repositoryChecks: checks,
  };
  await Bun.write(result.summaryPath, `${JSON.stringify(result, null, 2)}\n`);

  return result;
}

export async function verifyD1ExportFromCli(args: string[]): Promise<D1VerifyResult> {
  return verifyD1Export(parseCliArgs(args));
}

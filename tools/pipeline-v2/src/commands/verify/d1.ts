import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { runExportD1Seed, type D1SeedOutputResult } from "../export/d1.ts";
import {
  collectD1TableCounts,
  loadD1Database,
  type RepositoryCheckResult,
  runD1RepositoryChecks,
  verifyD1RepositoryChecks,
  verifyD1TableCounts,
} from "./d1-loaded.ts";

export type D1VerifyResult = {
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

function expectedTableCounts(exportResult: D1SeedOutputResult): Record<string, number> {
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
    corridor_intervention_context: exportResult.corridorInterventionContextRowCount,
    corridor_hotspot: exportResult.corridorHotspotRowCount,
    route_month_source_status: exportResult.routeMonthSourceStatusRowCount,
    route_month_trend: exportResult.routeMonthTrendRowCount,
    route_timeline_index: exportResult.routeTimelineIndexRowCount,
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
    route_speed_history_coverage: exportResult.routeSpeedHistoryCoverageRowCount,
    source_month_coverage: exportResult.sourceMonthCoverageRowCount,
  };
}

export type VerifyD1Inputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  exportRoot?: string | undefined;
  routeTimelineProjectionPath?: string | undefined;
};

export async function runVerifyD1Export(inputs: VerifyD1Inputs): Promise<D1VerifyResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const exportResult = await runExportD1Seed({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    exportRoot: inputs.exportRoot,
    routeTimelineProjectionPath: inputs.routeTimelineProjectionPath,
  });

  const schemaSql = await Bun.file(exportResult.schemaPath).text();
  const seedSql = await Bun.file(exportResult.seedPath).text();
  const issues: string[] = [];
  const { database, db } = loadD1Database(schemaSql, seedSql);
  const { tableCounts, publicTableCounts } = collectD1TableCounts(database);
  verifyD1TableCounts({ issues, tableCounts, exportResult });
  const checks = await runD1RepositoryChecks({ db, month });
  verifyD1RepositoryChecks({ issues, checks, exportResult, publicTableCounts });
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

export default defineCommand({
  path: ["verify", "d1"],
  summary: "Verify a generated D1 schema and seed against an in-memory replay.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      exportRoot: z.string().optional().describe("Override export root directory"),
      routeTimelineProjectionPath: z
        .string()
        .optional()
        .describe("Optional route timeline serving projection JSON to fold into D1 verification"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    schemaVersion: z.number(),
    isoMonth: z.string(),
    analysisPeriod: z.string(),
    generatedAt: z.string(),
    summaryPath: z.string(),
    seedPath: z.string(),
    status: z.enum(["pass", "fail"]),
    issueCount: z.number(),
    tableCounts: z.record(z.string(), z.number()),
    expectedCounts: z.record(z.string(), z.number()),
    repositoryChecks: z.unknown(),
  }),
  async run({ ctx, input }) {
    return runVerifyD1Export({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      exportRoot:
        input.options.exportRoot === undefined ? undefined : fromCliPath(input.options.exportRoot),
      routeTimelineProjectionPath:
        input.options.routeTimelineProjectionPath === undefined
          ? undefined
          : fromCliPath(input.options.routeTimelineProjectionPath),
    });
  },
});

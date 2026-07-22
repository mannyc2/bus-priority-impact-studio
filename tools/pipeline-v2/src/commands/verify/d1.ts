import { dirname, join } from "node:path";
import {
  type ReleaseIdentity,
  ReleaseIdentitySchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runD1ReplayBoundary } from "../../effect/d1-replay.ts";
import { runPipelineFileSystemBoundary } from "../../effect/file-system.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";
import {
  type D1ExactRouteIdentityOutput,
  type D1SeedOutputResult,
  runExportD1Seed,
} from "../export/d1.ts";
import {
  collectD1TableCounts,
  type RepositoryCheckResult,
  runD1RepositoryChecks,
  verifyD1RepositoryChecks,
  verifyD1TableCounts,
} from "./d1-loaded.ts";

export type D1VerifyResult = {
  schemaVersion: number;
  releaseId: string;
  publishedAt: string;
  coverage: ReleaseIdentity["coverage"];
  summaryPath: string;
  schemaPath: string;
  seedPath: string;
  plan097RecoverySeedPath: string;
  status: "pass" | "fail";
  issueCount: number;
  tableCounts: Record<string, number>;
  expectedCounts: Record<string, number>;
  repositoryChecks: RepositoryCheckResult;
  exactRouteIdentity: D1ExactRouteIdentityOutput | null;
};

function expectedTableCounts(exportResult: D1SeedOutputResult): Record<string, number> {
  return {
    route_catalog: exportResult.routeCatalogRowCount,
    route_catalog_type: exportResult.routeCatalogTypeRowCount,
    route_catalog_trip_type: exportResult.routeCatalogTripTypeRowCount,
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
  releaseIdentity: ReleaseIdentity;
  exportRoot?: string | undefined;
  artifactRoot?: string | undefined;
  routeTimelineProjectionPath?: string | undefined;
  routeEvidenceIndexPath?: string | undefined;
};

async function readD1ReplaySql(input: {
  month: string;
  schemaPath: string;
  seedPath: string;
}): Promise<{ schemaSql: string; seedSql: string }> {
  return runPipelineFileSystemBoundary({
    command: "verify.d1",
    operation: "readD1ReplaySql",
    run: (files) =>
      Effect.gen(function* () {
        const schemaSql = yield* files.readText({
          command: "verify.d1",
          operation: "readD1SchemaSql",
          path: input.schemaPath,
          spanAttributes: { month: input.month },
        });
        const seedSql = yield* files.readText({
          command: "verify.d1",
          operation: "readD1SeedSql",
          path: input.seedPath,
          spanAttributes: { month: input.month },
        });
        return { schemaSql, seedSql };
      }),
  });
}

async function writeD1VerifySummary(result: D1VerifyResult): Promise<void> {
  await runPipelineFileSystemBoundary({
    command: "verify.d1",
    operation: "writeD1VerifySummary",
    run: (files) =>
      files.writeText({
        command: "verify.d1",
        operation: "writeD1VerifySummary",
        path: result.summaryPath,
        contents: `${JSON.stringify(result, null, 2)}\n`,
        spanAttributes: { month: result.coverage.end },
      }),
  });
}

export async function runVerifyD1Export(inputs: VerifyD1Inputs): Promise<D1VerifyResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const releaseIdentity = decodeSchemaStrict(ReleaseIdentitySchema, inputs.releaseIdentity);
  if (releaseIdentity.coverage.end !== month) {
    throw new Error(
      `D1 verification release coverage ends at ${releaseIdentity.coverage.end}, expected ${month}.`,
    );
  }
  const exportResult = await runExportD1Seed({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    publishedAt: releaseIdentity.publishedAt,
    releaseIdentity,
    exportRoot: inputs.exportRoot,
    artifactRoot: inputs.artifactRoot,
    routeTimelineProjectionPath: inputs.routeTimelineProjectionPath,
    routeEvidenceIndexPath: inputs.routeEvidenceIndexPath,
  });
  const exportIdentity = decodeSchemaStrict(ReleaseIdentitySchema, {
    releaseId: exportResult.releaseId,
    publishedAt: exportResult.publishedAt,
    coverage: exportResult.coverage,
  });
  if (
    exportIdentity.releaseId !== releaseIdentity.releaseId ||
    exportIdentity.publishedAt !== releaseIdentity.publishedAt
  ) {
    throw new Error("D1 export publication identity does not match the verification boundary.");
  }
  if (exportIdentity.coverage.end !== month) {
    throw new Error(
      `D1 export coverage ends at ${exportIdentity.coverage.end}, expected ${month}.`,
    );
  }

  const { schemaSql, seedSql } = await readD1ReplaySql({
    month,
    schemaPath: exportResult.schemaPath,
    seedPath: exportResult.seedPath,
  });
  const { issues, tableCounts, checks } = await runD1ReplayBoundary({
    command: "verify.d1",
    operation: "verifyD1LoadedExport",
    schemaSql,
    seedSql,
    spanAttributes: { month },
    run: async ({ database, db }) => {
      const issues: string[] = [];
      const { tableCounts, publicTableCounts } = collectD1TableCounts(database);
      verifyD1TableCounts({ issues, tableCounts, exportResult });
      const checks = await runD1RepositoryChecks({ db, month });
      verifyD1RepositoryChecks({ issues, checks, exportResult, publicTableCounts });
      return { issues, tableCounts, checks };
    },
  });

  if (issues.length > 0) {
    throw new Error(`D1 export verification failed: ${issues.join(", ")}`);
  }

  const result: D1VerifyResult = {
    schemaVersion: 2,
    ...exportIdentity,
    summaryPath: join(dirname(exportResult.seedPath), "verify-summary.json"),
    schemaPath: exportResult.schemaPath,
    seedPath: exportResult.seedPath,
    plan097RecoverySeedPath: exportResult.plan097RecoverySeedPath,
    status: "pass",
    issueCount: 0,
    tableCounts,
    expectedCounts: expectedTableCounts(exportResult),
    repositoryChecks: checks,
    exactRouteIdentity: exportResult.exactRouteIdentity,
  };
  await writeD1VerifySummary(result);
  return result;
}

export default defineCommand({
  path: ["verify", "d1"],
  summary: "Verify a generated D1 schema and seed against an in-memory replay.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        exportRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override export root directory",
        }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root for D1 derivative inputs and outputs",
        }),
        routeTimelineProjectionPath: Schema.optionalKey(Schema.String).annotate({
          description:
            "Optional route timeline serving projection JSON to fold into D1 verification",
        }),
        routeEvidenceIndexPath: Schema.optionalKey(Schema.String).annotate({
          description: "Optional MTA-wiki route evidence index JSON to fold into D1 verification",
        }),
      },
    }),
  },
  output: Schema.Struct({
    schemaVersion: Schema.Number,
    releaseId: Schema.String,
    publishedAt: Schema.String,
    coverage: Schema.Struct({
      start: Schema.NullOr(Schema.String),
      end: Schema.String,
    }),
    summaryPath: Schema.String,
    schemaPath: Schema.String,
    seedPath: Schema.String,
    status: Schema.Literals(["pass", "fail"]),
    issueCount: Schema.Number,
    tableCounts: Schema.Record(Schema.String, Schema.Number),
    expectedCounts: Schema.Record(Schema.String, Schema.Number),
    repositoryChecks: Schema.Unknown,
    exactRouteIdentity: Schema.Unknown,
  }),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: "verify.d1",
      operation: "runVerifyD1Export",
      spanAttributes: {
        month,
      },
      run: (local) => {
        const publishedAt = new Date().toISOString();
        return runVerifyD1Export({
          local,
          year: input.options.year,
          month: input.options.month,
          releaseIdentity: decodeSchemaStrict(ReleaseIdentitySchema, {
            releaseId: releaseIdFromPublishedAt(publishedAt),
            publishedAt,
            coverage: { start: null, end: month },
          }),
          exportRoot:
            input.options.exportRoot === undefined
              ? undefined
              : fromCliPath(input.options.exportRoot),
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          routeTimelineProjectionPath:
            input.options.routeTimelineProjectionPath === undefined
              ? undefined
              : fromCliPath(input.options.routeTimelineProjectionPath),
          routeEvidenceIndexPath:
            input.options.routeEvidenceIndexPath === undefined
              ? undefined
              : fromCliPath(input.options.routeEvidenceIndexPath),
        });
      },
    });
  },
});

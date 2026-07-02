import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildD1AppendixSeedSql, buildD1SeedSql } from "@bp/db/d1/seed";
import { STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY } from "@bp/domain/studio/snapshots";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { type CloudflareCostSummary, estimateD1PaidCost } from "../../lib/cloudflare-costs.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, defaultExportRootPath, fromCliPath } from "../../lib/paths.ts";
import {
  type D1AppendixInputs,
  type D1CanonicalInputs,
  readLocalD1AppendixInputs,
  readLocalD1Inputs,
} from "./d1-inputs.ts";
import { readD1MigrationSql } from "./d1-migrations.ts";
import {
  buildAndWriteRouteCapabilityManifest,
  readDetectorReadinessRouteSummaries,
} from "./route-capability-manifest.ts";
import { buildAndWriteRouteDossierSummaries } from "./route-dossier-summaries.ts";

type D1FileContract = {
  path: string;
  byteLength: number;
  sha256: string;
};

type D1SqlFileCostFacts = {
  path: string;
  byteLength: number;
  statementCount: number;
  insertStatementCount: number;
  deleteStatementCount: number;
  updateStatementCount: number;
  ddlStatementCount: number;
};

type D1ExportCostEstimate = {
  schemaVersion: 1;
  operation: "d1-seed-export";
  exactRowsWrittenKnownBeforeExecution: false;
  seedSql: D1SqlFileCostFacts;
  schemaSql: D1SqlFileCostFacts;
  usageEstimate: {
    freshRowsWrittenLowerBound: number;
    replacementRowsWrittenEstimate: number;
    indexedRowsWrittenEstimate: number;
    replacementIndexedRowsWrittenEstimate: number;
    freeDailyRowsWrittenLimit: number;
    freshWithinWorkersFreeDailyLimit: boolean;
    replacementIndexedWithinWorkersFreeDailyLimit: boolean;
  };
  paidPlanCost: {
    fresh: CloudflareCostSummary;
    replacement: CloudflareCostSummary;
    replacementIndexed: CloudflareCostSummary;
  };
  notes: string[];
};

export type D1SeedOutputResult = {
  schemaVersion: number;
  isoMonth: string;
  analysisPeriod: string;
  generatedAt: string;
  summaryPath: string;
  schemaPath: string;
  seedPath: string;
  schemaFile: D1FileContract;
  seedFile: D1FileContract;
  costEstimate: D1ExportCostEstimate;
  routeCount: number;
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
  routeObservedReliabilitySummaryRowCount: number;
  interventionEventRowCount: number;
  routeInterventionComparisonRowCount: number;
  routeArtifactRowCount: number;
  corridorRowCount: number;
  corridorArtifactRowCount: number;
  corridorRouteMemberRowCount: number;
  corridorMonthSummaryRowCount: number;
  corridorInterventionContextRowCount: number;
  corridorHotspotRowCount: number;
  routeMonthSourceStatusRowCount: number;
  routeMonthTrendRowCount: number;
  routeTimelineIndexRowCount: number;
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
  routeBatchBuiltRouteRowCount: number;
  routeBatchIssueRowCount: number;
  routeBriefPeakWindowRowCount: number;
  routeBriefSlowestWindowRowCount: number;
  routeScorecardCitationRowCount: number;
  routeSpeedHistoryCoverageRowCount: number;
  sourceMonthCoverageRowCount: number;
  detectorReadinessManifestAvailable: boolean;
  routeCapabilityManifestRouteCount: number;
  routeDossierSummaryRouteCount: number;
};

export type D1AppendixSeedOutputResult = {
  schemaVersion: number;
  isoMonth: string;
  mode: "appendix";
  generatedAt: string;
  summaryPath: string;
  seedPath: string;
  seedFile: D1FileContract;
  costEstimate: D1ExportCostEstimate;
  routeObservedReliabilitySummaryRowCount: number;
  routeMonthSourceStatusRowCount: number;
};

type ExportD1CommandResult = D1SeedOutputResult | D1AppendixSeedOutputResult;

function fileContract(path: string, content: string): D1FileContract {
  const bytes = new TextEncoder().encode(content);
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function stageDetectorReadinessManifest(input: {
  manifestPath?: string | undefined;
  artifactRoot: string;
}): Promise<void> {
  if (input.manifestPath === undefined) return;
  const file = Bun.file(input.manifestPath);
  if (!(await file.exists())) return;
  const outputPath = join(input.artifactRoot, STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY);
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, await file.text());
}

function countMatches(sql: string, pattern: RegExp): number {
  return sql.match(pattern)?.length ?? 0;
}

function countStatements(sql: string): number {
  return sql
    .split(/;|-->\s*statement-breakpoint/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("-->")).length;
}

function sqlCostFacts(path: string, content: string): D1SqlFileCostFacts {
  return {
    path,
    byteLength: new TextEncoder().encode(content).byteLength,
    statementCount: countStatements(content),
    insertStatementCount: countMatches(content, /\binsert\s+into\b/gi),
    deleteStatementCount: countMatches(content, /\bdelete\s+from\b/gi),
    updateStatementCount: countMatches(content, /\bupdate\b/gi),
    ddlStatementCount: countMatches(content, /\b(create|alter|drop)\s+(table|index)\b/gi),
  };
}

export function estimateD1ExportCost(input: {
  seedPath: string;
  seedSql: string;
  schemaPath: string;
  schemaSql: string;
}): D1ExportCostEstimate {
  const seedSql = sqlCostFacts(input.seedPath, input.seedSql);
  const schemaSql = sqlCostFacts(input.schemaPath, input.schemaSql);
  const freshRowsWrittenLowerBound = seedSql.insertStatementCount + seedSql.updateStatementCount;
  const replacementRowsWrittenEstimate =
    freshRowsWrittenLowerBound +
    (seedSql.deleteStatementCount > 0 ? freshRowsWrittenLowerBound : 0);
  const indexedRowsWrittenEstimate = freshRowsWrittenLowerBound * 2;
  const replacementIndexedRowsWrittenEstimate = replacementRowsWrittenEstimate * 2;
  const freeDailyRowsWrittenLimit = 100_000;

  return {
    schemaVersion: 1,
    operation: "d1-seed-export",
    exactRowsWrittenKnownBeforeExecution: false,
    seedSql,
    schemaSql,
    usageEstimate: {
      freshRowsWrittenLowerBound,
      replacementRowsWrittenEstimate,
      indexedRowsWrittenEstimate,
      replacementIndexedRowsWrittenEstimate,
      freeDailyRowsWrittenLimit,
      freshWithinWorkersFreeDailyLimit: freshRowsWrittenLowerBound <= freeDailyRowsWrittenLimit,
      replacementIndexedWithinWorkersFreeDailyLimit:
        replacementIndexedRowsWrittenEstimate <= freeDailyRowsWrittenLimit,
    },
    paidPlanCost: {
      fresh: estimateD1PaidCost({ rowsWritten: freshRowsWrittenLowerBound }, [
        "Fresh estimate counts seed INSERT/UPDATE statements and excludes scoped DELETE statements that may affect zero existing rows on first publish.",
      ]),
      replacement: estimateD1PaidCost({ rowsWritten: replacementRowsWrittenEstimate }, [
        "Replacement estimate assumes scoped DELETE statements remove roughly the same number of rows the seed inserts.",
      ]),
      replacementIndexed: estimateD1PaidCost(
        { rowsWritten: replacementIndexedRowsWrittenEstimate },
        [
          "Replacement indexed estimate doubles the replacement estimate to account for primary-key/index maintenance. Cloudflare rows_written metrics are authoritative after remote execution.",
        ],
      ),
    },
    notes: [
      "D1 export cost estimates are pre-execution estimates. Wrangler output, D1 query metadata, Cloudflare GraphQL analytics, or the dashboard are authoritative after publish.",
      "DDL/schema execution may contribute a mix of reads and writes; schema statement counts are recorded here, but seed write estimates drive release-publish cost.",
      "Workers Free has a 100k rows-written daily limit. Workers Paid includes monthly D1 rows-written allowance before paid overage.",
    ],
  };
}

export type ExportD1Inputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  exportRoot?: string | undefined;
  artifactRoot?: string | undefined;
  routeTimelineProjectionPath?: string | undefined;
  detectorReadinessManifestPath?: string | undefined;
  routeEvidenceIndexPath?: string | undefined;
  inputs?: D1CanonicalInputs | undefined;
};

export async function runExportD1Seed(inputs: ExportD1Inputs): Promise<D1SeedOutputResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const exportDir = join(inputs.exportRoot ?? defaultExportRootPath(), "d1", month);
  const summaryPath = join(exportDir, "export-summary.json");
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();

  await stageDetectorReadinessManifest({
    manifestPath: inputs.detectorReadinessManifestPath,
    artifactRoot,
  });

  const d1Inputs =
    inputs.inputs ??
    (await readLocalD1Inputs(inputs.local.db, month, {
      sqlite: inputs.local.sqlite,
      artifactRoot,
      routeTimelineProjectionPath: inputs.routeTimelineProjectionPath,
      detectorReadinessManifestPath: inputs.detectorReadinessManifestPath,
      routeEvidenceIndexPath: inputs.routeEvidenceIndexPath,
    }));
  const schemaSql = await readD1MigrationSql();
  const seed = buildD1SeedSql({ month, ...d1Inputs });
  const generatedAt = new Date().toISOString();

  const readinessSummaries = await readDetectorReadinessRouteSummaries({
    manifestPath: inputs.detectorReadinessManifestPath,
    month,
  });
  const capabilityManifest = await buildAndWriteRouteCapabilityManifest({
    d1Inputs,
    readinessSummaries,
    artifactRoot,
    releaseMonth: month,
    generatedAt,
  });
  const dossierSummaries = await buildAndWriteRouteDossierSummaries({
    d1Inputs,
    artifactRoot,
    releaseMonth: month,
    generatedAt,
  });

  const result: D1SeedOutputResult = {
    schemaVersion: 1,
    isoMonth: month,
    analysisPeriod: month,
    generatedAt,
    summaryPath,
    schemaPath,
    seedPath,
    schemaFile: fileContract(schemaPath, schemaSql),
    seedFile: fileContract(seedPath, seed.seedSql),
    costEstimate: estimateD1ExportCost({
      seedPath,
      seedSql: seed.seedSql,
      schemaPath,
      schemaSql,
    }),
    routeCount: seed.routeCount,
    comparisonRowCount: seed.comparisonRowCount,
    routeCatalogRowCount: seed.routeCatalogRowCount,
    routeCatalogTypeRowCount: seed.routeCatalogTypeRowCount,
    routeDirectionRowCount: seed.routeDirectionRowCount,
    routeCoverageRowCount: seed.routeCoverageRowCount,
    routeReadinessRowCount: seed.routeReadinessRowCount,
    routeReadinessMissingInputRowCount: seed.routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: seed.routeBuildPlanRowCount,
    routeReliabilityBaselineRowCount: seed.routeReliabilityBaselineRowCount,
    routeReliabilityGapWindowRowCount: seed.routeReliabilityGapWindowRowCount,
    routeObservedReliabilitySummaryRowCount: seed.routeObservedReliabilitySummaryRowCount,
    interventionEventRowCount: seed.interventionEventRowCount,
    routeInterventionComparisonRowCount: seed.routeInterventionComparisonRowCount,
    routeArtifactRowCount: seed.routeArtifactRowCount,
    corridorRowCount: seed.corridorRowCount,
    corridorArtifactRowCount: seed.corridorArtifactRowCount,
    corridorRouteMemberRowCount: seed.corridorRouteMemberRowCount,
    corridorMonthSummaryRowCount: seed.corridorMonthSummaryRowCount,
    corridorInterventionContextRowCount: seed.corridorInterventionContextRowCount,
    corridorHotspotRowCount: seed.corridorHotspotRowCount,
    routeMonthSourceStatusRowCount: seed.routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: seed.routeMonthTrendRowCount,
    routeTimelineIndexRowCount: seed.routeTimelineIndexRowCount,
    routeEquityContextRowCount: seed.routeEquityContextRowCount,
    routeBatchStatusRowCount: seed.routeBatchStatusRowCount,
    routeBatchBuiltRouteRowCount: seed.routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount: seed.routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount: seed.routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount: seed.routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount: seed.routeScorecardCitationRowCount,
    routeSpeedHistoryCoverageRowCount: seed.routeSpeedHistoryCoverageRowCount,
    sourceMonthCoverageRowCount: seed.sourceMonthCoverageRowCount,
    detectorReadinessManifestAvailable: d1Inputs.detectorReadinessManifestAvailable,
    routeCapabilityManifestRouteCount: capabilityManifest.routeCount,
    routeDossierSummaryRouteCount: dossierSummaries.routeCount,
  };

  await mkdir(exportDir, { recursive: true });
  await Promise.all([
    Bun.write(schemaPath, schemaSql),
    Bun.write(seedPath, seed.seedSql),
    Bun.write(summaryPath, `${JSON.stringify(result, null, 2)}\n`),
  ]);
  return result;
}

export type ExportD1AppendixInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  exportRoot?: string | undefined;
  inputs?: D1AppendixInputs | undefined;
};

export async function runExportD1AppendixSeed(
  inputs: ExportD1AppendixInputs,
): Promise<D1AppendixSeedOutputResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const exportDir = join(inputs.exportRoot ?? defaultExportRootPath(), "d1", month);
  const summaryPath = join(exportDir, "appendix-summary.json");
  const seedPath = join(exportDir, "seed.appendix.sql");
  const d1Inputs = inputs.inputs ?? (await readLocalD1AppendixInputs(inputs.local.db, month));
  const seed = buildD1AppendixSeedSql({ month, ...d1Inputs });
  const generatedAt = new Date().toISOString();

  const result: D1AppendixSeedOutputResult = {
    schemaVersion: 1,
    isoMonth: month,
    mode: "appendix",
    generatedAt,
    summaryPath,
    seedPath,
    seedFile: fileContract(seedPath, seed.seedSql),
    costEstimate: estimateD1ExportCost({
      seedPath,
      seedSql: seed.seedSql,
      schemaPath: join(exportDir, "schema.sql"),
      schemaSql: "",
    }),
    routeObservedReliabilitySummaryRowCount: seed.routeObservedReliabilitySummaryRowCount,
    routeMonthSourceStatusRowCount: seed.routeMonthSourceStatusRowCount,
  };

  await mkdir(exportDir, { recursive: true });
  await Promise.all([
    Bun.write(seedPath, seed.seedSql),
    Bun.write(summaryPath, `${JSON.stringify(result, null, 2)}\n`),
  ]);
  return result;
}

export default defineCommand({
  path: ["export", "d1"],
  summary: "Export D1 schema and seed SQL for a given month.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      mode: z
        .enum(["canonical", "appendix"])
        .default("canonical")
        .describe("Canonical full export or observed-reliability appendix"),
      exportRoot: z.string().optional().describe("Override export root directory"),
      artifactRoot: z.string().optional().describe("Override generated artifact root directory"),
      routeTimelineProjectionPath: z
        .string()
        .optional()
        .describe("Optional route timeline serving projection JSON to fold into D1 seed output"),
      detectorReadinessManifestPath: z
        .string()
        .optional()
        .describe(
          "Optional detector readiness serving manifest JSON to fold into D1 route artifact refs",
        ),
      routeEvidenceIndexPath: z
        .string()
        .optional()
        .describe(
          "Optional MTA-wiki route evidence index JSON to fold into D1 route artifact refs",
        ),
    }),
  },
  output: z.union([
    z.object({ mode: z.literal("appendix") }).passthrough(),
    z.object({ schemaPath: z.string() }).passthrough(),
  ]),
  async run({ input }) {
    const exportRoot =
      input.options.exportRoot === undefined ? undefined : fromCliPath(input.options.exportRoot);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const routeTimelineProjectionPath =
      input.options.routeTimelineProjectionPath === undefined
        ? undefined
        : fromCliPath(input.options.routeTimelineProjectionPath);
    const detectorReadinessManifestPath =
      input.options.detectorReadinessManifestPath === undefined
        ? undefined
        : fromCliPath(input.options.detectorReadinessManifestPath);
    const routeEvidenceIndexPath =
      input.options.routeEvidenceIndexPath === undefined
        ? undefined
        : fromCliPath(input.options.routeEvidenceIndexPath);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "export.d1",
      operation: input.options.mode === "appendix" ? "runExportD1AppendixSeed" : "runExportD1Seed",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        mode: input.options.mode,
      },
      run: async (local): Promise<ExportD1CommandResult> => {
        if (input.options.mode === "appendix") {
          return runExportD1AppendixSeed({
            local,
            year: input.options.year,
            month: input.options.month,
            exportRoot,
          });
        }
        return runExportD1Seed({
          local,
          year: input.options.year,
          month: input.options.month,
          exportRoot,
          artifactRoot,
          routeTimelineProjectionPath,
          detectorReadinessManifestPath,
          routeEvidenceIndexPath,
        });
      },
    });
  },
});

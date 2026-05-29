import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { buildD1AppendixSeedSql, buildD1SeedSql } from "@bp/db/d1/seed";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultExportRootPath, fromCliPath } from "../../lib/paths.ts";
import { readD1MigrationSql } from "./d1-migrations.ts";
import {
  type D1AppendixInputs,
  type D1CanonicalInputs,
  readLocalD1AppendixInputs,
  readLocalD1Inputs,
} from "./d1-inputs.ts";

type D1FileContract = {
  path: string;
  byteLength: number;
  sha256: string;
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
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
  routeBatchBuiltRouteRowCount: number;
  routeBatchIssueRowCount: number;
  routeBriefPeakWindowRowCount: number;
  routeBriefSlowestWindowRowCount: number;
  routeScorecardCitationRowCount: number;
};

export type D1AppendixSeedOutputResult = {
  schemaVersion: number;
  isoMonth: string;
  mode: "appendix";
  generatedAt: string;
  summaryPath: string;
  seedPath: string;
  seedFile: D1FileContract;
  routeObservedReliabilitySummaryRowCount: number;
  routeMonthSourceStatusRowCount: number;
};

function fileContract(path: string, content: string): D1FileContract {
  const bytes = new TextEncoder().encode(content);
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export type ExportD1Inputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  exportRoot?: string | undefined;
  inputs?: D1CanonicalInputs | undefined;
};

export async function runExportD1Seed(inputs: ExportD1Inputs): Promise<D1SeedOutputResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const exportDir = join(inputs.exportRoot ?? defaultExportRootPath(), "d1", month);
  const summaryPath = join(exportDir, "export-summary.json");
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");

  const d1Inputs = inputs.inputs ?? (await readLocalD1Inputs(inputs.local.db, month));
  const schemaSql = await readD1MigrationSql();
  const seed = buildD1SeedSql({ month, ...d1Inputs });
  const generatedAt = new Date().toISOString();

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
    routeEquityContextRowCount: seed.routeEquityContextRowCount,
    routeBatchStatusRowCount: seed.routeBatchStatusRowCount,
    routeBatchBuiltRouteRowCount: seed.routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount: seed.routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount: seed.routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount: seed.routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount: seed.routeScorecardCitationRowCount,
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
    }),
  },
  middleware: [withLocalDb()],
  output: z.union([
    z.object({ mode: z.literal("appendix") }).passthrough(),
    z.object({ schemaPath: z.string() }).passthrough(),
  ]),
  async run({ ctx, input }) {
    const local = localDbFromCtx(ctx);
    const exportRoot =
      input.options.exportRoot === undefined ? undefined : fromCliPath(input.options.exportRoot);
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
    });
  },
});

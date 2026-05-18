import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildD1AppendixSeedSql, buildD1SeedSql } from "@bp/db/d1/seed";
import { defaultExportRootPath } from "../../lib/paths.js";
import { readD1MigrationSql } from "./d1-migrations.js";
import { readLocalD1AppendixInputs, readLocalD1Inputs } from "./route-d1-inputs.js";

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

type D1FileContract = {
  path: string;
  byteLength: number;
  sha256: string;
};

function fileContract(path: string, content: string): D1FileContract {
  const bytes = new TextEncoder().encode(content);
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function writeRouteD1SeedOutput(input: {
  dbPath: string;
  isoMonth: string;
  exportRoot?: string;
}): Promise<D1SeedOutputResult> {
  const exportDir = join(input.exportRoot ?? defaultExportRootPath(), "d1", input.isoMonth);
  const summaryPath = join(exportDir, "export-summary.json");
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  const d1Inputs = await readLocalD1Inputs(input.dbPath, input.isoMonth);
  const schemaSql = await readD1MigrationSql();
  const seed = buildD1SeedSql({
    month: input.isoMonth,
    ...d1Inputs,
  });
  const generatedAt = new Date().toISOString();
  const result: D1SeedOutputResult = {
    schemaVersion: 1,
    isoMonth: input.isoMonth,
    analysisPeriod: input.isoMonth,
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

export async function writeRouteD1AppendixSeedOutput(input: {
  dbPath: string;
  isoMonth: string;
  exportRoot?: string;
}): Promise<D1AppendixSeedOutputResult> {
  const exportDir = join(input.exportRoot ?? defaultExportRootPath(), "d1", input.isoMonth);
  const summaryPath = join(exportDir, "appendix-summary.json");
  const seedPath = join(exportDir, "seed.appendix.sql");
  const inputs = await readLocalD1AppendixInputs(input.dbPath, input.isoMonth);
  const seed = buildD1AppendixSeedSql({ month: input.isoMonth, ...inputs });
  const generatedAt = new Date().toISOString();
  const result: D1AppendixSeedOutputResult = {
    schemaVersion: 1,
    isoMonth: input.isoMonth,
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

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildD1SeedSql } from "@bp/db/d1/seed";
import { fromRepoRoot } from "../../source-manifest.js";
import { readD1MigrationSql } from "./d1-migrations.js";
import { readLocalD1Inputs } from "./route-d1-inputs.js";

export type D1SeedOutputResult = {
  isoMonth: string;
  schemaPath: string;
  seedPath: string;
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

export async function writeRouteD1SeedOutput(input: {
  dbPath: string;
  isoMonth: string;
}): Promise<D1SeedOutputResult> {
  const exportDir = fromRepoRoot(join("data/exports/d1", input.isoMonth));
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  const d1Inputs = await readLocalD1Inputs(input.dbPath, input.isoMonth);
  const schemaSql = await readD1MigrationSql();
  const seed = buildD1SeedSql({
    month: input.isoMonth,
    ...d1Inputs,
  });

  await mkdir(exportDir, { recursive: true });
  await Promise.all([Bun.write(schemaPath, schemaSql), Bun.write(seedPath, seed.seedSql)]);

  return {
    isoMonth: input.isoMonth,
    schemaPath,
    seedPath,
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
}

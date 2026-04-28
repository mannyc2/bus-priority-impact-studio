import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  getRouteBatchStatus,
  listRouteArtifacts,
  listRouteBatchBuiltRoutes,
  listRouteBatchIssues,
  listRouteBriefPeakWindows,
  listRouteBriefSlowestWindows,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteCatalog,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteMonthCoverage,
  listRouteMonthSourceStatuses,
  listRouteMonthTrends,
  listRouteReadiness,
  listRouteReliabilityBaselines,
  listRouteReliabilityGapWindows,
  listRouteScorecards,
} from "@bp/db/local";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";
import { readD1MigrationSql } from "./d1-migrations.js";
import { buildD1SeedSql } from "./write-d1-seed-sql.js";

type D1ExportArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type D1ExportResult = {
  isoMonth: string;
  schemaPath: string;
  seedPath: string;
  routeCount: number;
  artifactRowCount: number;
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

function parseBuildArgs(args: D1ExportArgs = {}): Required<D1ExportArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): D1ExportArgs {
  const output: D1ExportArgs = {};

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

async function readLocalD1Inputs(path: string, month: string) {
  const local = await openLocalPipelineDb(path);

  try {
    const [
      routeCatalog,
      routeCoverage,
      routeReadiness,
      routeBuildPlan,
      routeReliabilityBaseline,
      routeReliabilityGapWindows,
      routeMonthSourceStatuses,
      routeMonthTrends,
      routeEquityContext,
      routeArtifacts,
      routeScorecards,
      routeBriefSummaries,
      routeBriefPeakWindows,
      routeBriefSlowestWindows,
      routeComparisonRanks,
      routeBatchStatus,
      routeBatchBuiltRoutes,
      routeBatchIssues,
    ] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteMonthCoverage(local.db, month),
      listRouteReadiness(local.db, month),
      listRouteBuildPlan(local.db, month),
      listRouteReliabilityBaselines(local.db, month),
      listRouteReliabilityGapWindows(local.db, month),
      listRouteMonthSourceStatuses(local.db, month),
      listRouteMonthTrends(local.db),
      listRouteEquityContexts(local.db, month),
      listRouteArtifacts(local.db, month),
      listRouteScorecards(local.db, month),
      listRouteBriefSummaries(local.db, month),
      listRouteBriefPeakWindows(local.db, month),
      listRouteBriefSlowestWindows(local.db, month),
      listRouteComparisonRanks(local.db, month),
      getRouteBatchStatus(local.db, month),
      listRouteBatchBuiltRoutes(local.db, month),
      listRouteBatchIssues(local.db, month),
    ]);

    return {
      routeCatalog,
      routeCoverage,
      routeReadiness,
      routeBuildPlan,
      routeReliabilityBaseline,
      routeReliabilityGapWindows,
      routeMonthSourceStatuses,
      routeMonthTrends,
      routeEquityContext,
      routeArtifacts,
      routeScorecards,
      routeBriefSummaries,
      routeBriefPeakWindows,
      routeBriefSlowestWindows,
      routeComparisonRanks,
      routeBatchStatus,
      routeBatchBuiltRoutes,
      routeBatchIssues,
    };
  } finally {
    local.sqlite.close();
  }
}

export async function exportD1Seed(args: D1ExportArgs = {}): Promise<D1ExportResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const exportDir = fromRepoRoot(join("data/exports/d1", month));
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  await buildRouteBatchAudit({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  });
  const {
    routeCatalog,
    routeCoverage,
    routeReadiness,
    routeBuildPlan,
    routeReliabilityBaseline,
    routeReliabilityGapWindows,
    routeMonthSourceStatuses,
    routeMonthTrends,
    routeEquityContext,
    routeArtifacts,
    routeScorecards,
    routeBriefSummaries,
    routeBriefPeakWindows,
    routeBriefSlowestWindows,
    routeComparisonRanks,
    routeBatchStatus,
    routeBatchBuiltRoutes,
    routeBatchIssues,
  } = await readLocalD1Inputs(options.dbPath, month);
  const schemaSql = await readD1MigrationSql();
  const seed = buildD1SeedSql({
    month,
    routeCatalog,
    routeCoverage,
    routeReadiness,
    routeBuildPlan,
    routeReliabilityBaseline,
    routeReliabilityGapWindows,
    routeMonthSourceStatuses,
    routeMonthTrends,
    routeEquityContext,
    routeArtifacts,
    routeScorecards,
    routeBriefSummaries,
    routeBriefPeakWindows,
    routeBriefSlowestWindows,
    routeComparisonRanks,
    routeBatchStatus,
    routeBatchBuiltRoutes,
    routeBatchIssues,
  });

  await mkdir(exportDir, { recursive: true });
  await Promise.all([Bun.write(schemaPath, schemaSql), Bun.write(seedPath, seed.seedSql)]);

  return {
    isoMonth: month,
    schemaPath,
    seedPath,
    routeCount: seed.routeCount,
    artifactRowCount: seed.artifactRowCount,
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

export async function exportD1SeedFromCli(args: string[]): Promise<D1ExportResult> {
  return exportD1Seed(parseCliArgs(args));
}

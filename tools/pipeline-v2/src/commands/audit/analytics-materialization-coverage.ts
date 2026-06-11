import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { analyticsMaterializationCoveragePath } from "@bp/applied-research/artifacts";
import { DATA_PRODUCT_MANIFEST } from "@bp/applied-research/data-products";
import {
  type AnalyticsMaterializationCoverageAudit,
  buildAnalyticsMaterializationCoverageAudit,
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS,
  type MaterializationCoverageRegistryProduct,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { analyticsMaterializationCoveragePath } from "@bp/applied-research/artifacts";
export type {
  AnalyticsMaterializationCoverageAudit,
  MaterializationCoverageStatus,
  MaterializationCoverageSurface,
} from "@bp/applied-research/evaluation";
export {
  buildAnalyticsMaterializationCoverageAudit,
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE,
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS,
} from "@bp/applied-research/evaluation";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function materializationCoverageRegistryProducts(): MaterializationCoverageRegistryProduct[] {
  const productById = new Map(
    DATA_PRODUCT_MANIFEST.products.map((product) => [product.id, product]),
  );
  return MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS.map((id) => {
    const product = productById.get(id);
    if (product === undefined) {
      throw new Error(`Materialization coverage registry product is missing: ${id}`);
    }
    return {
      id: product.id,
      label: product.label,
      expectedBasis: product.expectedUniverse.description,
    };
  });
}

const surfaceSummarySchema = z.object({
  surfaceId: z.string(),
  label: z.string(),
  status: z.enum(["complete", "partial", "missing", "not_applicable"]),
  expectedRouteCount: z.number().int().nonnegative(),
  materializedRouteCount: z.number().int().nonnegative(),
  missingRouteCount: z.number().int().nonnegative(),
  materializedRouteShare: z.number().nullable(),
  sampleMissingRoutes: z.array(z.string()),
});

export default defineCommand({
  path: ["audit", "analytics-materialization-coverage"],
  summary:
    "Audit selected route-level table/artifact materialization surfaces; canonical product completeness is audit data-product-completeness.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Materialization calendar year"),
      month: arg.positiveInt().default(5).describe("Materialization calendar month, 1-12"),
      runId: z.string().optional().describe("Observed GTFS-RT/import run id"),
      gtfsRunId: z.string().optional().describe("GTFS static staging run id"),
      historyStartMonth: z
        .string()
        .default("2023-04")
        .describe("Start month for score-vector artifact lookup"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for coverage JSON"),
    }),
  },
  output: z.object({
    month: z.string(),
    runId: z.string(),
    gtfsRunId: z.string().nullable(),
    outputPath: z.string(),
    routeCatalogCount: z.number().int().nonnegative(),
    gtfsStaticRouteCount: z.number().int().nonnegative(),
    observedHeadwayRouteCount: z.number().int().nonnegative(),
    ewtEligibleRouteCount: z.number().int().nonnegative(),
    surfaceCount: z.number().int().nonnegative(),
    completeSurfaceCount: z.number().int().nonnegative(),
    partialSurfaceCount: z.number().int().nonnegative(),
    missingSurfaceCount: z.number().int().nonnegative(),
    totalMissingRoutes: z.number().int().nonnegative(),
    surfaces: z.array(surfaceSummarySchema),
  }),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    const runId = input.options.runId ?? `bus-observatory-${month}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? analyticsMaterializationCoveragePath({ artifactRoot, month, runId })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let audit: AnalyticsMaterializationCoverageAudit;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      audit = await buildAnalyticsMaterializationCoverageAudit({
        sqlite,
        month,
        runId,
        gtfsRunId: input.options.gtfsRunId ?? null,
        artifactRoot,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        historyStartMonth: input.options.historyStartMonth,
        registryProducts: materializationCoverageRegistryProducts(),
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, audit);

    return {
      month,
      runId,
      gtfsRunId: audit.gtfsRunId,
      outputPath: repoDisplayPath(outputPath),
      routeCatalogCount: audit.routeUniverse.routeCatalogCount,
      gtfsStaticRouteCount: audit.routeUniverse.gtfsStaticRouteCount,
      observedHeadwayRouteCount: audit.routeUniverse.observedHeadwayRouteCount,
      ewtEligibleRouteCount: audit.routeUniverse.ewtEligibleRouteCount,
      surfaceCount: audit.summary.surfaceCount,
      completeSurfaceCount: audit.summary.completeSurfaceCount,
      partialSurfaceCount: audit.summary.partialSurfaceCount,
      missingSurfaceCount: audit.summary.missingSurfaceCount,
      totalMissingRoutes: audit.summary.totalMissingRoutes,
      surfaces: audit.surfaces.map((surface) => ({
        surfaceId: surface.surfaceId,
        label: surface.label,
        status: surface.status,
        expectedRouteCount: surface.expectedRouteCount,
        materializedRouteCount: surface.materializedRouteCount,
        missingRouteCount: surface.missingRouteCount,
        materializedRouteShare: surface.materializedRouteShare,
        sampleMissingRoutes: surface.sampleMissingRoutes,
      })),
    };
  },
});

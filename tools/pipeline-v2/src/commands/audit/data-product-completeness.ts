import { Database as BunDatabase, type Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  dataProductCompletenessPath,
  sourceMonthCoverageMatrixPath,
} from "@bp/applied-research/artifacts";
import {
  classifyDataProductCompleteness,
  DATA_PRODUCT_MANIFEST,
  type DataProduct,
  type DataProductCheck,
  type DataProductCheckAudit,
  type DataProductCompletenessProductAudit,
  type DataProductCompletenessProductAuditBase,
  type DataProductCompletenessStatus,
  type DataProductCoverageSummary,
  type DataProductDownstreamBlocker,
  type DataProductGapClass,
  type DataProductManifest,
  type DataProductRouteUniverse,
  dataProductCoverageSummary,
  dataProductGapClassCounts,
  dataProductReasons,
  dataProductStatus,
  dataProductStatusCounts,
  parseDataProductManifestText,
} from "@bp/applied-research/data-products";
import {
  buildDataProductRouteUniverses,
  buildSourceMonthCoverageMatrix,
  type DataProductRouteUniverseSets,
  dataProductRouteUniverseSummary,
  evaluateDataProductArtifactGlobCheck,
  evaluateDataProductJsonOrFileArtifactCheck,
  evaluateDataProductMonthTableCoverageCheck,
  evaluateDataProductRouteArtifactCoverageCheck,
  evaluateDataProductScoreVectorRoutesCheck,
  evaluateDataProductSourceYearRouteCoverageCheck,
  evaluateDataProductTableRouteCoverageCheck,
  evaluateDataProductTableRowCountCheck,
  latestDataProductGtfsRunId,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth, monthRange } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export type DataProductCompletenessAudit = {
  artifactKind: "data_product_completeness";
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  manifestVersion: number;
  releaseMonth: string;
  runId: string;
  gtfsRunId: string | null;
  historyWindow: {
    startMonth: string;
    endMonth: string;
    monthCount: number;
  };
  routeUniverses: Record<DataProductRouteUniverse, { routeCount: number; sampleRoutes: string[] }>;
  summary: Record<`${DataProductCompletenessStatus}ProductCount`, number> & {
    productCount: number;
    checkCount: number;
    downstreamBlockedProductCount: number;
    gapClassCounts: Record<DataProductGapClass, number>;
  };
  coverage: DataProductCoverageSummary;
  products: DataProductCompletenessProductAudit[];
  downstreamBlockers: DataProductDownstreamBlocker[];
  nextActions: string[];
};

export {
  dataProductCompletenessPath,
  sourceMonthCoverageMatrixPath,
} from "@bp/applied-research/artifacts";
export {
  classifyDataProductCompleteness,
  DATA_PRODUCT_MANIFEST,
  type DataProductCheckAudit,
  type DataProductCompletenessProductAudit,
  type DataProductCompletenessProductAuditBase,
  type DataProductCoverageBucket,
  type DataProductCoverageProductSummary,
  type DataProductCoverageSummary,
  type DataProductDownstreamBlocker,
  type DataProductGapClass,
  type DataProductRootCause,
  dataProductCoverageSummary,
  dataProductGapClassCounts,
  dataProductJsonSemanticReasons,
  dataProductReasons,
  dataProductScoreVectorRouteIds,
  dataProductStatus,
  dataProductStatusCounts,
  parseDataProductManifestText,
} from "@bp/applied-research/data-products";
export {
  buildDataProductRouteUniverses,
  buildSourceMonthCoverageMatrix,
  type DataProductRouteUniverseSets,
  type DataProductRouteUniverseSummary,
  dataProductRouteUniverseSummary,
  latestDataProductGtfsRunId,
  type SourceMonthCoverageCell,
  type SourceMonthCoverageMatrix,
  type SourceMonthCoverageSource,
} from "@bp/applied-research/local-db";

type RouteUniverseSets = DataProductRouteUniverseSets;

type BuildDataProductCompletenessAuditInput = {
  sqlite: Database;
  manifest?: DataProductManifest;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId?: string | null;
  artifactRoot: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  rawReliabilityRoot?: string | undefined;
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseIsoMonthParts(value: string): { year: number; month: number } {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid ISO month: ${value}`);
  }
  return { year, month };
}

function requestedMonths(startMonth: string, endMonth: string): string[] {
  const start = parseIsoMonthParts(startMonth);
  const end = parseIsoMonthParts(endMonth);
  return monthRange(start.year, start.month, end.year, end.month).map((month) => month.isoMonth);
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function evaluateCheck(input: {
  product: DataProduct;
  check: DataProductCheck;
  sqlite: Database;
  routeUniverses: RouteUniverseSets;
  months: readonly string[];
  releaseMonth: string;
  historyStartMonth: string;
  artifactRoot: string;
  runId: string;
  gtfsRunId: string | null;
  generatedAt: string;
}): Promise<DataProductCheckAudit> {
  switch (input.check.type) {
    case "month_table_coverage":
      return evaluateDataProductMonthTableCoverageCheck({
        sqlite: input.sqlite,
        check: input.check,
        months: input.months,
      });
    case "table_route_coverage":
      return evaluateDataProductTableRouteCoverageCheck({
        sqlite: input.sqlite,
        check: input.check,
        routeUniverses: input.routeUniverses,
        releaseMonth: input.releaseMonth,
        runId: input.runId,
      });
    case "table_row_count":
      return evaluateDataProductTableRowCountCheck({
        sqlite: input.sqlite,
        check: input.check,
      });
    case "source_year_route_coverage":
      return evaluateDataProductSourceYearRouteCoverageCheck({
        sqlite: input.sqlite,
        check: input.check,
        routeUniverses: input.routeUniverses,
        months: input.months,
        templateValues: {
          repoRoot,
          artifactRoot: input.artifactRoot,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          runId: input.runId,
          gtfsRunId: input.gtfsRunId,
        },
        displayPath: repoDisplayPath,
      });
    case "route_artifact_coverage":
      return evaluateDataProductRouteArtifactCoverageCheck({
        check: input.check,
        routeUniverses: input.routeUniverses,
        templateValues: {
          repoRoot,
          artifactRoot: input.artifactRoot,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          runId: input.runId,
          gtfsRunId: input.gtfsRunId,
        },
        displayPath: repoDisplayPath,
      });
    case "score_vector_routes":
      return evaluateDataProductScoreVectorRoutesCheck({
        check: input.check,
        routeUniverses: input.routeUniverses,
        templateValues: {
          repoRoot,
          artifactRoot: input.artifactRoot,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          runId: input.runId,
          gtfsRunId: input.gtfsRunId,
        },
        displayPath: repoDisplayPath,
      });
    case "json_artifact":
    case "file_artifact":
      return evaluateDataProductJsonOrFileArtifactCheck({
        product: input.product,
        check: input.check,
        templateValues: {
          repoRoot,
          artifactRoot: input.artifactRoot,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          runId: input.runId,
          gtfsRunId: input.gtfsRunId,
        },
        generatedAt: input.generatedAt,
        displayPath: repoDisplayPath,
      });
    case "artifact_glob":
      return evaluateDataProductArtifactGlobCheck({
        check: input.check,
        templateValues: {
          repoRoot,
          artifactRoot: input.artifactRoot,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          runId: input.runId,
          gtfsRunId: input.gtfsRunId,
        },
        displayPath: repoDisplayPath,
      });
  }
}

function readJsonFile(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function rowMonth(value: unknown): string | null {
  const month = textValue(asJsonObject(value)["month"]);
  return month === null ? null : month.slice(0, 7);
}

function snapshotRowCountForMonth(value: unknown, month: string): number {
  return asJsonArray(asJsonObject(value)["rows"]).filter((row) => rowMonth(row) === month).length;
}

function hasZeroRowBusWaitAssessmentSnapshot(input: {
  rawReliabilityRoot: string;
  releaseMonth: string;
}): boolean {
  const path = join(input.rawReliabilityRoot, `bus-wait-assessment-${input.releaseMonth}.json`);
  if (!existsSync(path)) return false;
  const snapshot = asJsonObject(readJsonFile(path));
  if (textValue(snapshot["isoMonth"]) !== input.releaseMonth) return false;
  return asJsonArray(snapshot["rows"]).length === 0;
}

function hasZeroRowCustomerJourneySnapshot(input: {
  rawReliabilityRoot: string;
  releaseMonth: string;
}): boolean {
  if (!existsSync(input.rawReliabilityRoot)) return false;
  const pattern = /^bus-customer-journey-metrics-(\d{4}-\d{2})_to_(\d{4}-\d{2})\.json$/;
  for (const name of readdirSync(input.rawReliabilityRoot)) {
    const match = name.match(pattern);
    if (match === null) continue;
    const [, startMonth, endMonth] = match;
    if (
      startMonth === undefined ||
      endMonth === undefined ||
      input.releaseMonth < startMonth ||
      input.releaseMonth > endMonth
    ) {
      continue;
    }
    const snapshot = readJsonFile(join(input.rawReliabilityRoot, name));
    if (snapshotRowCountForMonth(snapshot, input.releaseMonth) === 0) return true;
  }
  return false;
}

function hasZeroRowReleaseSourceSnapshot(input: {
  productId: string;
  rawReliabilityRoot: string;
  releaseMonth: string;
}): boolean {
  switch (input.productId) {
    case "local_bus_wait_assessment_history":
      return hasZeroRowBusWaitAssessmentSnapshot(input);
    case "local_bus_customer_journey_metrics_history":
      return hasZeroRowCustomerJourneySnapshot(input);
    default:
      return false;
  }
}

export async function buildDataProductCompletenessAudit(
  input: BuildDataProductCompletenessAuditInput,
): Promise<DataProductCompletenessAudit> {
  const manifest = input.manifest ?? DATA_PRODUCT_MANIFEST;
  const gtfsRunId = input.gtfsRunId ?? latestDataProductGtfsRunId(input.sqlite);
  const months = requestedMonths(input.historyStartMonth, input.releaseMonth);
  const routeUniverses = buildDataProductRouteUniverses({
    sqlite: input.sqlite,
    releaseMonth: input.releaseMonth,
    runId: input.runId,
    gtfsRunId,
  });

  const baseProducts: DataProductCompletenessProductAuditBase[] = [];
  for (const product of manifest.products) {
    const checks = await Promise.all(
      product.checks.map((check) =>
        evaluateCheck({
          product,
          check,
          sqlite: input.sqlite,
          routeUniverses,
          months,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          artifactRoot: input.artifactRoot,
          runId: input.runId,
          gtfsRunId,
          generatedAt: input.generatedAt,
        }),
      ),
    );
    const status = dataProductStatus(product, checks);
    baseProducts.push({
      productId: product.id,
      label: product.label,
      kind: product.kind,
      owner: product.owner,
      grain: product.grain,
      producerCommand: product.producerCommand,
      expectedUniverse: product.expectedUniverse,
      requiredInputs: product.requiredInputs,
      downstreamConsumers: product.downstreamConsumers,
      freshnessPolicy: product.freshnessPolicy,
      lifecycle: product.lifecycle,
      status,
      checks,
      reasons: dataProductReasons(product, checks),
    });
  }
  const rawReliabilityRoot = input.rawReliabilityRoot ?? join(repoRoot, "data/raw/reliability");
  const products = classifyDataProductCompleteness({
    products: baseProducts,
    releaseMonth: input.releaseMonth,
    routeUniverses,
    sourceHasZeroRows: ({ productId, releaseMonth }) =>
      hasZeroRowReleaseSourceSnapshot({
        productId,
        rawReliabilityRoot,
        releaseMonth,
      }),
  });

  const downstreamBlockers = products
    .filter((product) => product.status !== "complete" && product.status !== "waived")
    .map((product) => ({
      productId: product.productId,
      status: product.status,
      gapClass: product.gapClass,
      gapClasses: product.gapClasses,
      downstreamConsumers: product.downstreamConsumers,
      rootCauses: product.rootCauses,
      reasons: product.reasons,
    }));

  return {
    artifactKind: "data_product_completeness",
    generatedAt: input.generatedAt,
    dbPath: input.dbPath === null ? null : repoDisplayPath(input.dbPath),
    artifactPath: repoDisplayPath(input.artifactPath),
    manifestVersion: manifest.version,
    releaseMonth: input.releaseMonth,
    runId: input.runId,
    gtfsRunId,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
      monthCount: months.length,
    },
    routeUniverses: dataProductRouteUniverseSummary(routeUniverses),
    summary: {
      productCount: products.length,
      checkCount: products.reduce((sum, product) => sum + product.checks.length, 0),
      ...dataProductStatusCounts(products),
      downstreamBlockedProductCount: downstreamBlockers.length,
      gapClassCounts: dataProductGapClassCounts(products),
    },
    coverage: dataProductCoverageSummary(products),
    products,
    downstreamBlockers,
    nextActions:
      downstreamBlockers.length === 0
        ? ["No derived data-product completeness blockers found for the audited scope."]
        : downstreamBlockers.map(
            (blocker) =>
              `Resolve or explicitly waive ${blocker.productId} (${blocker.status}, ${blocker.gapClass}) before relying on ${blocker.downstreamConsumers.join(", ")}.`,
          ),
  };
}

const productSummarySchema = z.object({
  productId: z.string(),
  label: z.string(),
  kind: z.string(),
  status: z.enum(["complete", "partial", "missing", "stale", "waived", "blocked", "fetching"]),
  gapClass: z.enum([
    "none",
    "upstream_blocked",
    "downstream_blocked",
    "available_not_fetched",
    "derived_not_built",
    "derived_from_available_not_fetched",
    "derived_from_upstream_blocked",
    "planned_blocked",
    "fetching",
    "waived",
    "stale",
    "unknown",
  ]),
  gapClasses: z.array(
    z.enum([
      "none",
      "upstream_blocked",
      "downstream_blocked",
      "available_not_fetched",
      "derived_not_built",
      "derived_from_available_not_fetched",
      "derived_from_upstream_blocked",
      "planned_blocked",
      "fetching",
      "waived",
      "stale",
      "unknown",
    ]),
  ),
  downstreamConsumers: z.array(z.string()),
  rootCauses: z.array(
    z.object({
      productId: z.string(),
      label: z.string(),
      status: z.enum(["complete", "partial", "missing", "stale", "waived", "blocked", "fetching"]),
      gapClass: z.enum([
        "none",
        "upstream_blocked",
        "downstream_blocked",
        "available_not_fetched",
        "derived_not_built",
        "derived_from_available_not_fetched",
        "derived_from_upstream_blocked",
        "planned_blocked",
        "fetching",
        "waived",
        "stale",
        "unknown",
      ]),
      reasons: z.array(z.string()),
    }),
  ),
  reasons: z.array(z.string()),
});

const coverageBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  products: z.array(productSummarySchema),
});

export default defineCommand({
  path: ["audit", "data-product-completeness"],
  summary: "Audit derived data-product completeness from the pipeline-v2 registry.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      historyStartMonth: z
        .string()
        .default("2023-04")
        .describe("Start month for historical data-product coverage"),
      runId: z.string().optional().describe("Observed GTFS-RT/import run id"),
      gtfsRunId: z.string().optional().describe("GTFS static staging run id"),
      manifest: z.string().optional().describe("Optional JSON/YAML data-product manifest path"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for completeness JSON"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    historyStartMonth: z.string(),
    runId: z.string(),
    gtfsRunId: z.string().nullable(),
    outputPath: z.string(),
    productCount: z.number().int().nonnegative(),
    completeProductCount: z.number().int().nonnegative(),
    partialProductCount: z.number().int().nonnegative(),
    missingProductCount: z.number().int().nonnegative(),
    staleProductCount: z.number().int().nonnegative(),
    waivedProductCount: z.number().int().nonnegative(),
    blockedProductCount: z.number().int().nonnegative(),
    fetchingProductCount: z.number().int().nonnegative(),
    downstreamBlockedProductCount: z.number().int().nonnegative(),
    gapClassCounts: z.object({
      none: z.number().int().nonnegative(),
      upstream_blocked: z.number().int().nonnegative(),
      downstream_blocked: z.number().int().nonnegative(),
      available_not_fetched: z.number().int().nonnegative(),
      derived_not_built: z.number().int().nonnegative(),
      derived_from_available_not_fetched: z.number().int().nonnegative(),
      derived_from_upstream_blocked: z.number().int().nonnegative(),
      planned_blocked: z.number().int().nonnegative(),
      fetching: z.number().int().nonnegative(),
      waived: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      unknown: z.number().int().nonnegative(),
    }),
    coverage: z.object({
      complete: coverageBucketSchema,
      needsFetch: coverageBucketSchema,
      needsBuild: coverageBucketSchema,
      upstreamBlocked: coverageBucketSchema,
      downstreamBlocked: coverageBucketSchema,
      plannedBlocked: coverageBucketSchema,
      fetching: coverageBucketSchema,
      stale: coverageBucketSchema,
      waived: coverageBucketSchema,
      unknown: coverageBucketSchema,
    }),
    products: z.array(productSummarySchema),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const historyStartMonth = input.options.historyStartMonth;
    const runId = input.options.runId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? dataProductCompletenessPath({
            artifactRoot,
            historyStartMonth,
            releaseMonth,
            runId,
          })
        : fromCliPath(input.options.output);
    const manifest =
      input.options.manifest === undefined
        ? DATA_PRODUCT_MANIFEST
        : parseDataProductManifestText(await Bun.file(fromCliPath(input.options.manifest)).text());
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let audit: DataProductCompletenessAudit;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const generatedAt = new Date().toISOString();
      const matrixPath = sourceMonthCoverageMatrixPath({
        artifactRoot,
        historyStartMonth,
        releaseMonth,
      });
      const matrix = buildSourceMonthCoverageMatrix({
        sqlite,
        historyStartMonth,
        releaseMonth,
        generatedAt,
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(matrixPath),
      });
      await mkdir(dirname(matrixPath), { recursive: true });
      await writeJson(matrixPath, matrix);
      audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth,
        historyStartMonth,
        runId,
        gtfsRunId: input.options.gtfsRunId ?? null,
        artifactRoot,
        generatedAt,
        dbPath,
        artifactPath: outputPath,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, audit);

    return {
      releaseMonth,
      historyStartMonth,
      runId,
      gtfsRunId: audit.gtfsRunId,
      outputPath: repoDisplayPath(outputPath),
      productCount: audit.summary.productCount,
      completeProductCount: audit.summary.completeProductCount,
      partialProductCount: audit.summary.partialProductCount,
      missingProductCount: audit.summary.missingProductCount,
      staleProductCount: audit.summary.staleProductCount,
      waivedProductCount: audit.summary.waivedProductCount,
      blockedProductCount: audit.summary.blockedProductCount,
      fetchingProductCount: audit.summary.fetchingProductCount,
      downstreamBlockedProductCount: audit.summary.downstreamBlockedProductCount,
      gapClassCounts: audit.summary.gapClassCounts,
      coverage: audit.coverage,
      products: audit.products.map((product) => ({
        productId: product.productId,
        label: product.label,
        kind: product.kind,
        status: product.status,
        gapClass: product.gapClass,
        gapClasses: product.gapClasses,
        downstreamConsumers: product.downstreamConsumers,
        rootCauses: product.rootCauses,
        reasons: product.reasons,
      })),
    };
  },
});

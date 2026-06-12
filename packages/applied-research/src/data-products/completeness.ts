import type {
  DataProduct,
  DataProductCheck,
  DataProductCompletenessStatus,
  DataProductRouteUniverse,
} from "./registry";
import {
  DataProductCompletenessStatusSchema,
  DataProductExpectedUniverseSchema,
  DataProductFreshnessPolicySchema,
  DataProductKindSchema,
  DataProductLifecycleSchema,
} from "./registry";
import { z } from "zod";

export type DataProductCheckAudit = {
  checkId: string;
  label: string;
  type: DataProductCheck["type"];
  status: DataProductCompletenessStatus;
  tableName: string | null;
  path: string | null;
  expectedCount: number;
  observedCount: number;
  missingCount: number;
  observedShare: number | null;
  sampleObserved: string[];
  sampleMissing: string[];
  samplePartial: string[];
  reasons: string[];
};

export type DataProductGapClass =
  | "none"
  | "upstream_blocked"
  | "downstream_blocked"
  | "available_not_fetched"
  | "source_absent"
  | "derived_not_built"
  | "derived_from_available_not_fetched"
  | "derived_from_upstream_blocked"
  | "planned_blocked"
  | "fetching"
  | "waived"
  | "stale"
  | "unknown";

export type DataProductRootCause = {
  productId: string;
  label: string;
  status: DataProductCompletenessStatus;
  gapClass: DataProductGapClass;
  reasons: string[];
};

export type DataProductCompletenessRef = {
  status: DataProductCompletenessStatus;
  reasons: string[];
};

type DataProductGapClassification = {
  gapClass: DataProductGapClass;
  gapClasses: DataProductGapClass[];
  rootCauses: DataProductRootCause[];
};

export type DataProductCompletenessProductAuditBase = {
  productId: string;
  label: string;
  kind: DataProduct["kind"];
  owner: string;
  grain: string;
  producerCommand: string;
  expectedUniverse: DataProduct["expectedUniverse"];
  requiredInputs: string[];
  downstreamConsumers: string[];
  freshnessPolicy: DataProduct["freshnessPolicy"];
  lifecycle: DataProduct["lifecycle"];
  status: DataProductCompletenessStatus;
  checks: DataProductCheckAudit[];
  reasons: string[];
};

export type DataProductCompletenessProductAudit = DataProductCompletenessProductAuditBase &
  DataProductGapClassification;

export type DataProductDownstreamBlocker = {
  productId: string;
  status: DataProductCompletenessStatus;
  gapClass: DataProductGapClass;
  gapClasses: DataProductGapClass[];
  downstreamConsumers: string[];
  rootCauses: DataProductRootCause[];
  reasons: string[];
};

export type DataProductCoverageProductSummary = {
  productId: string;
  label: string;
  kind: DataProduct["kind"];
  status: DataProductCompletenessStatus;
  gapClass: DataProductGapClass;
  gapClasses: DataProductGapClass[];
  reasons: string[];
  rootCauses: DataProductRootCause[];
  downstreamConsumers: string[];
};

export type DataProductCoverageBucket = {
  count: number;
  products: DataProductCoverageProductSummary[];
};

export type DataProductCoverageSummary = {
  complete: DataProductCoverageBucket;
  needsFetch: DataProductCoverageBucket;
  needsBuild: DataProductCoverageBucket;
  upstreamBlocked: DataProductCoverageBucket;
  downstreamBlocked: DataProductCoverageBucket;
  plannedBlocked: DataProductCoverageBucket;
  fetching: DataProductCoverageBucket;
  stale: DataProductCoverageBucket;
  waived: DataProductCoverageBucket;
  unknown: DataProductCoverageBucket;
  sourceAbsent: DataProductCoverageBucket;
};

export type DataProductCompletenessRouteUniverseSets = Record<
  DataProductRouteUniverse,
  { readonly size: number }
>;

export type ClassifyDataProductCompletenessInput = {
  products: readonly DataProductCompletenessProductAuditBase[];
  releaseMonth: string;
  routeUniverses: DataProductCompletenessRouteUniverseSets;
  sourceHasZeroRows?: (input: { productId: string; releaseMonth: string }) => boolean;
};

export type DataProductScoreVectorRouteParseResult = {
  routes: Set<string>;
  duplicateRoutes: string[];
  wrongMonthRoutes: string[];
  wrongRunRoutes: string[];
};

export const DATA_PRODUCT_COMPLETENESS_STATUS_ORDER: readonly DataProductCompletenessStatus[] = [
  "complete",
  "partial",
  "missing",
  "stale",
  "waived",
  "blocked",
  "fetching",
];

export const DATA_PRODUCT_GAP_CLASS_ORDER: readonly DataProductGapClass[] = [
  "none",
  "upstream_blocked",
  "downstream_blocked",
  "available_not_fetched",
  "source_absent",
  "derived_not_built",
  "derived_from_available_not_fetched",
  "derived_from_upstream_blocked",
  "planned_blocked",
  "fetching",
  "waived",
  "stale",
  "unknown",
];

export const DataProductGapClassSchema = z.enum([
  "none",
  "upstream_blocked",
  "downstream_blocked",
  "available_not_fetched",
  "source_absent",
  "derived_not_built",
  "derived_from_available_not_fetched",
  "derived_from_upstream_blocked",
  "planned_blocked",
  "fetching",
  "waived",
  "stale",
  "unknown",
]);

const DataProductCheckAuditTypeSchema = z.enum([
  "month_table_coverage",
  "table_route_coverage",
  "table_row_count",
  "source_year_route_coverage",
  "route_artifact_coverage",
  "score_vector_routes",
  "json_artifact",
  "file_artifact",
  "artifact_glob",
]);

export const DataProductCheckAuditSchema = z
  .object({
    checkId: z.string().min(1),
    label: z.string().min(1),
    type: DataProductCheckAuditTypeSchema,
    status: DataProductCompletenessStatusSchema,
    tableName: z.string().min(1).nullable(),
    path: z.string().min(1).nullable(),
    expectedCount: z.number().int().nonnegative(),
    observedCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
    observedShare: z.number().min(0).max(1).nullable(),
    sampleObserved: z.array(z.string()),
    sampleMissing: z.array(z.string()),
    samplePartial: z.array(z.string()),
    reasons: z.array(z.string()),
  })
  .strict();

export const DataProductRootCauseSchema = z
  .object({
    productId: z.string().min(1),
    label: z.string().min(1),
    status: DataProductCompletenessStatusSchema,
    gapClass: DataProductGapClassSchema,
    reasons: z.array(z.string()),
  })
  .strict();

export const DataProductCompletenessProductAuditSchema = z
  .object({
    productId: z.string().min(1),
    label: z.string().min(1),
    kind: DataProductKindSchema,
    owner: z.string().min(1),
    grain: z.string().min(1),
    producerCommand: z.string().min(1),
    expectedUniverse: DataProductExpectedUniverseSchema,
    requiredInputs: z.array(z.string().min(1)),
    downstreamConsumers: z.array(z.string().min(1)),
    freshnessPolicy: DataProductFreshnessPolicySchema,
    lifecycle: DataProductLifecycleSchema,
    status: DataProductCompletenessStatusSchema,
    checks: z.array(DataProductCheckAuditSchema),
    reasons: z.array(z.string()),
    gapClass: DataProductGapClassSchema,
    gapClasses: z.array(DataProductGapClassSchema),
    rootCauses: z.array(DataProductRootCauseSchema),
  })
  .strict();

export const DataProductCoverageProductSummarySchema = z
  .object({
    productId: z.string().min(1),
    label: z.string().min(1),
    kind: DataProductKindSchema,
    status: DataProductCompletenessStatusSchema,
    gapClass: DataProductGapClassSchema,
    gapClasses: z.array(DataProductGapClassSchema),
    reasons: z.array(z.string()),
    rootCauses: z.array(DataProductRootCauseSchema),
    downstreamConsumers: z.array(z.string().min(1)),
  })
  .strict();

export const DataProductCoverageBucketSchema = z
  .object({
    count: z.number().int().nonnegative(),
    products: z.array(DataProductCoverageProductSummarySchema),
  })
  .strict();

export const DataProductCoverageSummarySchema = z
  .object({
    complete: DataProductCoverageBucketSchema,
    needsFetch: DataProductCoverageBucketSchema,
    needsBuild: DataProductCoverageBucketSchema,
    upstreamBlocked: DataProductCoverageBucketSchema,
    downstreamBlocked: DataProductCoverageBucketSchema,
    plannedBlocked: DataProductCoverageBucketSchema,
    fetching: DataProductCoverageBucketSchema,
    stale: DataProductCoverageBucketSchema,
    waived: DataProductCoverageBucketSchema,
    unknown: DataProductCoverageBucketSchema,
    sourceAbsent: DataProductCoverageBucketSchema,
  })
  .strict();

export const DataProductCompletenessArtifactSchema = z
  .object({
    artifactKind: z.literal("data_product_completeness"),
    generatedAt: z.string().min(1),
    dbPath: z.string().min(1).nullable(),
    artifactPath: z.string().min(1),
    manifestVersion: z.number().int().positive(),
    releaseMonth: z.string().regex(/^\d{4}-\d{2}$/),
    runId: z.string().min(1),
    gtfsRunId: z.string().min(1).nullable(),
    historyWindow: z
      .object({
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/),
        monthCount: z.number().int().positive(),
      })
      .strict(),
    routeUniverses: z.record(
      z.string(),
      z
        .object({
          routeCount: z.number().int().nonnegative(),
          sampleRoutes: z.array(z.string()),
        })
        .strict(),
    ),
    summary: z
      .object({
        productCount: z.number().int().nonnegative(),
        checkCount: z.number().int().nonnegative(),
        completeProductCount: z.number().int().nonnegative(),
        partialProductCount: z.number().int().nonnegative(),
        missingProductCount: z.number().int().nonnegative(),
        staleProductCount: z.number().int().nonnegative(),
        waivedProductCount: z.number().int().nonnegative(),
        blockedProductCount: z.number().int().nonnegative(),
        fetchingProductCount: z.number().int().nonnegative(),
        downstreamBlockedProductCount: z.number().int().nonnegative(),
        gapClassCounts: z.record(DataProductGapClassSchema, z.number().int().nonnegative()),
      })
      .strict(),
    coverage: DataProductCoverageSummarySchema,
    products: z.array(DataProductCompletenessProductAuditSchema),
    downstreamBlockers: z.array(
      z
        .object({
          productId: z.string().min(1),
          status: DataProductCompletenessStatusSchema,
          gapClass: DataProductGapClassSchema,
          gapClasses: z.array(DataProductGapClassSchema),
          downstreamConsumers: z.array(z.string().min(1)),
          rootCauses: z.array(DataProductRootCauseSchema),
          reasons: z.array(z.string()),
        })
        .strict(),
    ),
    nextActions: z.array(z.string().min(1)),
  })
  .strict();

export type DataProductCompletenessArtifact = z.output<
  typeof DataProductCompletenessArtifactSchema
>;

export function parseDataProductCompletenessArtifact(
  input: unknown,
): DataProductCompletenessArtifact {
  return DataProductCompletenessArtifactSchema.parse(input);
}

const GAP_CLASS_PRIORITY: readonly DataProductGapClass[] = [
  "upstream_blocked",
  "source_absent",
  "derived_from_upstream_blocked",
  "available_not_fetched",
  "derived_from_available_not_fetched",
  "derived_not_built",
  "downstream_blocked",
  "planned_blocked",
  "fetching",
  "stale",
  "waived",
  "unknown",
  "none",
];

const DERIVED_PRODUCT_KINDS = new Set<DataProduct["kind"]>([
  "artifact_family",
  "detector_feature_artifact",
  "score_vector",
  "serving_projection",
  "release_manifest",
]);

const SPEED_RELEASE_SOURCE_PRODUCT_IDS = new Set([
  "local_route_segment_speed_history",
  "local_route_month_trends_history",
]);

const SPEED_RELEASE_ROUTE_UNIVERSES = new Set<DataProductRouteUniverse>([
  "speed_source_routes",
  "speed_ridership_source_routes",
  "public_visible_routes",
]);

export type DataProductRequiredInputResolution =
  | {
      input: string;
      kind: "product";
      productIds: string[];
    }
  | {
      input: string;
      kind: "source_manifest" | "external";
      productIds: [];
    }
  | {
      input: string;
      kind: "unresolved";
      productIds: [];
    };

export const DATA_PRODUCT_REQUIRED_INPUT_PRODUCT_ALIASES: Record<string, readonly string[]> = {
  local_route_artifact: ["studio_route_artifact_index"],
  local_route_brief_summary: ["studio_route_brief_summaries"],
  local_route_catalog: ["local_route_catalog_release"],
  local_route_hotspot_summary: ["studio_route_hotspot_summaries"],
  local_route_segment_speed: ["local_route_segment_speed_history"],
  local_route_hourly_ridership: ["local_route_hourly_ridership_history"],
  local_route_month_trend: ["local_route_month_trends_history"],
  local_route_month_coverage: ["local_route_month_coverage_release"],
  local_route_observed_reliability_summary: [
    "local_route_observed_reliability_summary_release",
  ],
  local_route_readiness: ["local_route_readiness_release"],
  local_route_intervention_comparison: ["local_route_intervention_comparison_history"],
  local_route_schedule_stop: ["local_route_schedule_stop_source_backfill"],
  local_route_schedule_timepoint: ["local_route_schedule_timepoints_release"],
  local_route_stop: ["local_route_stops_release"],
  local_route_stops: ["local_route_stops_release"],
  local_route_reliability_baseline: ["local_route_reliability_baseline_release"],
  local_observed_headway_sample: ["local_observed_headway_samples_run"],
  local_gtfs_static_stop_time: ["local_gtfs_static_bundle_support"],
  d1_serving_export: ["d1_serving_export_artifacts"],
  route_brief_artifacts: ["generated_route_briefs"],
  route_brief_input_slices: ["route_brief_input_slices"],
  route_brief_metrics: ["studio_route_scorecards"],
  route_slices: ["route_brief_input_slices"],
  "route brief artifacts": ["generated_route_briefs"],
  "route brief input slices": ["route_brief_input_slices"],
  "route brief metrics": ["studio_route_scorecards"],
  "D1 serving export": ["d1_serving_export_artifacts"],
  "route-slices": ["route_brief_input_slices"],
  promoted_findings: ["detector_review_promotion_artifacts"],
  "promoted findings": ["detector_review_promotion_artifacts"],
};

export const DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS: readonly string[] = [
  "bus lane geometry",
  "Cloudflare R2 raw bucket",
  "context source products",
  "corridor intervention context",
  "current route shape snapshots",
  "detector candidates",
  "detector score vectors",
  "document-discovery-normalized-candidates-canonical-v1",
  "generated corridor briefs",
  "LLM OCR runs",
  "local_context_event",
  "local_corridor",
  "local_corridor_intervention_context",
  "local_corridor_route_member",
  "local_gtfs_rt_trip_update",
  "local_gtfs_rt_vehicle_position",
  "local_parking_violation_match",
  "local_route_hotspot",
  "local_route_lion_link",
  "MTA Bus Time GTFS-RT vehicle positions",
  "older OCR Markdown corpus",
  "R2 GTFS-RT raw snapshots",
  "rendered per-page PNGs",
  "reviewer decision expansion",
  "reviewer decisions",
  "route geometry",
  "segment speed artifacts",
  "selected Tier 2 docs run artifacts",
  "source event registries",
  "source metadata captures",
  "speed_pace score vectors",
  "Tier 2 source registry/backlog",
  "Worker GTFS-RT manifests",
];

const DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REF_SET = new Set(
  DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS,
);

export function resolveDataProductRequiredInput(
  requiredInput: string,
  productIds: ReadonlySet<string>,
): DataProductRequiredInputResolution {
  if (productIds.has(requiredInput)) {
    return { input: requiredInput, kind: "product", productIds: [requiredInput] };
  }
  if (requiredInput.startsWith("source_manifest:")) {
    return { input: requiredInput, kind: "source_manifest", productIds: [] };
  }
  if (DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REF_SET.has(requiredInput)) {
    return { input: requiredInput, kind: "external", productIds: [] };
  }

  const normalized = requiredInput.trim().toLowerCase().replaceAll(" ", "_");
  const aliases =
    DATA_PRODUCT_REQUIRED_INPUT_PRODUCT_ALIASES[requiredInput] ??
    DATA_PRODUCT_REQUIRED_INPUT_PRODUCT_ALIASES[normalized];
  const productAliases = (aliases ?? []).filter((productId) => productIds.has(productId));
  if (productAliases.length > 0) {
    return {
      input: requiredInput,
      kind: "product",
      productIds: [...new Set(productAliases)].sort(),
    };
  }
  return { input: requiredInput, kind: "unresolved", productIds: [] };
}

export function dataProductStatus(
  product: DataProduct,
  checks: readonly DataProductCheckAudit[],
): DataProductCompletenessStatus {
  if (product.lifecycle.status !== "expected") return product.lifecycle.status;
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.every((check) => check.status === "missing")) return "missing";
  if (checks.some((check) => check.status === "missing" || check.status === "partial")) {
    return "partial";
  }
  if (checks.some((check) => check.status === "stale")) return "stale";
  return "complete";
}

export function dataProductReasons(
  product: DataProduct,
  checks: readonly DataProductCheckAudit[],
): string[] {
  if (product.lifecycle.status !== "expected") {
    return product.lifecycle.reason === undefined
      ? [`lifecycle_${product.lifecycle.status}`]
      : [`lifecycle_${product.lifecycle.status}:${product.lifecycle.reason}`];
  }
  return checks.flatMap((check) => check.reasons.map((reason) => `${check.checkId}:${reason}`));
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function routeIdValue(value: unknown): string | null {
  const text = textValue(value);
  return text === null ? null : text.toUpperCase();
}

function uniqueValues<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function sortedRoutes(routes: ReadonlySet<string>): string[] {
  return [...routes].sort();
}

function valueAtJsonPath(value: unknown, path: string): unknown {
  const segments = path
    .replace(/^\$?\./, "")
    .split(".")
    .filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function dataProductScoreVectorRouteIds(
  value: unknown,
  input: { releaseMonth: string; runId: string },
): DataProductScoreVectorRouteParseResult {
  if (typeof value !== "object" || value === null) {
    return {
      routes: new Set(),
      duplicateRoutes: [],
      wrongMonthRoutes: [],
      wrongRunRoutes: [],
    };
  }
  const artifact = value as {
    releaseMonth?: unknown;
    scoreVectors?: { releaseMonth?: unknown };
    baselines?: { routes?: unknown };
  };
  const releaseRows = Array.isArray(artifact.scoreVectors?.releaseMonth)
    ? artifact.scoreVectors.releaseMonth
    : [];
  const baselineRows = Array.isArray(artifact.baselines?.routes) ? artifact.baselines.routes : [];
  const rows = releaseRows.length > 0 ? releaseRows : baselineRows;
  const routes = new Set<string>();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const wrongMonthRoutes = new Set<string>();
  const wrongRunRoutes = new Set<string>();
  if (textValue(artifact.releaseMonth) !== null && artifact.releaseMonth !== input.releaseMonth) {
    wrongMonthRoutes.add(`artifact:${textValue(artifact.releaseMonth)}`);
  }
  for (const row of rows) {
    if (typeof row !== "object" || row === null || !("routeId" in row)) continue;
    const routeId = routeIdValue((row as { routeId?: unknown }).routeId);
    if (routeId === null) continue;
    if (seen.has(routeId)) duplicates.add(routeId);
    seen.add(routeId);
    routes.add(routeId);
    const month = textValue((row as { month?: unknown }).month);
    if (month !== null && month !== input.releaseMonth) wrongMonthRoutes.add(`${routeId}:${month}`);
    const runId = textValue((row as { runId?: unknown }).runId);
    if (runId !== null && runId !== input.runId) wrongRunRoutes.add(`${routeId}:${runId}`);
  }
  return {
    routes,
    duplicateRoutes: sortedRoutes(duplicates),
    wrongMonthRoutes: [...wrongMonthRoutes].sort(),
    wrongRunRoutes: [...wrongRunRoutes].sort(),
  };
}

export function dataProductJsonSemanticReasons(input: {
  value: unknown;
  check: Extract<DataProductCheck, { type: "json_artifact" }>;
  releaseMonth: string;
  runId: string;
}): string[] {
  const reasons: string[] = [];
  if (input.check.validateReleaseMonth === true) {
    const month =
      textValue(valueAtJsonPath(input.value, "releaseMonth")) ??
      textValue(valueAtJsonPath(input.value, "month")) ??
      textValue(valueAtJsonPath(input.value, "requestedMonth"));
    if (month !== input.releaseMonth) reasons.push(`release_month_mismatch:${month ?? "missing"}`);
  }
  if (input.check.validateRunId === true) {
    const runId = textValue(valueAtJsonPath(input.value, "runId"));
    if (runId !== input.runId) reasons.push(`run_id_mismatch:${runId ?? "missing"}`);
  }
  for (const required of input.check.requiredJsonValues ?? []) {
    const actual = valueAtJsonPath(input.value, required.path);
    if (actual !== required.equals) {
      reasons.push(`json_value_mismatch:${required.path}`);
    }
  }
  if (input.check.semantic === "tier2_publishable_ready") {
    const publishableTotal = numberValue(valueAtJsonPath(input.value, "summary.publishableTotal"));
    const recordsWithoutReview = valueAtJsonPath(input.value, "summary.recordsWithoutReview");
    const dispositionConflicts = valueAtJsonPath(
      input.value,
      "summary.dispositionVsRecordKindConflicts",
    );
    if (publishableTotal <= 0) reasons.push("tier2_publishable_total_zero");
    if (Array.isArray(recordsWithoutReview) && recordsWithoutReview.length > 0) {
      reasons.push(`tier2_records_without_review:${recordsWithoutReview.length}`);
    }
    if (Array.isArray(dispositionConflicts) && dispositionConflicts.length > 0) {
      reasons.push(`tier2_disposition_conflicts:${dispositionConflicts.length}`);
    }
  }
  if (input.check.semantic === "mta_wiki_bridge_ready_for_review") {
    const candidateCount = numberValue(
      valueAtJsonPath(input.value, "summary.interventionCandidateRecordCount"),
    );
    const reviewGroupCount = numberValue(valueAtJsonPath(input.value, "summary.reviewGroupCount"));
    const routedGroupCount = numberValue(
      valueAtJsonPath(input.value, "summary.reviewGroupsWithRoutes"),
    );
    const promotionBlockers = valueAtJsonPath(input.value, "summary.promotionBlockers");
    if (candidateCount <= 0) reasons.push("mta_wiki_bridge_candidate_count_zero");
    if (reviewGroupCount <= 0) reasons.push("mta_wiki_bridge_review_group_count_zero");
    if (routedGroupCount <= 0) reasons.push("mta_wiki_bridge_routed_group_count_zero");
    if (!Array.isArray(promotionBlockers) || promotionBlockers.length === 0) {
      reasons.push("mta_wiki_bridge_missing_promotion_blockers");
    }
  }
  if (input.check.semantic === "tier2_full_corpus_materialized_views_ready") {
    const surfaceCount = numberValue(valueAtJsonPath(input.value, "summary.consumerSurfaceRowCount"));
    const sourceCount = numberValue(valueAtJsonPath(input.value, "summary.sourceCoverageRowCount"));
    const routeCount = numberValue(valueAtJsonPath(input.value, "summary.routeEvidenceBundleCount"));
    const featureRowCount = numberValue(valueAtJsonPath(input.value, "summary.detectorFeatureRowCount"));
    if (surfaceCount < 50_000) {
      reasons.push(`tier2_full_corpus_materialized_surface_count_low:${surfaceCount}`);
    }
    if (sourceCount < 250) {
      reasons.push(`tier2_full_corpus_materialized_source_count_low:${sourceCount}`);
    }
    if (routeCount < 200) {
      reasons.push(`tier2_full_corpus_materialized_route_count_low:${routeCount}`);
    }
    if (featureRowCount < 50_000) {
      reasons.push(`tier2_full_corpus_materialized_feature_count_low:${featureRowCount}`);
    }
  }
  if (input.check.semantic === "tier2_source_disposition_queue_ready") {
    const sourceCount = numberValue(valueAtJsonPath(input.value, "summary.sourceCount"));
    const reviewQueueItemCount = numberValue(valueAtJsonPath(input.value, "summary.reviewQueueItemCount"));
    const recordCandidateReviewCount = numberValue(
      valueAtJsonPath(input.value, "summary.recordCandidateReviewCount"),
    );
    const reviewReceiptMissingCount = numberValue(
      valueAtJsonPath(input.value, "summary.reviewReceiptMissingCount"),
    );
    const promotionBlockers = valueAtJsonPath(input.value, "summary.promotionBlockers");
    if (sourceCount < 250) reasons.push(`tier2_source_disposition_source_count_low:${sourceCount}`);
    if (reviewQueueItemCount !== sourceCount) {
      reasons.push(`tier2_source_disposition_queue_count_mismatch:${reviewQueueItemCount}/${sourceCount}`);
    }
    if (recordCandidateReviewCount <= 0) {
      reasons.push("tier2_source_disposition_record_candidate_count_zero");
    }
    if (reviewReceiptMissingCount !== sourceCount) {
      reasons.push(
        `tier2_source_disposition_review_receipts_not_explicitly_missing:${reviewReceiptMissingCount}/${sourceCount}`,
      );
    }
    if (!Array.isArray(promotionBlockers) || promotionBlockers.length === 0) {
      reasons.push("tier2_source_disposition_missing_promotion_blockers");
    }
  }
  if (input.check.semantic === "tier2_source_receipt_closure_ready") {
    const queueSourceCount = numberValue(valueAtJsonPath(input.value, "summary.queueSourceCount"));
    const closedSourceCount = numberValue(valueAtJsonPath(input.value, "summary.closedSourceCount"));
    const openSourceCount = numberValue(valueAtJsonPath(input.value, "summary.openSourceCount"));
    const conflictSourceCount = numberValue(valueAtJsonPath(input.value, "summary.conflictSourceCount"));
    const invalidReviewedRecordCount = numberValue(
      valueAtJsonPath(input.value, "summary.invalidReviewedRecordCount"),
    );
    const invalidDispositionReceiptCount = numberValue(
      valueAtJsonPath(input.value, "summary.invalidDispositionReceiptCount"),
    );
    const orphanReviewedRecordSourceCount = numberValue(
      valueAtJsonPath(input.value, "summary.orphanReviewedRecordSourceCount"),
    );
    const orphanDispositionReceiptCount = numberValue(
      valueAtJsonPath(input.value, "summary.orphanDispositionReceiptCount"),
    );
    const closureStatus = textValue(
      valueAtJsonPath(input.value, "summary.sourceReceiptClosureStatus"),
    );
    if (queueSourceCount < 250) {
      reasons.push(`tier2_source_receipt_queue_source_count_low:${queueSourceCount}`);
    }
    if (closureStatus !== "complete") {
      reasons.push(`tier2_source_receipt_closure_status:${closureStatus ?? "missing"}`);
    }
    if (closedSourceCount !== queueSourceCount) {
      reasons.push(`tier2_source_receipt_closed_count_mismatch:${closedSourceCount}/${queueSourceCount}`);
    }
    if (openSourceCount > 0) reasons.push(`tier2_source_receipt_open_sources:${openSourceCount}`);
    if (conflictSourceCount > 0) {
      reasons.push(`tier2_source_receipt_conflict_sources:${conflictSourceCount}`);
    }
    if (invalidReviewedRecordCount > 0) {
      reasons.push(`tier2_source_receipt_invalid_records:${invalidReviewedRecordCount}`);
    }
    if (invalidDispositionReceiptCount > 0) {
      reasons.push(`tier2_source_receipt_invalid_dispositions:${invalidDispositionReceiptCount}`);
    }
    if (orphanReviewedRecordSourceCount > 0) {
      reasons.push(`tier2_source_receipt_orphan_record_sources:${orphanReviewedRecordSourceCount}`);
    }
    if (orphanDispositionReceiptCount > 0) {
      reasons.push(`tier2_source_receipt_orphan_dispositions:${orphanDispositionReceiptCount}`);
    }
  }
  if (input.check.semantic === "detector_gold_set_quality") {
    const trueNegative = numberValue(valueAtJsonPath(input.value, "summary.trueNegative"));
    const falsePositive = numberValue(valueAtJsonPath(input.value, "summary.falsePositive"));
    const falseNegative = numberValue(valueAtJsonPath(input.value, "summary.falseNegative"));
    const falseNegativeDiscoveryScopeCount =
      numberValue(valueAtJsonPath(input.value, "summary.falseNegativeDiscoveryScopeCount")) ||
      (Array.isArray(valueAtJsonPath(input.value, "falseNegativeDiscoveryScopes"))
        ? (valueAtJsonPath(input.value, "falseNegativeDiscoveryScopes") as unknown[]).length
        : 0);
    const expectations = valueAtJsonPath(input.value, "expectations");
    const negativeExpectationCount = Array.isArray(expectations)
      ? expectations.filter(
          (expectation) =>
            typeof expectation === "object" &&
            expectation !== null &&
            (expectation as { shouldFlag?: unknown }).shouldFlag === false,
        ).length
      : 0;
    if (negativeExpectationCount === 0 || trueNegative + falsePositive === 0) {
      reasons.push("detector_gold_set_has_no_negative_labels");
    }
    if (falseNegative === 0 && falseNegativeDiscoveryScopeCount === 0) {
      reasons.push("detector_gold_set_has_no_false_negative_pool");
    }
  }
  return reasons;
}

function rootCauseForProduct(
  product: DataProductCompletenessProductAuditBase,
  gapClass: DataProductGapClass,
  reasons: readonly string[] = product.reasons,
): DataProductRootCause {
  return {
    productId: product.productId,
    label: product.label,
    status: product.status,
    gapClass,
    reasons: [...reasons],
  };
}

function hasReason(product: DataProductCompletenessProductAuditBase, reason: string): boolean {
  return product.reasons.some((productReason) => productReason.includes(reason));
}

function hasMissingReleaseMonth(
  product: DataProductCompletenessProductAuditBase,
  releaseMonth: string,
): boolean {
  return product.checks.some((check) => check.sampleMissing.includes(releaseMonth));
}

function hasSourceManifestInput(product: DataProductCompletenessProductAuditBase): boolean {
  return product.requiredInputs.some((requiredInput) =>
    requiredInput.startsWith("source_manifest:"),
  );
}

function productDependsOnSpeedRelease(
  product: DataProductCompletenessProductAuditBase,
  routeUniverses: DataProductCompletenessRouteUniverseSets,
): boolean {
  const expectedRoutes = product.expectedUniverse.routes;
  return (
    expectedRoutes !== undefined &&
    SPEED_RELEASE_ROUTE_UNIVERSES.has(expectedRoutes) &&
    routeUniverses.speed_source_routes.size === 0
  );
}

function directGapClassification(
  input: ClassifyDataProductCompletenessInput & {
    product: DataProductCompletenessProductAuditBase;
  },
): DataProductGapClassification {
  const { product } = input;
  if (product.status === "complete") {
    return { gapClass: "none", gapClasses: ["none"], rootCauses: [] };
  }
  if (product.status === "waived") {
    return {
      gapClass: "waived",
      gapClasses: ["waived"],
      rootCauses: [rootCauseForProduct(product, "waived")],
    };
  }
  if (product.status === "fetching") {
    return {
      gapClass: "fetching",
      gapClasses: ["fetching"],
      rootCauses: [rootCauseForProduct(product, "fetching")],
    };
  }
  if (product.status === "stale") {
    return {
      gapClass: "stale",
      gapClasses: ["stale"],
      rootCauses: [rootCauseForProduct(product, "stale")],
    };
  }
  if (product.lifecycle.status === "blocked") {
    const lifecycleGapClass = product.lifecycle.gapClass ?? "planned_blocked";
    return {
      gapClass: lifecycleGapClass,
      gapClasses: [lifecycleGapClass],
      rootCauses: [rootCauseForProduct(product, lifecycleGapClass)],
    };
  }

  if (
    SPEED_RELEASE_SOURCE_PRODUCT_IDS.has(product.productId) &&
    hasMissingReleaseMonth(product, input.releaseMonth)
  ) {
    return {
      gapClass: "upstream_blocked",
      gapClasses: ["upstream_blocked"],
      rootCauses: [
        rootCauseForProduct(product, "upstream_blocked", [
          ...product.reasons,
          `release_month_source_unavailable:${input.releaseMonth}`,
        ]),
      ],
    };
  }

  if (
    hasMissingReleaseMonth(product, input.releaseMonth) &&
    input.sourceHasZeroRows?.({
      productId: product.productId,
      releaseMonth: input.releaseMonth,
    }) === true
  ) {
    return {
      gapClass: "upstream_blocked",
      gapClasses: ["upstream_blocked"],
      rootCauses: [
        rootCauseForProduct(product, "upstream_blocked", [
          ...product.reasons,
          `release_month_source_zero_rows:${input.releaseMonth}`,
        ]),
      ],
    };
  }

  if (productDependsOnSpeedRelease(product, input.routeUniverses)) {
    return {
      gapClass: "derived_from_upstream_blocked",
      gapClasses: ["derived_from_upstream_blocked"],
      rootCauses: [
        rootCauseForProduct(product, "derived_from_upstream_blocked", [
          ...product.reasons,
          "speed_source_routes_empty_for_release_month",
        ]),
      ],
    };
  }

  if (product.status === "blocked" || hasReason(product, "empty_expected_route_universe")) {
    return {
      gapClass: "downstream_blocked",
      gapClasses: ["downstream_blocked"],
      rootCauses: [rootCauseForProduct(product, "downstream_blocked")],
    };
  }

  if (DERIVED_PRODUCT_KINDS.has(product.kind)) {
    return {
      gapClass: "derived_not_built",
      gapClasses: ["derived_not_built"],
      rootCauses: [rootCauseForProduct(product, "derived_not_built")],
    };
  }

  if (hasSourceManifestInput(product) || product.kind === "local_table") {
    return {
      gapClass: "available_not_fetched",
      gapClasses: ["available_not_fetched"],
      rootCauses: [rootCauseForProduct(product, "available_not_fetched")],
    };
  }

  return {
    gapClass: "unknown",
    gapClasses: ["unknown"],
    rootCauses: [rootCauseForProduct(product, "unknown")],
  };
}

function gapClassForDependency(
  dependency: DataProductCompletenessProductAudit,
): DataProductGapClass {
  switch (dependency.gapClass) {
    case "none":
    case "waived":
      return "none";
    case "upstream_blocked":
    case "source_absent":
    case "derived_from_upstream_blocked":
      return "derived_from_upstream_blocked";
    case "available_not_fetched":
    case "derived_from_available_not_fetched":
      return "derived_from_available_not_fetched";
    case "derived_not_built":
      return "downstream_blocked";
    case "planned_blocked":
    case "downstream_blocked":
      return "downstream_blocked";
    case "fetching":
      return "fetching";
    case "stale":
      return "stale";
    case "unknown":
      return "unknown";
  }
}

function resolvedProductDependencyIds(
  requiredInputs: readonly string[],
  productById: ReadonlyMap<string, DataProductCompletenessProductAuditBase>,
): string[] {
  const resolved = new Set<string>();
  const productIds = new Set(productById.keys());
  for (const requiredInput of requiredInputs) {
    const resolution = resolveDataProductRequiredInput(requiredInput, productIds);
    for (const productId of resolution.productIds) {
      if (productById.has(productId)) resolved.add(productId);
    }
  }
  return [...resolved].sort();
}

function choosePrimaryGapClass(classes: readonly DataProductGapClass[]): DataProductGapClass {
  const classSet = new Set(classes);
  for (const candidate of GAP_CLASS_PRIORITY) {
    if (classSet.has(candidate)) return candidate;
  }
  return "unknown";
}

function dedupeRootCauses(rootCauses: readonly DataProductRootCause[]): DataProductRootCause[] {
  const seen = new Set<string>();
  const deduped: DataProductRootCause[] = [];
  for (const rootCause of rootCauses) {
    const key = `${rootCause.productId}:${rootCause.gapClass}:${rootCause.reasons.join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(rootCause);
  }
  return deduped.slice(0, 16);
}

export function classifyDataProductCompleteness(
  input: ClassifyDataProductCompletenessInput,
): DataProductCompletenessProductAudit[] {
  const productById = new Map(input.products.map((product) => [product.productId, product]));
  const cache = new Map<string, DataProductCompletenessProductAudit>();
  const visiting = new Set<string>();

  const classify = (
    product: DataProductCompletenessProductAuditBase,
  ): DataProductCompletenessProductAudit => {
    const cached = cache.get(product.productId);
    if (cached !== undefined) return cached;

    const direct = directGapClassification({ ...input, product });
    const shouldPropagateDependencyGaps =
      product.lifecycle.status === "expected" &&
      (product.status === "partial" ||
        product.status === "missing" ||
        product.status === "blocked");
    if (!shouldPropagateDependencyGaps) {
      const classified: DataProductCompletenessProductAudit = { ...product, ...direct };
      cache.set(product.productId, classified);
      return classified;
    }
    if (visiting.has(product.productId)) {
      return { ...product, ...direct };
    }

    visiting.add(product.productId);
    const dependencyClasses: DataProductGapClass[] = [];
    const dependencyRootCauses: DataProductRootCause[] = [];
    for (const dependencyId of resolvedProductDependencyIds(product.requiredInputs, productById)) {
      if (dependencyId === product.productId) continue;
      const dependencyBase = productById.get(dependencyId);
      if (dependencyBase === undefined) continue;
      const dependency = classify(dependencyBase);
      const dependencyClass = gapClassForDependency(dependency);
      if (dependencyClass === "none") continue;
      dependencyClasses.push(dependencyClass);
      dependencyRootCauses.push(
        ...(dependency.rootCauses.length > 0
          ? dependency.rootCauses
          : [rootCauseForProduct(dependency, dependency.gapClass)]),
      );
    }
    if (
      product.productId !== "local_route_segment_speed_history" &&
      productDependsOnSpeedRelease(product, input.routeUniverses)
    ) {
      const speedDependencyBase = productById.get("local_route_segment_speed_history");
      if (speedDependencyBase !== undefined) {
        const speedDependency = classify(speedDependencyBase);
        if (speedDependency.gapClass !== "none" && speedDependency.gapClass !== "waived") {
          dependencyClasses.push("derived_from_upstream_blocked");
          dependencyRootCauses.push(
            ...(speedDependency.rootCauses.length > 0
              ? speedDependency.rootCauses
              : [rootCauseForProduct(speedDependency, speedDependency.gapClass)]),
          );
        }
      }
    }
    visiting.delete(product.productId);

    const classes = uniqueValues([...direct.gapClasses, ...dependencyClasses]).filter(
      (gapClass) =>
        gapClass !== "none" || direct.gapClasses.length + dependencyClasses.length === 1,
    );
    const gapClasses: DataProductGapClass[] = classes.length === 0 ? ["none"] : classes;
    const classified: DataProductCompletenessProductAudit = {
      ...product,
      gapClass: choosePrimaryGapClass(gapClasses),
      gapClasses,
      rootCauses: dedupeRootCauses([...direct.rootCauses, ...dependencyRootCauses]),
    };
    cache.set(product.productId, classified);
    return classified;
  };

  return input.products.map((product) => classify(product));
}

export function dataProductStatusCounts(products: readonly DataProductCompletenessProductAudit[]) {
  const counts = Object.fromEntries(
    DATA_PRODUCT_COMPLETENESS_STATUS_ORDER.map((status) => [`${status}ProductCount`, 0]),
  ) as Record<`${DataProductCompletenessStatus}ProductCount`, number>;
  for (const product of products) {
    counts[`${product.status}ProductCount`] += 1;
  }
  return counts;
}

export function dataProductGapClassCounts(
  products: readonly DataProductCompletenessProductAudit[],
): Record<DataProductGapClass, number> {
  const counts = Object.fromEntries(
    DATA_PRODUCT_GAP_CLASS_ORDER.map((gapClass) => [gapClass, 0]),
  ) as Record<DataProductGapClass, number>;
  for (const product of products) {
    counts[product.gapClass] += 1;
  }
  return counts;
}

function productCoverageSummary(
  product: DataProductCompletenessProductAudit,
): DataProductCoverageProductSummary {
  return {
    productId: product.productId,
    label: product.label,
    kind: product.kind,
    status: product.status,
    gapClass: product.gapClass,
    gapClasses: product.gapClasses,
    reasons: product.reasons,
    rootCauses: product.rootCauses,
    downstreamConsumers: product.downstreamConsumers,
  };
}

function coverageBucket(
  products: readonly DataProductCompletenessProductAudit[],
  predicate: (product: DataProductCompletenessProductAudit) => boolean,
): DataProductCoverageBucket {
  const bucketProducts = products.filter(predicate).map(productCoverageSummary);
  return {
    count: bucketProducts.length,
    products: bucketProducts,
  };
}

export function dataProductCoverageSummary(
  products: readonly DataProductCompletenessProductAudit[],
): DataProductCoverageSummary {
  return {
    complete: coverageBucket(products, (product) => product.gapClass === "none"),
    needsFetch: coverageBucket(products, (product) => product.gapClass === "available_not_fetched"),
    needsBuild: coverageBucket(
      products,
      (product) =>
        product.gapClass === "derived_not_built" ||
        product.gapClass === "derived_from_available_not_fetched",
    ),
    upstreamBlocked: coverageBucket(
      products,
      (product) =>
        product.gapClass === "upstream_blocked" ||
        product.gapClass === "source_absent" ||
        product.gapClass === "derived_from_upstream_blocked",
    ),
    sourceAbsent: coverageBucket(products, (product) => product.gapClass === "source_absent"),
    downstreamBlocked: coverageBucket(
      products,
      (product) => product.gapClass === "downstream_blocked",
    ),
    plannedBlocked: coverageBucket(products, (product) => product.gapClass === "planned_blocked"),
    fetching: coverageBucket(products, (product) => product.gapClass === "fetching"),
    stale: coverageBucket(products, (product) => product.gapClass === "stale"),
    waived: coverageBucket(products, (product) => product.gapClass === "waived"),
    unknown: coverageBucket(products, (product) => product.gapClass === "unknown"),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isDataProductCompletenessStatus(value: unknown): value is DataProductCompletenessStatus {
  return DATA_PRODUCT_COMPLETENESS_STATUS_ORDER.includes(value as DataProductCompletenessStatus);
}

export function dataProductCompletenessStatusMap(
  productCompleteness: unknown | null,
): Map<string, DataProductCompletenessRef> {
  const root = asObject(productCompleteness);
  if (root === null) return new Map();
  const statuses = new Map<string, DataProductCompletenessRef>();
  for (const rawProduct of asArray(root["products"])) {
    const product = asObject(rawProduct);
    if (product === null) continue;
    const productId = textValue(product["productId"]);
    if (productId === null || !isDataProductCompletenessStatus(product["status"])) continue;
    statuses.set(productId, {
      status: product["status"],
      reasons: asArray(product["reasons"])
        .map((reason) => textValue(reason))
        .filter((reason): reason is string => reason !== null),
    });
  }
  return statuses;
}

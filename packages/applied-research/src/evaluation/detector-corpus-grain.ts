import { isAbsolute, relative } from "node:path";
import { listAnalyticsDetectors, type RegisteredAnalyticsDetector } from "@bp/analytics/registry";
import {
  dataProductCompletenessStatusMap,
  type DataProductCompletenessRef,
  type DataProductCompletenessStatus,
} from "../data-products";
import type { DetectorCorpusGrainCoverageCounts } from "../local-db";
import type { RouteMonthShadowAuditArtifact } from "./detector-shadow-audits";

type FeatureGrainKind = "detector_native" | "screening" | "source_health" | "unknown";
type GranularityRisk = "low" | "medium" | "high" | "unknown";
type GrainCheckStatus = "pass" | "warn" | "block" | "not_applicable";
type CorpusStatus =
  | "complete"
  | "partial"
  | "missing"
  | "blocked"
  | "waived"
  | "fetching"
  | "registry_only";
type ProductAuditStatus = DataProductCompletenessStatus | "not_audited";

type FeatureGrainProfile = {
  featureGrain: string;
  kind: FeatureGrainKind;
  transformIntent: string;
  granularityRisk: GranularityRisk;
  retainedAxes: readonly string[];
  collapsedAxes: readonly string[];
  productIds: readonly string[];
  notes: readonly string[];
};

type DetectorCorpusDataProduct = {
  id: string;
  label: string;
  kind: string;
  grain: string;
  lifecycle: {
    status: "expected" | "waived" | "blocked" | "fetching";
  };
};

export type DetectorCorpusDataProductManifest = {
  version: number;
  products: readonly DetectorCorpusDataProduct[];
};

export type DetectorCorpusProductRef = {
  productId: string;
  label: string;
  kind: string;
  grain: string;
  lifecycleStatus: DetectorCorpusDataProduct["lifecycle"]["status"];
  status: ProductAuditStatus;
  reasons: string[];
};

export type DetectorCorpusFeatureGrainAudit = {
  featureGrain: string;
  kind: FeatureGrainKind;
  transformIntent: string;
  granularityRisk: GranularityRisk;
  retainedAxes: string[];
  collapsedAxes: string[];
  status: CorpusStatus;
  products: DetectorCorpusProductRef[];
  notes: string[];
  reasons: string[];
};

export type DetectorCorpusCoverageSummary = {
  expectedUniverseCount: number | null;
  materializedUniverseCount: number | null;
  candidateCount: number | null;
  cleanNoHitCount: number | null;
  missingDataCount: number | null;
  outcomeCounts: {
    hit: number;
    cleanNoHit: number;
    skippedMissingInput: number;
    skippedFailedJoin: number;
    sourceLag: number;
  };
  missingReasonCounts: Record<string, number>;
};

export type DetectorRouteMonthPolicyClassification =
  | "not_used"
  | "route_level_allowed_with_shadow_audit"
  | "screening_only_requires_detector_native_followup"
  | "replace_primary_route_month_grain";

export type DetectorGrainPolicyCheck = {
  status: GrainCheckStatus;
  classification: DetectorRouteMonthPolicyClassification;
  rationale: string;
  requiredFeatureGrains: string[];
};

export type DetectorGrainReleaseCheck = {
  status: GrainCheckStatus;
  reason: string;
};

export type DetectorCorpusGrainReleaseChecks = {
  routeMonthPolicy: DetectorGrainPolicyCheck;
  executionCoverage: DetectorGrainReleaseCheck;
  cleanNoHitGrain: DetectorGrainReleaseCheck;
  scoreVectorExpectation: DetectorGrainReleaseCheck;
  falseNegativeShadowAudit: DetectorGrainReleaseCheck & { required: boolean };
  releaseGate: DetectorGrainReleaseCheck;
};

export type DetectorCorpusGrainDetectorAudit = {
  detectorId: string;
  detectorName: string;
  detectorVersion: string;
  claimTier: RegisteredAnalyticsDetector["claimTier"];
  scope: RegisteredAnalyticsDetector["scope"];
  baselineFamilies: string[];
  featureGrains: string[];
  status: CorpusStatus;
  highestGranularityRisk: GranularityRisk;
  usesScreeningFeature: boolean;
  materializedProductIds: string[];
  missingFeatureGrains: string[];
  featureGrainAudits: DetectorCorpusFeatureGrainAudit[];
  coverage: DetectorCorpusCoverageSummary;
  releaseChecks: DetectorCorpusGrainReleaseChecks;
  nextActions: string[];
};

export type DetectorCorpusGrainAudit = {
  artifactKind: "detector_corpus_grain_audit";
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  markdownPath: string;
  releaseMonth: string;
  runId: string;
  historyWindow: {
    startMonth: string;
    endMonth: string;
  };
  registryDetectorCount: number;
  dataProductManifestVersion: number;
  dataProductCompletenessPath: string | null;
  routeMonthShadowAuditPath: string | null;
  summary: {
    detectorCount: number;
    completeDetectorCount: number;
    partialDetectorCount: number;
    missingDetectorCount: number;
    blockedDetectorCount: number;
    registryOnlyDetectorCount: number;
    detectorsUsingScreeningFeatureCount: number;
    highGranularityRiskDetectorCount: number;
    missingFeatureGrainCount: number;
    coverageAuditedDetectorCount: number;
    grainPolicyWarningDetectorCount: number;
    releaseGateWarnDetectorCount: number;
    releaseGateBlockDetectorCount: number;
    falseNegativeShadowAuditRequiredDetectorCount: number;
  };
  detectors: DetectorCorpusGrainDetectorAudit[];
  featureGrains: DetectorCorpusFeatureGrainAudit[];
  dataProductsUsed: DetectorCorpusProductRef[];
  warnings: string[];
  nextActions: string[];
};

type ProductCompletenessRef = DataProductCompletenessRef;

export type BuildDetectorCorpusGrainAuditInput = {
  detectors?: readonly RegisteredAnalyticsDetector[];
  manifest: DetectorCorpusDataProductManifest;
  productCompleteness?: unknown | null;
  candidateCounts: ReadonlyMap<string, number> | null;
  coverageCounts: ReadonlyMap<string, DetectorCorpusGrainCoverageCounts> | null;
  detectorSpecificScoreVectorIds?: ReadonlySet<string>;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  markdownPath: string;
  displayRoot?: string | null;
  dataProductCompletenessPath?: string | null;
  routeMonthShadowAudit?: RouteMonthShadowAuditArtifact | null;
  routeMonthShadowAuditPath?: string | null;
};

const RISK_ORDER: readonly GranularityRisk[] = ["low", "medium", "high", "unknown"];

const FEATURE_GRAIN_PROFILES: readonly FeatureGrainProfile[] = [
  {
    featureGrain: "route_month",
    kind: "screening",
    transformIntent: "screening summary and route-level packet context",
    granularityRisk: "high",
    retainedAxes: ["route", "month", "release window", "route-level coverage"],
    collapsedAxes: [
      "segment",
      "direction",
      "stop",
      "day of week",
      "hour",
      "event timestamp",
      "distribution shape below summary metrics",
    ],
    productIds: [
      "local_route_month_coverage_release",
      "local_route_month_trends_history",
      "analytics_corpus_profile_artifact",
    ],
    notes: [
      "Good for triage and route-level context, but too coarse as the default substrate for fine-grain discovery.",
    ],
  },
  {
    featureGrain: "route_segment_month",
    kind: "detector_native",
    transformIntent: "segment-month detector input over the speed corpus",
    granularityRisk: "medium",
    retainedAxes: ["route", "month", "direction", "timepoint segment", "stop order"],
    collapsedAxes: ["hour", "day of week", "trip traversal distribution"],
    productIds: ["local_route_segment_speed_history", "studio_route_hotspot_summaries"],
    notes: [
      "This grain preserves location but can still hide time-of-day effects unless evidence links retain them.",
    ],
  },
  {
    featureGrain: "segment_daypart",
    kind: "detector_native",
    transformIntent: "typed speed feature history by segment and daypart",
    granularityRisk: "low",
    retainedAxes: ["route", "month", "direction", "segment", "daypart"],
    collapsedAxes: ["individual trip traversal", "raw hour", "day of week"],
    productIds: ["segment_daypart_history_artifact", "local_route_segment_speed_history"],
    notes: ["Detector-shaped aggregation that keeps the axes needed for pace and hotspot claims."],
  },
  {
    featureGrain: "stop_direction_hour",
    kind: "detector_native",
    transformIntent: "observed/scheduled headway feature by stop, direction, and hour",
    granularityRisk: "low",
    retainedAxes: ["route", "stop", "direction", "service date", "hour"],
    collapsedAxes: ["vehicle trace rows after headway extraction"],
    productIds: [
      "stop_direction_hour_ewt_features",
      "local_observed_headway_samples_run",
      "local_route_schedule_timepoints_release",
    ],
    notes: ["This is the right reliability discovery grain for bunching and EWT-style detectors."],
  },
  {
    featureGrain: "rider_weighted_excess_wait",
    kind: "detector_native",
    transformIntent: "stop-direction-hour reliability feature joined to rider exposure",
    granularityRisk: "low",
    retainedAxes: ["route", "stop", "direction", "service date", "hour", "ridership source"],
    collapsedAxes: ["individual riders", "vehicle trace rows after EWT extraction"],
    productIds: [
      "stop_direction_hour_ewt_features",
      "route_hourly_profile_artifact",
      "ewt_route_month_score_vectors",
    ],
    notes: ["Keeps the reliability grain fine and adds rider exposure as a typed detector input."],
  },
  {
    featureGrain: "route_reliability_month",
    kind: "detector_native",
    transformIntent: "route-month observed reliability summary",
    granularityRisk: "medium",
    retainedAxes: ["route", "month", "observed run", "sample support"],
    collapsedAxes: ["stop", "direction", "hour", "headway distribution details"],
    productIds: [
      "local_route_observed_reliability_summary_release",
      "local_route_reliability_baseline_release",
      "local_bus_wait_assessment_history",
    ],
    notes: [
      "Appropriate for route-level reliability claims; not enough for stop/hour reliability discovery without EWT features.",
    ],
  },
  {
    featureGrain: "route_direction_daypart",
    kind: "detector_native",
    transformIntent: "runtime/schedule comparison by route, direction, and daypart",
    granularityRisk: "low",
    retainedAxes: ["route", "month", "direction", "daypart"],
    collapsedAxes: ["individual trips", "stop sequence", "raw hour"],
    productIds: [
      "local_route_schedule_timepoints_release",
      "local_observed_headway_samples_run",
      "local_route_reliability_baseline_release",
    ],
    notes: [
      "Keeps direction/daypart axes for schedule mismatch and travel-time variability detectors.",
    ],
  },
  {
    featureGrain: "route_metric_history",
    kind: "detector_native",
    transformIntent: "metric history vector over a detector baseline window",
    granularityRisk: "medium",
    retainedAxes: ["scope", "metric", "month sequence", "coverage state"],
    collapsedAxes: ["within-month segment", "within-month stop", "within-month hour"],
    productIds: [
      "local_route_month_trends_history",
      "local_route_observed_reliability_summary_release",
      "local_bus_wait_assessment_history",
    ],
    notes: ["Good for trend detectors when the claim is explicitly about monthly history."],
  },
  {
    featureGrain: "intervention_window",
    kind: "detector_native",
    transformIntent: "route/event comparison window summary",
    granularityRisk: "medium",
    retainedAxes: ["route", "month", "intervention event", "window"],
    collapsedAxes: ["within-window segment", "within-window daypart", "individual observations"],
    productIds: ["local_route_intervention_comparison_history"],
    notes: [
      "Useful for cautious association screening; stronger claims should use panel/control grains.",
    ],
  },
  {
    featureGrain: "intervention_panel",
    kind: "detector_native",
    transformIntent: "intervention/control panel and effect-gate feature",
    granularityRisk: "low",
    retainedAxes: ["event", "treated scope", "control scopes", "pre/post windows", "gate statuses"],
    collapsedAxes: ["raw observations inside each modeled window"],
    productIds: ["intervention_panel_artifact", "local_route_intervention_comparison_history"],
    notes: ["Preferred substrate for event-study and intervention underperformance claims."],
  },
  {
    featureGrain: "context_source_month",
    kind: "detector_native",
    transformIntent: "context-event route-touch aggregation by source and month",
    granularityRisk: "medium",
    retainedAxes: ["route", "month", "source", "event kind", "join confidence"],
    collapsedAxes: ["individual event ids if only aggregate features are consumed"],
    productIds: [
      "local_context_event_route_touches_history",
      "local_ace_enforcement_context_history",
    ],
    notes: [
      "The upstream route-touch table is healthy because it keeps event ids and match uncertainty.",
    ],
  },
  {
    featureGrain: "source_coverage",
    kind: "source_health",
    transformIntent: "expected/observed source support and freshness by scope",
    granularityRisk: "low",
    retainedAxes: ["source", "scope kind", "scope id", "month", "freshness", "join rate"],
    collapsedAxes: ["raw source rows"],
    productIds: ["studio_route_source_status_rows", "local_route_month_coverage_release"],
    notes: [
      "A health grain; it should gate detector evidence rather than replace detector evidence.",
    ],
  },
  {
    featureGrain: "feed_health",
    kind: "source_health",
    transformIntent: "feed freshness, validator, and observed/expected record health",
    granularityRisk: "low",
    retainedAxes: ["source", "scope kind", "scope id", "month", "validator issue counts"],
    collapsedAxes: ["raw feed records"],
    productIds: ["analytics_backfill_coverage_audit", "bus_observatory_gtfs_rt_availability"],
    notes: ["A detector gate/caveat feature, not a substitute for metric evidence."],
  },
  {
    featureGrain: "positive_deviance",
    kind: "detector_native",
    transformIntent: "peer/covariate performance feature for positive outliers",
    granularityRisk: "medium",
    retainedAxes: ["scope", "metric", "peer group", "periods", "covariates"],
    collapsedAxes: ["raw peer observations", "within-period detail"],
    productIds: ["route_hourly_profile_artifact", "local_route_month_trends_history"],
    notes: [
      "Detector-native when peer support and covariates are materialized with coverage states.",
    ],
  },
];

const ROUTE_MONTH_RECLASSIFICATIONS: Record<string, Omit<DetectorGrainPolicyCheck, "status">> = {
  multi_month_speed_peer: {
    classification: "route_level_allowed_with_shadow_audit",
    rationale:
      "The claim is route-level multi-month peer comparison, so route-month can be the public claim grain, but segment/daypart shadow audits are required to catch masked localized failures.",
    requiredFeatureGrains: ["route_metric_history", "segment_daypart"],
  },
  intervention_gap: {
    classification: "screening_only_requires_detector_native_followup",
    rationale:
      "Route-month pain is useful triage for intervention gaps, but it must not be the only searched grain when segment/corridor treatments or event windows can explain missed findings.",
    requiredFeatureGrains: ["intervention_panel", "segment_daypart"],
  },
  intervention_underperformance: {
    classification: "replace_primary_route_month_grain",
    rationale:
      "Underperformance claims need intervention panels, treated/control scopes, and pre/post windows; route-month pain can remain packet context but not the primary detector substrate.",
    requiredFeatureGrains: ["intervention_panel", "route_metric_history"],
  },
  permit_correlated_slowdown: {
    classification: "replace_primary_route_month_grain",
    rationale:
      "Permit/context slowdown claims need timestamped event-route-touch windows and segment/daypart performance; monthly route counts can only screen candidates.",
    requiredFeatureGrains: ["event_route_touch_window", "segment_daypart"],
  },
  service_request_context: {
    classification: "replace_primary_route_month_grain",
    rationale:
      "311 context claims need event-window and join-confidence evidence; route-month counts are reporting-propensity context and cannot be the primary discovery grain.",
    requiredFeatureGrains: ["event_route_touch_window", "segment_daypart"],
  },
};

function displayPath(path: string, displayRoot: string | null | undefined): string {
  if (displayRoot === null || displayRoot === undefined || !isAbsolute(path)) return path;
  const relativePath = relative(displayRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function zeroCoverageCounts(): DetectorCorpusGrainCoverageCounts {
  return {
    total: 0,
    hit: 0,
    cleanNoHit: 0,
    skippedMissingInput: 0,
    skippedFailedJoin: 0,
    sourceLag: 0,
    missingReasonCounts: {},
  };
}

function profileForFeatureGrain(featureGrain: string): FeatureGrainProfile {
  const profile = FEATURE_GRAIN_PROFILES.find(
    (candidate) => candidate.featureGrain === featureGrain,
  );
  if (profile !== undefined) return profile;
  return {
    featureGrain,
    kind: "unknown",
    transformIntent: "unprofiled detector feature grain",
    granularityRisk: "unknown",
    retainedAxes: [],
    collapsedAxes: [],
    productIds: [],
    notes: [
      "This feature grain is declared by the detector registry but is not yet profiled by the corpus audit.",
    ],
  };
}

function productRefsForProfile(
  profile: FeatureGrainProfile,
  productsById: ReadonlyMap<string, DetectorCorpusDataProduct>,
  statusByProductId: ReadonlyMap<string, ProductCompletenessRef>,
): DetectorCorpusProductRef[] {
  return profile.productIds
    .map((productId) => productsById.get(productId))
    .filter((product): product is DetectorCorpusDataProduct => product !== undefined)
    .map((product) => {
      const completeness = statusByProductId.get(product.id);
      return {
        productId: product.id,
        label: product.label,
        kind: product.kind,
        grain: product.grain,
        lifecycleStatus: product.lifecycle.status,
        status: completeness?.status ?? "not_audited",
        reasons: completeness?.reasons ?? [],
      };
    });
}

function rollupFeatureStatus(products: readonly DetectorCorpusProductRef[]): CorpusStatus {
  if (products.length === 0) return "missing";
  if (products.every((product) => product.status === "not_audited")) return "registry_only";
  if (products.every((product) => product.status === "complete" || product.status === "waived")) {
    return products.every((product) => product.status === "waived") ? "waived" : "complete";
  }
  if (products.some((product) => product.status === "blocked")) return "blocked";
  if (products.every((product) => product.status === "fetching")) return "fetching";
  if (products.some((product) => product.status === "missing")) return "missing";
  return "partial";
}

function featureReasons(
  profile: FeatureGrainProfile,
  products: readonly DetectorCorpusProductRef[],
  status: CorpusStatus,
): string[] {
  const reasons: string[] = [];
  if (products.length === 0) reasons.push("no_data_product_registry_mapping");
  if (status === "registry_only") reasons.push("mapped_products_not_checked_by_completeness_audit");
  if (profile.kind === "screening") {
    reasons.push("screening_grain_collapses_detector_relevant_axes");
  }
  for (const product of products) {
    if (
      product.status !== "complete" &&
      product.status !== "waived" &&
      product.status !== "not_audited"
    ) {
      reasons.push(`${product.productId}:${product.status}`);
    }
    if (product.lifecycleStatus !== "expected") {
      reasons.push(`${product.productId}:lifecycle_${product.lifecycleStatus}`);
    }
  }
  return [...new Set(reasons)];
}

function buildFeatureGrainAudit(
  featureGrain: string,
  productsById: ReadonlyMap<string, DetectorCorpusDataProduct>,
  statusByProductId: ReadonlyMap<string, ProductCompletenessRef>,
): DetectorCorpusFeatureGrainAudit {
  const profile = profileForFeatureGrain(featureGrain);
  const products = productRefsForProfile(profile, productsById, statusByProductId);
  const status = rollupFeatureStatus(products);
  return {
    featureGrain,
    kind: profile.kind,
    transformIntent: profile.transformIntent,
    granularityRisk: profile.granularityRisk,
    retainedAxes: [...profile.retainedAxes],
    collapsedAxes: [...profile.collapsedAxes],
    status,
    products,
    notes: [...profile.notes],
    reasons: featureReasons(profile, products, status),
  };
}

function rollupDetectorStatus(features: readonly DetectorCorpusFeatureGrainAudit[]): CorpusStatus {
  if (features.length === 0) return "missing";
  if (features.some((feature) => feature.status === "blocked")) return "blocked";
  if (features.some((feature) => feature.status === "missing")) return "missing";
  if (features.some((feature) => feature.status === "partial" || feature.status === "fetching")) {
    return "partial";
  }
  if (features.every((feature) => feature.status === "registry_only")) return "registry_only";
  if (features.every((feature) => feature.status === "complete" || feature.status === "waived")) {
    return "complete";
  }
  return "partial";
}

function highestRisk(features: readonly DetectorCorpusFeatureGrainAudit[]): GranularityRisk {
  if (features.some((feature) => feature.granularityRisk === "high")) return "high";
  if (features.some((feature) => feature.granularityRisk === "medium")) return "medium";
  if (features.some((feature) => feature.granularityRisk === "unknown")) return "unknown";
  return "low";
}

function coverageSummary(
  detectorId: string,
  candidateCounts: ReadonlyMap<string, number> | null,
  coverageCounts: ReadonlyMap<string, DetectorCorpusGrainCoverageCounts> | null,
): DetectorCorpusCoverageSummary {
  const coverage = coverageCounts?.get(detectorId) ?? zeroCoverageCounts();
  const hasCoverageAudit = coverageCounts !== null && coverage.total > 0;
  const hasCandidateAudit = candidateCounts !== null;
  return {
    expectedUniverseCount: hasCoverageAudit ? coverage.total : null,
    materializedUniverseCount: hasCoverageAudit ? coverage.hit + coverage.cleanNoHit : null,
    candidateCount: hasCandidateAudit ? (candidateCounts.get(detectorId) ?? 0) : null,
    cleanNoHitCount: hasCoverageAudit ? coverage.cleanNoHit : null,
    missingDataCount: hasCoverageAudit
      ? coverage.skippedMissingInput + coverage.skippedFailedJoin + coverage.sourceLag
      : null,
    outcomeCounts: {
      hit: coverage.hit,
      cleanNoHit: coverage.cleanNoHit,
      skippedMissingInput: coverage.skippedMissingInput,
      skippedFailedJoin: coverage.skippedFailedJoin,
      sourceLag: coverage.sourceLag,
    },
    missingReasonCounts: coverage.missingReasonCounts,
  };
}

function routeMonthPolicyForDetector(
  detector: RegisteredAnalyticsDetector,
  featureAudits: readonly DetectorCorpusFeatureGrainAudit[],
): DetectorGrainPolicyCheck {
  const usesRouteMonth = featureAudits.some((feature) => feature.featureGrain === "route_month");
  if (!usesRouteMonth) {
    return {
      status: "pass",
      classification: "not_used",
      rationale: "Detector does not consume the route_month screening grain.",
      requiredFeatureGrains: [],
    };
  }
  const classification = ROUTE_MONTH_RECLASSIFICATIONS[detector.detectorId];
  if (classification === undefined) {
    return {
      status: "warn",
      classification: "screening_only_requires_detector_native_followup",
      rationale:
        "Detector consumes route_month without an explicit detector-by-detector reclassification.",
      requiredFeatureGrains: [],
    };
  }
  return {
    ...classification,
    status: "warn",
  };
}

function executionCoverageCheck(
  coverage: DetectorCorpusCoverageSummary,
): DetectorGrainReleaseCheck {
  if (coverage.expectedUniverseCount === null) {
    return {
      status: "warn",
      reason:
        "Detector has no release-month coverage rows, so hits, clean no-hits, and missing-data skips are not auditable yet.",
    };
  }
  return {
    status: "pass",
    reason: `Detector has ${coverage.expectedUniverseCount} release-month coverage row(s).`,
  };
}

function cleanNoHitGrainCheck(input: {
  coverage: DetectorCorpusCoverageSummary;
  routeMonthPolicy: DetectorGrainPolicyCheck;
}): DetectorGrainReleaseCheck {
  if (input.coverage.cleanNoHitCount === null || input.coverage.cleanNoHitCount === 0) {
    return {
      status: "not_applicable",
      reason: "No clean no-hit rows are available for this detector in the release month.",
    };
  }
  if (
    input.routeMonthPolicy.classification === "screening_only_requires_detector_native_followup" ||
    input.routeMonthPolicy.classification === "replace_primary_route_month_grain"
  ) {
    return {
      status: "warn",
      reason:
        "Clean no-hit rows were emitted from a detector that still uses route_month as a screening grain; reviewer-labeled negatives must be treated as screening-level until detector-native execution exists.",
    };
  }
  return {
    status: "pass",
    reason: "Clean no-hit rows are at an accepted detector grain for the current claim.",
  };
}

function scoreVectorExpectationCheck(input: {
  detector: RegisteredAnalyticsDetector;
  detectorSpecificScoreVectorIds: ReadonlySet<string> | undefined;
}): DetectorGrainReleaseCheck {
  if (input.detectorSpecificScoreVectorIds?.has(input.detector.detectorId)) {
    return {
      status: "pass",
      reason: "Detector-specific historical score-vector artifact exists for this detector.",
    };
  }
  const nonHealthGrains = input.detector.featureGrains.filter(
    (grain) => grain !== "feed_health" && grain !== "source_coverage",
  );
  return {
    status: "warn",
    reason: `Detector-specific historical score vectors are required at grain(s): ${
      nonHealthGrains.join(", ") || input.detector.featureGrains.join(", ")
    }. Generic release coverage vectors are not a full substitute.`,
  };
}

function routeMonthShadowForDetector(
  detectorId: string,
  artifact: RouteMonthShadowAuditArtifact | null | undefined,
): { hiddenRouteCount: number; hiddenCandidateCount: number } | null {
  if (artifact?.artifactKind !== "route_month_false_negative_shadow_audit") return null;
  const row = artifact.baselineDetectors.find((detector) => detector.detectorId === detectorId);
  if (row !== undefined) {
    return {
      hiddenRouteCount: row.hiddenRouteCount,
      hiddenCandidateCount: row.hiddenCandidateCount,
    };
  }
  if (!artifact.baselineDetectorIds.includes(detectorId)) return null;
  return {
    hiddenRouteCount: 0,
    hiddenCandidateCount: 0,
  };
}

function falseNegativeShadowAuditCheck(input: {
  detector: RegisteredAnalyticsDetector;
  featureAudits: readonly DetectorCorpusFeatureGrainAudit[];
  routeMonthPolicy: DetectorGrainPolicyCheck;
  routeMonthShadowAudit: RouteMonthShadowAuditArtifact | null | undefined;
}): DetectorCorpusGrainReleaseChecks["falseNegativeShadowAudit"] {
  const requiresShadowAudit =
    input.routeMonthPolicy.classification !== "not_used" ||
    input.featureAudits.some((feature) => feature.granularityRisk === "medium");
  if (!requiresShadowAudit) {
    return {
      required: false,
      status: "not_applicable",
      reason:
        "No richer-grain false-negative shadow audit is required by the current grain policy.",
    };
  }
  const baselineShadow = routeMonthShadowForDetector(
    input.detector.detectorId,
    input.routeMonthShadowAudit,
  );
  if (input.routeMonthPolicy.classification !== "not_used" && baselineShadow !== null) {
    return {
      required: false,
      status: "pass",
      reason: `Route-month false-negative shadow audit is present: ${baselineShadow.hiddenRouteCount} hidden route(s), ${baselineShadow.hiddenCandidateCount} hidden richer-grain candidate(s).`,
    };
  }
  return {
    required: true,
    status: "warn",
    reason:
      "A richer-grain false-negative shadow audit is required before clean no-hits or thresholds can be treated as detector-quality evidence.",
  };
}

function releaseGateCheck(input: {
  featureAudits: readonly DetectorCorpusFeatureGrainAudit[];
  routeMonthPolicy: DetectorGrainPolicyCheck;
  executionCoverage: DetectorGrainReleaseCheck;
  cleanNoHitGrain: DetectorGrainReleaseCheck;
  scoreVectorExpectation: DetectorGrainReleaseCheck;
  falseNegativeShadowAudit: DetectorCorpusGrainReleaseChecks["falseNegativeShadowAudit"];
}): DetectorGrainReleaseCheck {
  if (
    input.featureAudits.some(
      (feature) => feature.status === "blocked" || feature.status === "missing",
    )
  ) {
    return {
      status: "block",
      reason: "One or more required detector feature grains are missing or blocked.",
    };
  }
  const warningReasons = [
    input.routeMonthPolicy.status === "warn" ? input.routeMonthPolicy.rationale : null,
    input.executionCoverage.status === "warn" ? input.executionCoverage.reason : null,
    input.cleanNoHitGrain.status === "warn" ? input.cleanNoHitGrain.reason : null,
    input.scoreVectorExpectation.status === "warn" ? input.scoreVectorExpectation.reason : null,
    input.falseNegativeShadowAudit.status === "warn" ? input.falseNegativeShadowAudit.reason : null,
  ].filter((reason): reason is string => reason !== null);
  if (warningReasons.length > 0) {
    return {
      status: "warn",
      reason: warningReasons[0] ?? "Detector has grain-policy warnings.",
    };
  }
  return {
    status: "pass",
    reason: "No release-blocking corpus-grain issue found.",
  };
}

function releaseChecksForDetector(input: {
  detector: RegisteredAnalyticsDetector;
  featureAudits: readonly DetectorCorpusFeatureGrainAudit[];
  coverage: DetectorCorpusCoverageSummary;
  detectorSpecificScoreVectorIds: ReadonlySet<string> | undefined;
  routeMonthShadowAudit: RouteMonthShadowAuditArtifact | null | undefined;
}): DetectorCorpusGrainReleaseChecks {
  const routeMonthPolicy = routeMonthPolicyForDetector(input.detector, input.featureAudits);
  const executionCoverage = executionCoverageCheck(input.coverage);
  const cleanNoHitGrain = cleanNoHitGrainCheck({
    coverage: input.coverage,
    routeMonthPolicy,
  });
  const scoreVectorExpectation = scoreVectorExpectationCheck({
    detector: input.detector,
    detectorSpecificScoreVectorIds: input.detectorSpecificScoreVectorIds,
  });
  const falseNegativeShadowAudit = falseNegativeShadowAuditCheck({
    detector: input.detector,
    featureAudits: input.featureAudits,
    routeMonthPolicy,
    routeMonthShadowAudit: input.routeMonthShadowAudit,
  });
  const releaseGate = releaseGateCheck({
    featureAudits: input.featureAudits,
    routeMonthPolicy,
    executionCoverage,
    cleanNoHitGrain,
    scoreVectorExpectation,
    falseNegativeShadowAudit,
  });
  return {
    routeMonthPolicy,
    executionCoverage,
    cleanNoHitGrain,
    scoreVectorExpectation,
    falseNegativeShadowAudit,
    releaseGate,
  };
}

function nextActionsForDetector(
  detector: RegisteredAnalyticsDetector,
  featureAudits: readonly DetectorCorpusFeatureGrainAudit[],
  coverage: DetectorCorpusCoverageSummary,
  releaseChecks: DetectorCorpusGrainReleaseChecks,
): string[] {
  const actions: string[] = [];
  const missingFeatures = featureAudits.filter((feature) => feature.status === "missing");
  for (const feature of missingFeatures) {
    actions.push(
      `Map ${feature.featureGrain} to a data product or add a materialization product before treating ${detector.detectorId} as corpus-ready.`,
    );
  }
  const screeningFeatures = featureAudits.filter((feature) => feature.kind === "screening");
  for (const feature of screeningFeatures) {
    actions.push(
      `Confirm ${detector.detectorId} only needs ${feature.featureGrain}; otherwise add a finer detector-native grain so collapsed axes cannot hide findings.`,
    );
  }
  if (coverage.expectedUniverseCount === null) {
    actions.push(
      `Run detector coverage for ${detector.detectorId} in the release month so clean no-hits and missing-data skips are auditable.`,
    );
  }
  if (releaseChecks.routeMonthPolicy.status === "warn") {
    actions.push(releaseChecks.routeMonthPolicy.rationale);
  }
  if (releaseChecks.falseNegativeShadowAudit.required) {
    actions.push(releaseChecks.falseNegativeShadowAudit.reason);
  }
  if (actions.length === 0) actions.push("No phase-0 corpus-grain blocker found.");
  return [...new Set(actions)];
}

function uniqueProductRefs(
  detectors: readonly DetectorCorpusGrainDetectorAudit[],
): DetectorCorpusProductRef[] {
  const byId = new Map<string, DetectorCorpusProductRef>();
  for (const detector of detectors) {
    for (const feature of detector.featureGrainAudits) {
      for (const product of feature.products) byId.set(product.productId, product);
    }
  }
  return [...byId.values()].sort((a, b) => a.productId.localeCompare(b.productId));
}

function uniqueFeatureAudits(
  detectors: readonly DetectorCorpusGrainDetectorAudit[],
): DetectorCorpusFeatureGrainAudit[] {
  const byGrain = new Map<string, DetectorCorpusFeatureGrainAudit>();
  for (const detector of detectors) {
    for (const feature of detector.featureGrainAudits) byGrain.set(feature.featureGrain, feature);
  }
  return [...byGrain.values()].sort((a, b) => a.featureGrain.localeCompare(b.featureGrain));
}

function summaryForDetectors(detectors: readonly DetectorCorpusGrainDetectorAudit[]) {
  return {
    detectorCount: detectors.length,
    completeDetectorCount: detectors.filter((detector) => detector.status === "complete").length,
    partialDetectorCount: detectors.filter((detector) => detector.status === "partial").length,
    missingDetectorCount: detectors.filter((detector) => detector.status === "missing").length,
    blockedDetectorCount: detectors.filter((detector) => detector.status === "blocked").length,
    registryOnlyDetectorCount: detectors.filter((detector) => detector.status === "registry_only")
      .length,
    detectorsUsingScreeningFeatureCount: detectors.filter(
      (detector) => detector.usesScreeningFeature,
    ).length,
    highGranularityRiskDetectorCount: detectors.filter(
      (detector) => detector.highestGranularityRisk === "high",
    ).length,
    missingFeatureGrainCount: detectors.reduce(
      (sum, detector) => sum + detector.missingFeatureGrains.length,
      0,
    ),
    coverageAuditedDetectorCount: detectors.filter(
      (detector) => detector.coverage.expectedUniverseCount !== null,
    ).length,
    grainPolicyWarningDetectorCount: detectors.filter(
      (detector) => detector.releaseChecks.routeMonthPolicy.status === "warn",
    ).length,
    releaseGateWarnDetectorCount: detectors.filter(
      (detector) => detector.releaseChecks.releaseGate.status === "warn",
    ).length,
    releaseGateBlockDetectorCount: detectors.filter(
      (detector) => detector.releaseChecks.releaseGate.status === "block",
    ).length,
    falseNegativeShadowAuditRequiredDetectorCount: detectors.filter(
      (detector) => detector.releaseChecks.falseNegativeShadowAudit.required,
    ).length,
  };
}

function topLevelWarnings(
  candidateCounts: ReadonlyMap<string, number> | null,
  coverageCounts: ReadonlyMap<string, DetectorCorpusGrainCoverageCounts> | null,
  dataProductCompletenessPath: string | null,
): string[] {
  const warnings: string[] = [];
  if (dataProductCompletenessPath === null) {
    warnings.push(
      "No data-product completeness artifact was provided; mapped products are registry-only.",
    );
  }
  if (candidateCounts === null) {
    warnings.push("local_finding_candidate was unavailable or missing required columns.");
  }
  if (coverageCounts === null) {
    warnings.push("local_finding_coverage_audit was unavailable or missing required columns.");
  }
  return warnings;
}

function nextActionsForAudit(
  audit: Pick<DetectorCorpusGrainAudit, "summary" | "warnings">,
): string[] {
  const actions: string[] = [];
  if (audit.summary.missingFeatureGrainCount > 0) {
    actions.push("Add or map data products for detector feature grains without registry coverage.");
  }
  if (audit.summary.detectorsUsingScreeningFeatureCount > 0) {
    actions.push(
      "Review detectors that still depend on screening grains and decide whether their claim truly permits that collapse.",
    );
  }
  if (audit.summary.coverageAuditedDetectorCount < audit.summary.detectorCount) {
    actions.push(
      "Run/evaluate all registered detectors into local_finding_coverage_audit for the release month.",
    );
  }
  if (audit.summary.grainPolicyWarningDetectorCount > 0) {
    actions.push(
      "Resolve route-month grain policy warnings by moving screening detectors onto detector-native follow-up grains or documenting explicit waivers.",
    );
  }
  if (audit.summary.falseNegativeShadowAuditRequiredDetectorCount > 0) {
    actions.push(
      "Add false-negative shadow audits over richer grains before treating clean no-hits as detector-quality negatives.",
    );
  }
  if (audit.summary.releaseGateBlockDetectorCount > 0) {
    actions.push("Resolve blocked release gates before publishing detector quality claims.");
  }
  if (audit.warnings.some((warning) => warning.includes("registry-only"))) {
    actions.push(
      "Run audit data-product-completeness and pass its artifact into this command for materialization status.",
    );
  }
  return actions.length === 0 ? ["No phase-0 follow-up required."] : [...new Set(actions)];
}

export function buildDetectorCorpusGrainAudit(
  input: BuildDetectorCorpusGrainAuditInput,
): DetectorCorpusGrainAudit {
  const detectors = [...(input.detectors ?? listAnalyticsDetectors())].sort((a, b) =>
    a.detectorId.localeCompare(b.detectorId),
  );
  const productsById = new Map(input.manifest.products.map((product) => [product.id, product]));
  const statusByProductId = dataProductCompletenessStatusMap(input.productCompleteness ?? null);

  const detectorAudits: DetectorCorpusGrainDetectorAudit[] = detectors.map((detector) => {
    const featureGrainAudits = detector.featureGrains.map((featureGrain) =>
      buildFeatureGrainAudit(featureGrain, productsById, statusByProductId),
    );
    const coverage = coverageSummary(
      detector.detectorId,
      input.candidateCounts,
      input.coverageCounts,
    );
    const releaseChecks = releaseChecksForDetector({
      detector,
      featureAudits: featureGrainAudits,
      coverage,
      detectorSpecificScoreVectorIds: input.detectorSpecificScoreVectorIds,
      routeMonthShadowAudit: input.routeMonthShadowAudit,
    });
    const status = rollupDetectorStatus(featureGrainAudits);
    const materializedProductIds = [
      ...new Set(
        featureGrainAudits.flatMap((feature) =>
          feature.products
            .filter((product) => product.status === "complete" || product.status === "not_audited")
            .map((product) => product.productId),
        ),
      ),
    ].sort();
    return {
      detectorId: detector.detectorId,
      detectorName: detector.spec.name,
      detectorVersion: detector.version,
      claimTier: detector.claimTier,
      scope: detector.scope,
      baselineFamilies: [...detector.baselineFamilies],
      featureGrains: [...detector.featureGrains],
      status,
      highestGranularityRisk: highestRisk(featureGrainAudits),
      usesScreeningFeature: featureGrainAudits.some((feature) => feature.kind === "screening"),
      materializedProductIds,
      missingFeatureGrains: featureGrainAudits
        .filter((feature) => feature.status === "missing")
        .map((feature) => feature.featureGrain),
      featureGrainAudits,
      coverage,
      releaseChecks,
      nextActions: nextActionsForDetector(detector, featureGrainAudits, coverage, releaseChecks),
    };
  });

  const warnings = topLevelWarnings(
    input.candidateCounts,
    input.coverageCounts,
    input.dataProductCompletenessPath ?? null,
  );
  const summary = summaryForDetectors(detectorAudits);
  const auditWithoutActions = {
    artifactKind: "detector_corpus_grain_audit" as const,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath === null ? null : displayPath(input.dbPath, input.displayRoot),
    artifactPath: displayPath(input.artifactPath, input.displayRoot),
    markdownPath: displayPath(input.markdownPath, input.displayRoot),
    releaseMonth: input.releaseMonth,
    runId: input.runId,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    registryDetectorCount: detectors.length,
    dataProductManifestVersion: input.manifest.version,
    dataProductCompletenessPath:
      input.dataProductCompletenessPath === undefined || input.dataProductCompletenessPath === null
        ? null
        : displayPath(input.dataProductCompletenessPath, input.displayRoot),
    routeMonthShadowAuditPath:
      input.routeMonthShadowAuditPath === undefined || input.routeMonthShadowAuditPath === null
        ? null
        : displayPath(input.routeMonthShadowAuditPath, input.displayRoot),
    summary,
    detectors: detectorAudits,
    featureGrains: uniqueFeatureAudits(detectorAudits),
    dataProductsUsed: uniqueProductRefs(detectorAudits),
    warnings,
  };

  return {
    ...auditWithoutActions,
    nextActions: nextActionsForAudit(auditWithoutActions),
  };
}

function mdCell(value: string | number | null): string {
  if (value === null) return "";
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function statusCountsText(audit: DetectorCorpusGrainAudit): string {
  const entries: Array<[string, number]> = [
    ["complete", audit.summary.completeDetectorCount],
    ["partial", audit.summary.partialDetectorCount],
    ["missing", audit.summary.missingDetectorCount],
    ["blocked", audit.summary.blockedDetectorCount],
    ["registry_only", audit.summary.registryOnlyDetectorCount],
  ];
  return entries
    .map(([status, count]) => (count > 0 ? `${status}: ${count}` : null))
    .filter((item): item is string => item !== null)
    .join(", ");
}

function detectorCoverageText(coverage: DetectorCorpusCoverageSummary): string {
  if (coverage.expectedUniverseCount === null) return "not audited";
  return `${coverage.materializedUniverseCount ?? 0}/${coverage.expectedUniverseCount}`;
}

function riskSortValue(risk: GranularityRisk): number {
  const index = RISK_ORDER.indexOf(risk);
  return index === -1 ? RISK_ORDER.length : index;
}

export function renderDetectorCorpusGrainAuditMarkdown(audit: DetectorCorpusGrainAudit): string {
  const detectorRows = [...audit.detectors].sort((a, b) => {
    const riskDelta =
      riskSortValue(b.highestGranularityRisk) - riskSortValue(a.highestGranularityRisk);
    return riskDelta === 0 ? a.detectorId.localeCompare(b.detectorId) : riskDelta;
  });
  const lines: string[] = [
    "# Detector Corpus Grain Audit",
    "",
    `Generated: ${audit.generatedAt}`,
    "",
    `Window: ${audit.historyWindow.startMonth} to ${audit.historyWindow.endMonth}`,
    "",
    `Detector registry count: ${audit.registryDetectorCount}`,
    "",
    `Status: ${statusCountsText(audit) || "no detectors"}`,
    "",
    `Screening-grain detectors: ${audit.summary.detectorsUsingScreeningFeatureCount}`,
    "",
    `High granularity-risk detectors: ${audit.summary.highGranularityRiskDetectorCount}`,
    "",
    `Route-month policy warnings: ${audit.summary.grainPolicyWarningDetectorCount}`,
    "",
    `False-negative shadow audits required: ${audit.summary.falseNegativeShadowAuditRequiredDetectorCount}`,
    "",
    `Release gates: warn ${audit.summary.releaseGateWarnDetectorCount}, block ${audit.summary.releaseGateBlockDetectorCount}`,
    "",
  ];

  if (audit.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of audit.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push(
    "## Detectors",
    "",
    "| Detector | Status | Risk | Feature grains | Product refs | Coverage | Candidates | Next action |",
    "|---|---|---|---|---|---:|---:|---|",
  );
  for (const detector of detectorRows) {
    const productIds = detector.featureGrainAudits.flatMap((feature) =>
      feature.products.map((product) => product.productId),
    );
    lines.push(
      [
        mdCell(detector.detectorId),
        mdCell(detector.status),
        mdCell(detector.highestGranularityRisk),
        mdCell(detector.featureGrains.join(", ")),
        mdCell([...new Set(productIds)].join(", ")),
        mdCell(detectorCoverageText(detector.coverage)),
        mdCell(detector.coverage.candidateCount),
        mdCell(detector.nextActions[0] ?? ""),
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    );
  }
  lines.push("");

  lines.push(
    "## Release Checks",
    "",
    "| Detector | Gate | Route-month policy | Execution coverage | Clean no-hit grain | Score vectors | Shadow audit |",
    "|---|---|---|---|---|---|---|",
  );
  for (const detector of detectorRows) {
    const checks = detector.releaseChecks;
    lines.push(
      [
        mdCell(detector.detectorId),
        mdCell(checks.releaseGate.status),
        mdCell(checks.routeMonthPolicy.classification),
        mdCell(checks.executionCoverage.status),
        mdCell(checks.cleanNoHitGrain.status),
        mdCell(checks.scoreVectorExpectation.status),
        mdCell(
          checks.falseNegativeShadowAudit.required
            ? checks.falseNegativeShadowAudit.status
            : "not_required",
        ),
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    );
  }
  lines.push("");

  lines.push(
    "## Feature Grains",
    "",
    "| Feature grain | Kind | Risk | Status | Retained axes | Collapsed axes | Product refs |",
    "|---|---|---|---|---|---|---|",
  );
  for (const feature of audit.featureGrains) {
    lines.push(
      [
        mdCell(feature.featureGrain),
        mdCell(feature.kind),
        mdCell(feature.granularityRisk),
        mdCell(feature.status),
        mdCell(feature.retainedAxes.join(", ")),
        mdCell(feature.collapsedAxes.join(", ")),
        mdCell(feature.products.map((product) => product.productId).join(", ")),
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    );
  }
  lines.push("");

  lines.push("## Next Actions", "");
  for (const action of audit.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

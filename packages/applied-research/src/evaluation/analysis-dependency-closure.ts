import { listAnalyticsDetectors, type RegisteredAnalyticsDetector } from "@bp/analytics/registry";
import {
  dataProductCompletenessStatusMap,
  type DataProductCompletenessRef,
  type DataProductCompletenessStatus as CanonicalDataProductCompletenessStatus,
} from "../data-products";

export type AnalysisKind = "detector" | "causal_study" | "forecasting" | "response_drift_study";

export type AnalysisDependencyKind =
  | "source"
  | "derived_feature"
  | "score_vector"
  | "review_packet"
  | "policy"
  | "evaluation"
  | "validation_gate";

export type DataProductCompletenessStatus = CanonicalDataProductCompletenessStatus;

export type AnalysisDependencyStatus =
  | DataProductCompletenessStatus
  | "not_audited"
  | "ready"
  | "warn"
  | "fail"
  | "pass"
  | "policy_pending"
  | "no_candidates";

export type AnalysisUnitStatus =
  | "ready"
  | "partial"
  | "blocked"
  | "unmaterialized"
  | "no_candidates";

export type AnalysisDependency = {
  readonly dependencyId: string;
  readonly kind: AnalysisDependencyKind;
  readonly label: string;
  readonly required: boolean;
  readonly status: AnalysisDependencyStatus;
  readonly source: string;
  readonly reasons: readonly string[];
};

export type AnalysisUnit = {
  readonly analysisId: string;
  readonly analysisKind: AnalysisKind;
  readonly label: string;
  readonly owner: string;
  readonly status: AnalysisUnitStatus;
  readonly claimTier: string | null;
  readonly requiredGrains: readonly string[];
  readonly dependencies: readonly AnalysisDependency[];
  readonly blockerCount: number;
  readonly partialCount: number;
  readonly unmaterializedCount: number;
  readonly nextActions: readonly string[];
};

export type AnalysisDependencyClosureArtifact = {
  readonly artifactKind: "analysis_dependency_closure";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly runId: string;
  readonly artifactPath: string;
  readonly markdownPath: string;
  readonly inputArtifacts: {
    readonly dataProductCompleteness: string;
    readonly detectorReadiness: string;
    readonly detectorCorpusGrain: string;
    readonly reviewPacketCoverage: string;
    readonly detectorEvaluation: string;
    readonly forecastValidation: string;
    readonly causalValidation: string;
  };
  readonly summary: {
    readonly analysisUnitCount: number;
    readonly detectorCount: number;
    readonly causalStudyCount: number;
    readonly forecastingCount: number;
    readonly responseDriftStudyCount: number;
    readonly readyUnitCount: number;
    readonly partialUnitCount: number;
    readonly blockedUnitCount: number;
    readonly unmaterializedUnitCount: number;
    readonly noCandidateUnitCount: number;
    readonly requiredDependencyCount: number;
    readonly blockedDependencyCount: number;
    readonly partialDependencyCount: number;
    readonly unmaterializedDependencyCount: number;
  };
  readonly analysisUnits: readonly AnalysisUnit[];
  readonly warnings: readonly string[];
  readonly nextActions: readonly string[];
};

export type AnalysisDependencyDataProduct = {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
};

export type AnalysisDependencyDataProductManifest = {
  readonly products: readonly AnalysisDependencyDataProduct[];
};

type ProductCompletenessRef = DataProductCompletenessRef;

type ArtifactInputs = {
  readonly dataProductCompleteness: unknown | null;
  readonly detectorReadiness: unknown | null;
  readonly detectorCorpusGrain: unknown | null;
  readonly reviewPacketCoverage: unknown | null;
  readonly detectorEvaluation: unknown | null;
  readonly forecastValidation: unknown | null;
  readonly causalValidation: unknown | null;
};

export type BuildAnalysisDependencyClosureInput = {
  readonly detectors?: readonly RegisteredAnalyticsDetector[];
  readonly manifest: AnalysisDependencyDataProductManifest;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly artifactPath: string;
  readonly markdownPath: string;
  readonly inputArtifacts: AnalysisDependencyClosureArtifact["inputArtifacts"];
} & ArtifactInputs;

type PlannedAnalysisUnitDefinition = {
  readonly analysisId: string;
  readonly analysisKind: Exclude<AnalysisKind, "detector">;
  readonly label: string;
  readonly owner: string;
  readonly requiredGrains: readonly string[];
  readonly productIds: readonly string[];
  readonly validationGates: readonly string[];
};

const PLANNED_ANALYSIS_UNITS: readonly PlannedAnalysisUnitDefinition[] = [
  {
    analysisId: "causal_event_study_workbench",
    analysisKind: "causal_study",
    label: "Causal event-study workbench",
    owner: "packages/applied-research/causal",
    requiredGrains: ["segment-daypart-month panel", "intervention-window panel"],
    productIds: [
      "applied_research_segment_daypart_panel",
      "applied_research_pulse_candidate_set",
      "applied_research_pulse_event_overlap",
      "applied_research_event_effect_contrast",
      "applied_research_mechanism_corroboration",
      "tier2_structured_intervention_extraction_full_corpus",
    ],
    validationGates: [
      "pre_trend",
      "placebo_in_time",
      "placebo_in_space",
      "autocorrelation",
      "method_divergence",
    ],
  },
  {
    analysisId: "continuous_travel_time_forecasting",
    analysisKind: "forecasting",
    label: "Continuous travel-time forecasting",
    owner: "packages/applied-research/forecasting",
    requiredGrains: ["segment-daypart-month panel", "route-direction-daypart runtime history"],
    productIds: ["applied_research_segment_daypart_panel", "segment_daypart_history_artifact"],
    validationGates: ["rolling_backtest", "calibration_curve", "distribution_shift_monitor"],
  },
  {
    analysisId: "event_family_response_drift",
    analysisKind: "response_drift_study",
    label: "Historical event-family response drift",
    owner: "packages/applied-research/causal",
    requiredGrains: ["event-family by time-regime panel", "segment-daypart-month panel"],
    productIds: [
      "applied_research_event_family_effect_panel",
      "applied_research_event_family_response_drift_study",
      "applied_research_mechanism_corroboration",
      "tier2_structured_intervention_extraction_full_corpus",
    ],
    validationGates: ["event_family_placebos", "temporal_transportability", "regime_sensitivity"],
  },
];

function text(value: unknown): string | null {
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

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function artifactDetectorRows(artifact: unknown | null): Map<string, Record<string, unknown>> {
  const root = asObject(artifact);
  if (root === null) return new Map();
  const rows = new Map<string, Record<string, unknown>>();
  for (const rawDetector of asArray(root["detectors"])) {
    const detector = asObject(rawDetector);
    if (detector === null) continue;
    const detectorId = text(detector["detectorId"]);
    if (detectorId !== null) rows.set(detectorId, detector);
  }
  return rows;
}

function evaluationScorecardsByDetector(
  artifact: unknown | null,
): Map<string, Record<string, unknown>> {
  const root = asObject(artifact);
  if (root === null) return new Map();
  const scorecards = new Map<string, Record<string, unknown>>();
  for (const rawScorecard of asArray(root["detectorScorecards"])) {
    const scorecard = asObject(rawScorecard);
    if (scorecard === null) continue;
    const detectorId = text(scorecard["detectorId"]);
    if (detectorId !== null) scorecards.set(detectorId, scorecard);
  }
  return scorecards;
}

function validationGatesById(
  artifact: unknown | null,
  source: string,
): Map<string, Record<string, unknown>> {
  const root = asObject(artifact);
  if (root === null) return new Map();
  const rows = new Map<string, Record<string, unknown>>();
  for (const rawGate of asArray(root["gates"])) {
    const gate = asObject(rawGate);
    if (gate === null) continue;
    const gateId = text(gate["gateId"]);
    if (gateId !== null) rows.set(gateId, { ...gate, sourceArtifact: source });
  }
  return rows;
}

function productDependencyKind(
  productId: string,
  product: AnalysisDependencyDataProduct | undefined,
): AnalysisDependencyKind {
  if (productId.startsWith("tier2_")) return "source";
  if (productId.includes("score_vector") || product?.kind === "score_vector") return "score_vector";
  if (productId.includes("review") || productId.includes("promotion")) return "review_packet";
  if (product?.kind === "release_manifest" || productId.includes("audit")) return "validation_gate";
  return "derived_feature";
}

function productDependency(input: {
  readonly productId: string;
  readonly required: boolean;
  readonly productsById: ReadonlyMap<string, AnalysisDependencyDataProduct>;
  readonly productStatusById: ReadonlyMap<string, ProductCompletenessRef>;
}): AnalysisDependency {
  const product = input.productsById.get(input.productId);
  const audited = input.productStatusById.get(input.productId);
  const status =
    product === undefined ? "missing" : audited === undefined ? "not_audited" : audited.status;
  const reasons =
    product === undefined
      ? ["data_product_not_registered"]
      : audited === undefined
        ? ["data_product_completeness_not_run_or_product_not_present"]
        : audited.reasons;
  return {
    dependencyId: input.productId,
    kind: productDependencyKind(input.productId, product),
    label: product?.label ?? input.productId,
    required: input.required,
    status,
    source: "data_product_registry",
    reasons,
  };
}

function detectorProductIds(detectorRow: Record<string, unknown> | undefined): string[] {
  if (detectorRow === undefined) return [];
  const ids = new Set<string>();
  for (const rawFeature of asArray(detectorRow["featureGrainAudits"])) {
    const feature = asObject(rawFeature);
    if (feature === null) continue;
    for (const rawProduct of asArray(feature["products"])) {
      const product = asObject(rawProduct);
      const productId = text(product?.["productId"]);
      if (productId !== null) ids.add(productId);
    }
  }
  for (const rawProductId of asArray(detectorRow["materializedProductIds"])) {
    const productId = text(rawProductId);
    if (productId !== null) ids.add(productId);
  }
  return [...ids].sort();
}

function detectorUsesInterventionEvidence(detector: RegisteredAnalyticsDetector): boolean {
  return (
    detector.detectorId.includes("intervention") ||
    detector.featureGrains.some((featureGrain) => featureGrain.startsWith("intervention_"))
  );
}

function readinessDependency(input: {
  readonly detectorId: string;
  readonly readinessRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresent: boolean;
}): AnalysisDependency {
  const row = input.readinessRows.get(input.detectorId);
  const status =
    row === undefined ? (input.artifactPresent ? "missing" : "not_audited") : text(row["status"]);
  return {
    dependencyId: `${input.detectorId}:readiness_policy`,
    kind: "policy",
    label: "Detector readiness policy",
    required: true,
    status:
      status === "ready" ||
      status === "partial" ||
      status === "blocked" ||
      status === "policy_pending" ||
      status === "missing" ||
      status === "not_audited"
        ? status
        : "not_audited",
    source: "analytics-detector-readiness",
    reasons:
      row === undefined
        ? ["detector_readiness_row_missing"]
        : status === "ready"
          ? []
          : [`detector_readiness_status:${status ?? "unknown"}`],
  };
}

function grainGateDependency(input: {
  readonly detectorId: string;
  readonly grainRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresent: boolean;
}): AnalysisDependency {
  const row = input.grainRows.get(input.detectorId);
  const releaseChecks = asObject(row?.["releaseChecks"]);
  const releaseGate = asObject(releaseChecks?.["releaseGate"]);
  const gateStatus = text(releaseGate?.["status"]);
  const status =
    row === undefined
      ? input.artifactPresent
        ? "missing"
        : "not_audited"
      : gateStatus === "pass"
        ? "pass"
        : gateStatus === "warn"
          ? "warn"
          : gateStatus === "block"
            ? "blocked"
            : "not_audited";
  return {
    dependencyId: `${input.detectorId}:corpus_grain_release_gate`,
    kind: "validation_gate",
    label: "Detector corpus-grain release gate",
    required: true,
    status,
    source: "detector-corpus-grain",
    reasons:
      row === undefined
        ? ["detector_corpus_grain_row_missing"]
        : status === "pass"
          ? []
          : [
              text(releaseGate?.["reason"]) ??
                `detector_corpus_grain_gate:${gateStatus ?? "unknown"}`,
            ],
  };
}

function reviewPacketDependency(input: {
  readonly detectorId: string;
  readonly reviewRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresent: boolean;
}): AnalysisDependency {
  const row = input.reviewRows.get(input.detectorId);
  const status = text(row?.["status"]);
  const candidateCount = numberValue(row?.["candidateCount"]);
  const packetCount = numberValue(row?.["packetCount"]);
  const missingPacketCount = numberValue(row?.["missingPacketCount"]);
  let dependencyStatus: AnalysisDependencyStatus;
  if (row === undefined) {
    dependencyStatus = input.artifactPresent ? "missing" : "not_audited";
  } else if (status === "complete" || status === "partial" || status === "missing") {
    dependencyStatus = status;
  } else if (status === "no_candidates" || (candidateCount === 0 && packetCount === 0)) {
    dependencyStatus = "no_candidates";
  } else {
    dependencyStatus = "not_audited";
  }
  return {
    dependencyId: `${input.detectorId}:review_packet_coverage`,
    kind: "review_packet",
    label: "Detector review packet coverage",
    required: true,
    status: dependencyStatus,
    source: "review-packet-coverage",
    reasons:
      dependencyStatus === "complete" || dependencyStatus === "no_candidates"
        ? []
        : [
            `candidate_count:${candidateCount}`,
            `packet_count:${packetCount}`,
            `missing_packet_count:${missingPacketCount}`,
          ],
  };
}

function evaluationDependency(input: {
  readonly detectorId: string;
  readonly scorecards: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresent: boolean;
}): AnalysisDependency {
  const scorecard = input.scorecards.get(input.detectorId);
  const gatedScore = numberValue(scorecard?.["gatedScore"]);
  const recommendation = text(scorecard?.["recommendation"]);
  return {
    dependencyId: `${input.detectorId}:evaluation_scorecard`,
    kind: "evaluation",
    label: "Detector evaluation scorecard",
    required: true,
    status:
      scorecard === undefined ? (input.artifactPresent ? "missing" : "not_audited") : "complete",
    source: "detector-evaluation",
    reasons:
      scorecard === undefined
        ? ["detector_evaluation_scorecard_missing"]
        : [`gated_score:${gatedScore}`, `recommendation:${recommendation ?? "unknown"}`],
  };
}

function validationGateDependency(input: {
  readonly gateId: string;
  readonly validationGateRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresent: boolean;
}): AnalysisDependency {
  const row = input.validationGateRows.get(input.gateId);
  const status = text(row?.["status"]);
  const dependencyStatus: AnalysisDependencyStatus =
    row === undefined
      ? input.artifactPresent
        ? "missing"
        : "blocked"
      : status === "pass" || status === "warn" || status === "fail"
        ? status
        : "not_audited";
  const reasons =
    row === undefined
      ? [
          input.artifactPresent
            ? "validation_gate_row_missing"
            : "validation_gate_artifact_not_implemented_yet",
        ]
      : dependencyStatus === "pass"
        ? []
        : asArray(row["reasons"])
            .map(text)
            .filter((reason): reason is string => reason !== null);
  return {
    dependencyId: input.gateId,
    kind: "validation_gate",
    label: input.gateId.replaceAll("_", " "),
    required: true,
    status: dependencyStatus,
    source:
      row === undefined
        ? "planned_analysis_unit"
        : text(row["sourceArtifact"]) ?? "validation-gates",
    reasons:
      dependencyStatus === "pass"
        ? []
        : reasons.length > 0
          ? reasons
          : [`validation_gate_status:${dependencyStatus}`],
  };
}

function isBlockingDependency(dependency: AnalysisDependency): boolean {
  return (
    dependency.required &&
    (dependency.status === "blocked" ||
      dependency.status === "missing" ||
      dependency.status === "fail")
  );
}

function isPartialDependency(dependency: AnalysisDependency): boolean {
  return (
    dependency.required &&
    (dependency.status === "partial" ||
      dependency.status === "stale" ||
      dependency.status === "fetching" ||
      dependency.status === "warn" ||
      dependency.status === "policy_pending")
  );
}

function isUnmaterializedDependency(dependency: AnalysisDependency): boolean {
  return dependency.required && dependency.status === "not_audited";
}

function statusForDependencies(dependencies: readonly AnalysisDependency[]): AnalysisUnitStatus {
  if (dependencies.some(isBlockingDependency)) return "blocked";
  if (dependencies.some(isUnmaterializedDependency)) return "unmaterialized";
  if (dependencies.some(isPartialDependency)) return "partial";
  if (dependencies.some((dependency) => dependency.status === "no_candidates"))
    return "no_candidates";
  return "ready";
}

function nextActionsForUnit(unit: Omit<AnalysisUnit, "nextActions">): string[] {
  const actions: string[] = [];
  for (const dependency of unit.dependencies) {
    if (dependency.status === "blocked" && dependency.dependencyId.startsWith("tier2_")) {
      actions.push(
        "Finish Tier 2 structured extraction/review before treating intervention research dependencies as closed.",
      );
      continue;
    }
    if (isBlockingDependency(dependency)) {
      actions.push(`Resolve ${dependency.label}: ${dependency.reasons[0] ?? dependency.status}.`);
    } else if (isUnmaterializedDependency(dependency)) {
      actions.push(`Run or register audit output for ${dependency.label}.`);
    } else if (isPartialDependency(dependency)) {
      actions.push(
        `Complete partial dependency ${dependency.label}: ${dependency.reasons[0] ?? dependency.status}.`,
      );
    }
  }
  if (actions.length === 0 && unit.status === "no_candidates") {
    actions.push(
      "No release-month candidates exist; keep the detector in coverage audits but no packet work is required.",
    );
  }
  if (actions.length === 0) actions.push("No closure blocker found.");
  return [...new Set(actions)].slice(0, 5);
}

function buildUnit(input: {
  readonly analysisId: string;
  readonly analysisKind: AnalysisKind;
  readonly label: string;
  readonly owner: string;
  readonly claimTier: string | null;
  readonly requiredGrains: readonly string[];
  readonly dependencies: readonly AnalysisDependency[];
}): AnalysisUnit {
  const status = statusForDependencies(input.dependencies);
  const unitWithoutActions = {
    ...input,
    status,
    blockerCount: input.dependencies.filter(isBlockingDependency).length,
    partialCount: input.dependencies.filter(isPartialDependency).length,
    unmaterializedCount: input.dependencies.filter(isUnmaterializedDependency).length,
  };
  return {
    ...unitWithoutActions,
    nextActions: nextActionsForUnit(unitWithoutActions),
  };
}

function detectorUnit(input: {
  readonly detector: RegisteredAnalyticsDetector;
  readonly productsById: ReadonlyMap<string, AnalysisDependencyDataProduct>;
  readonly productStatusById: ReadonlyMap<string, ProductCompletenessRef>;
  readonly readinessRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly grainRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly reviewRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly scorecards: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresence: {
    readonly readiness: boolean;
    readonly grain: boolean;
    readonly review: boolean;
    readonly evaluation: boolean;
  };
}): AnalysisUnit {
  const grainRow = input.grainRows.get(input.detector.detectorId);
  const productIds = new Set(detectorProductIds(grainRow));
  if (detectorUsesInterventionEvidence(input.detector)) {
    productIds.add("tier2_structured_intervention_extraction_full_corpus");
  }
  const dependencies: AnalysisDependency[] = [
    ...[...productIds].sort().map((productId) =>
      productDependency({
        productId,
        required: true,
        productsById: input.productsById,
        productStatusById: input.productStatusById,
      }),
    ),
    readinessDependency({
      detectorId: input.detector.detectorId,
      readinessRows: input.readinessRows,
      artifactPresent: input.artifactPresence.readiness,
    }),
    grainGateDependency({
      detectorId: input.detector.detectorId,
      grainRows: input.grainRows,
      artifactPresent: input.artifactPresence.grain,
    }),
    reviewPacketDependency({
      detectorId: input.detector.detectorId,
      reviewRows: input.reviewRows,
      artifactPresent: input.artifactPresence.review,
    }),
    evaluationDependency({
      detectorId: input.detector.detectorId,
      scorecards: input.scorecards,
      artifactPresent: input.artifactPresence.evaluation,
    }),
  ];
  return buildUnit({
    analysisId: input.detector.detectorId,
    analysisKind: "detector",
    label: input.detector.spec.name,
    owner: "packages/analytics",
    claimTier: input.detector.claimTier,
    requiredGrains: input.detector.featureGrains,
    dependencies,
  });
}

function plannedUnit(input: {
  readonly definition: PlannedAnalysisUnitDefinition;
  readonly productsById: ReadonlyMap<string, AnalysisDependencyDataProduct>;
  readonly productStatusById: ReadonlyMap<string, ProductCompletenessRef>;
  readonly validationGateRows: ReadonlyMap<string, Record<string, unknown>>;
  readonly artifactPresence: {
    readonly forecastValidation: boolean;
  };
}): AnalysisUnit {
  const dependencies = [
    ...input.definition.productIds.map((productId) =>
      productDependency({
        productId,
        required: true,
        productsById: input.productsById,
        productStatusById: input.productStatusById,
      }),
    ),
    ...input.definition.validationGates.map((gateId) =>
      validationGateDependency({
        gateId,
        validationGateRows: input.validationGateRows,
        artifactPresent: input.artifactPresence.forecastValidation,
      }),
    ),
  ];
  return buildUnit({
    analysisId: input.definition.analysisId,
    analysisKind: input.definition.analysisKind,
    label: input.definition.label,
    owner: input.definition.owner,
    claimTier: null,
    requiredGrains: input.definition.requiredGrains,
    dependencies,
  });
}

function summaryForUnits(
  units: readonly AnalysisUnit[],
): AnalysisDependencyClosureArtifact["summary"] {
  const requiredDependencies = units.flatMap((unit) =>
    unit.dependencies.filter((dependency) => dependency.required),
  );
  return {
    analysisUnitCount: units.length,
    detectorCount: units.filter((unit) => unit.analysisKind === "detector").length,
    causalStudyCount: units.filter((unit) => unit.analysisKind === "causal_study").length,
    forecastingCount: units.filter((unit) => unit.analysisKind === "forecasting").length,
    responseDriftStudyCount: units.filter((unit) => unit.analysisKind === "response_drift_study")
      .length,
    readyUnitCount: units.filter((unit) => unit.status === "ready").length,
    partialUnitCount: units.filter((unit) => unit.status === "partial").length,
    blockedUnitCount: units.filter((unit) => unit.status === "blocked").length,
    unmaterializedUnitCount: units.filter((unit) => unit.status === "unmaterialized").length,
    noCandidateUnitCount: units.filter((unit) => unit.status === "no_candidates").length,
    requiredDependencyCount: requiredDependencies.length,
    blockedDependencyCount: requiredDependencies.filter(isBlockingDependency).length,
    partialDependencyCount: requiredDependencies.filter(isPartialDependency).length,
    unmaterializedDependencyCount: requiredDependencies.filter(isUnmaterializedDependency).length,
  };
}

function warningsForArtifacts(input: ArtifactInputs): string[] {
  const warnings: string[] = [];
  if (input.dataProductCompleteness === null)
    warnings.push("Data-product completeness artifact missing.");
  if (input.detectorReadiness === null) warnings.push("Detector readiness artifact missing.");
  if (input.detectorCorpusGrain === null)
    warnings.push("Detector corpus-grain audit artifact missing.");
  if (input.reviewPacketCoverage === null)
    warnings.push("Review-packet coverage artifact missing.");
  if (input.detectorEvaluation === null) warnings.push("Detector evaluation artifact missing.");
  if (input.forecastValidation === null)
    warnings.push("Forecast validation gates artifact missing.");
  if (input.causalValidation === null)
    warnings.push("Causal validation gates artifact missing.");
  return warnings;
}

function nextActionsForClosure(
  artifact: Pick<AnalysisDependencyClosureArtifact, "summary" | "analysisUnits" | "warnings">,
): string[] {
  const actions: string[] = [];
  if (artifact.warnings.length > 0) {
    actions.push(
      "Run the prerequisite closure inputs: data-product completeness, detector readiness, corpus-grain audit, review-packet coverage, and detector evaluation.",
    );
  }
  const tier2Blocked = artifact.analysisUnits.some((unit) =>
    unit.dependencies.some(
      (dependency) =>
        dependency.dependencyId === "tier2_structured_intervention_extraction_full_corpus" &&
        (dependency.status === "blocked" ||
          dependency.status === "missing" ||
          dependency.status === "partial"),
    ),
  );
  if (tier2Blocked) {
    actions.push(
      "Complete Tier 2 structured intervention extraction before promoting intervention/event-study closure.",
    );
  }
  if (artifact.summary.blockedUnitCount > 0) {
    actions.push(
      "Work blocked analysis units first; they represent known missing or planned-but-unbuilt dependencies.",
    );
  }
  if (artifact.summary.unmaterializedUnitCount > 0) {
    actions.push(
      "Rerun closure after materializing the upstream audits so not-audited rows become concrete statuses.",
    );
  }
  return actions.length === 0
    ? ["No analysis dependency closure follow-up required."]
    : [...new Set(actions)];
}

export function buildAnalysisDependencyClosure(
  input: BuildAnalysisDependencyClosureInput,
): AnalysisDependencyClosureArtifact {
  const detectors = [...(input.detectors ?? listAnalyticsDetectors())].sort((a, b) =>
    a.detectorId.localeCompare(b.detectorId),
  );
  const productsById = new Map(input.manifest.products.map((product) => [product.id, product]));
  const productStatusById = dataProductCompletenessStatusMap(input.dataProductCompleteness);
  const readinessRows = artifactDetectorRows(input.detectorReadiness);
  const grainRows = artifactDetectorRows(input.detectorCorpusGrain);
  const reviewRows = artifactDetectorRows(input.reviewPacketCoverage);
  const scorecards = evaluationScorecardsByDetector(input.detectorEvaluation);
  const validationGateRows = new Map([
    ...validationGatesById(input.forecastValidation, "forecast-validation-gates"),
    ...validationGatesById(input.causalValidation, "causal-validation-gates"),
  ]);
  const artifactPresence = {
    readiness: input.detectorReadiness !== null,
    grain: input.detectorCorpusGrain !== null,
    review: input.reviewPacketCoverage !== null,
    evaluation: input.detectorEvaluation !== null,
    forecastValidation: input.forecastValidation !== null,
    causalValidation: input.causalValidation !== null,
  };

  const detectorUnits = detectors.map((detector) =>
    detectorUnit({
      detector,
      productsById,
      productStatusById,
      readinessRows,
      grainRows,
      reviewRows,
      scorecards,
      artifactPresence,
    }),
  );
  const plannedUnits = PLANNED_ANALYSIS_UNITS.map((definition) =>
    plannedUnit({
      definition,
      productsById,
      productStatusById,
      validationGateRows,
      artifactPresence: {
        forecastValidation:
          artifactPresence.forecastValidation || artifactPresence.causalValidation,
      },
    }),
  );
  const analysisUnits = [...detectorUnits, ...plannedUnits].sort((a, b) => {
    const kindDelta = a.analysisKind.localeCompare(b.analysisKind);
    return kindDelta === 0 ? a.analysisId.localeCompare(b.analysisId) : kindDelta;
  });
  const warnings = warningsForArtifacts(input);
  const partialArtifact = {
    artifactKind: "analysis_dependency_closure" as const,
    schemaVersion: 1 as const,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    runId: input.runId,
    artifactPath: input.artifactPath,
    markdownPath: input.markdownPath,
    inputArtifacts: input.inputArtifacts,
    summary: summaryForUnits(analysisUnits),
    analysisUnits,
    warnings,
  };
  return {
    ...partialArtifact,
    nextActions: nextActionsForClosure(partialArtifact),
  };
}

function mdCell(value: string | number | null): string {
  if (value === null) return "";
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function primaryBlockers(unit: AnalysisUnit): string {
  const blockers = unit.dependencies.filter(
    (dependency) =>
      isBlockingDependency(dependency) ||
      isPartialDependency(dependency) ||
      isUnmaterializedDependency(dependency),
  );
  if (blockers.length === 0) return "";
  return blockers
    .slice(0, 3)
    .map((dependency) => `${dependency.dependencyId}:${dependency.status}`)
    .join(", ");
}

export function renderAnalysisDependencyClosureMarkdown(
  artifact: AnalysisDependencyClosureArtifact,
): string {
  const lines: string[] = [
    "# Analysis Dependency Closure",
    "",
    `Generated: ${artifact.generatedAt}`,
    "",
    `Window: ${artifact.historyWindow.startMonth} to ${artifact.historyWindow.endMonth}`,
    "",
    `Units: ${artifact.summary.analysisUnitCount} (${artifact.summary.detectorCount} detectors, ${artifact.summary.causalStudyCount} causal, ${artifact.summary.forecastingCount} forecasting, ${artifact.summary.responseDriftStudyCount} response-drift)`,
    "",
    `Status: ready ${artifact.summary.readyUnitCount}, partial ${artifact.summary.partialUnitCount}, blocked ${artifact.summary.blockedUnitCount}, unmaterialized ${artifact.summary.unmaterializedUnitCount}, no-candidates ${artifact.summary.noCandidateUnitCount}`,
    "",
  ];

  if (artifact.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of artifact.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push(
    "## Units",
    "",
    "| Analysis | Kind | Status | Required grains | Primary blockers | Next action |",
    "|---|---|---|---|---|---|",
  );
  for (const unit of artifact.analysisUnits) {
    lines.push(
      [
        mdCell(unit.analysisId),
        mdCell(unit.analysisKind),
        mdCell(unit.status),
        mdCell(unit.requiredGrains.join(", ")),
        mdCell(primaryBlockers(unit)),
        mdCell(unit.nextActions[0] ?? ""),
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    );
  }
  lines.push("");

  lines.push("## Next Actions", "");
  for (const action of artifact.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

import type { GoldSetEvaluation } from "../calibration/gold-set.js";

export type DetectorEvaluationComponentId =
  | "precision"
  | "recall"
  | "evidence_quality"
  | "missing_data_discipline"
  | "calibration_stability"
  | "novelty"
  | "reviewer_usefulness"
  | "claim_discipline"
  | "coverage_robustness"
  | "elegance";

export type DetectorEvaluationRecommendation =
  | "promote_threshold_change"
  | "keep_current"
  | "watch"
  | "needs_feature_work"
  | "needs_evidence_packet_work"
  | "retire_candidate"
  | "block_publication";

export type DetectorEvaluationFlag =
  | "positive_only_gold_set"
  | "insufficient_labels"
  | "no_confirmed_negative_labels"
  | "holdout_unavailable"
  | "near_miss_set_unavailable"
  | "missing_data_scope_unavailable"
  | "evidence_packet_unavailable"
  | "evidence_quality_failures"
  | "claim_discipline_violation"
  | "score_vector_unavailable"
  | "grain_policy_warning"
  | "clean_no_hit_grain_review_required"
  | "false_negative_shadow_audit_unavailable"
  | "retirement_evidence_insufficient";

export type DetectorEvaluationHardGateId =
  | "unresolved_causal_language_violation"
  | "missing_data_scored_as_clean"
  | "missing_primary_evidence_schema"
  | "clean_no_hit_grain_mismatch"
  | "precision_below_auto_publish_floor"
  | "no_negative_or_near_miss_set_available"
  | "detector_readiness_not_ready";

export type DetectorEvaluationComponentScore = {
  componentId: DetectorEvaluationComponentId;
  label: string;
  weight: number;
  score: number | null;
  reason: string;
};

export type DetectorEvaluationHardGate = {
  gateId: DetectorEvaluationHardGateId;
  label: string;
  passed: boolean;
  multiplier: number;
  reason: string;
};

export type DetectorEvaluationScorecard = {
  detectorId: string;
  detectorVersion: string;
  detectorName: string;
  claimTier: string;
  components: DetectorEvaluationComponentScore[];
  hardGates: DetectorEvaluationHardGate[];
  flags: DetectorEvaluationFlag[];
  preGateScore: number | null;
  hardGateMultiplier: number;
  gatedScore: number | null;
  recommendation: DetectorEvaluationRecommendation;
};

export const DETECTOR_EVALUATION_COMPONENT_WEIGHTS = {
  precision: 180,
  recall: 90,
  evidence_quality: 140,
  missing_data_discipline: 120,
  calibration_stability: 100,
  novelty: 90,
  reviewer_usefulness: 120,
  claim_discipline: 100,
  coverage_robustness: 80,
  elegance: 80,
} as const satisfies Record<DetectorEvaluationComponentId, number>;

export const DETECTOR_EVALUATION_COMPONENT_LABELS = {
  precision: "Precision",
  recall: "Recall",
  evidence_quality: "Evidence quality",
  missing_data_discipline: "Missing-data discipline",
  calibration_stability: "Calibration stability",
  novelty: "Novelty",
  reviewer_usefulness: "Reviewer usefulness",
  claim_discipline: "Claim discipline",
  coverage_robustness: "Coverage robustness",
  elegance: "Elegance",
} as const satisfies Record<DetectorEvaluationComponentId, string>;

export function scoreFromShare(share: number | null): number | null {
  if (share === null || !Number.isFinite(share)) return null;
  return Math.max(0, Math.min(1000, Math.round(share * 1000)));
}

export function componentScore(input: {
  componentId: DetectorEvaluationComponentId;
  score: number | null;
  reason: string;
  weight?: number;
}): DetectorEvaluationComponentScore {
  const weight = input.weight ?? DETECTOR_EVALUATION_COMPONENT_WEIGHTS[input.componentId];
  const score = input.score === null ? null : Math.max(0, Math.min(1000, Math.round(input.score)));
  return {
    componentId: input.componentId,
    label: DETECTOR_EVALUATION_COMPONENT_LABELS[input.componentId],
    weight,
    score,
    reason: input.reason,
  };
}

export function weightedMeanScore(
  components: readonly DetectorEvaluationComponentScore[],
): number | null {
  let weightedScore = 0;
  let totalWeight = 0;
  for (const component of components) {
    if (component.score === null || component.weight <= 0) continue;
    weightedScore += component.score * component.weight;
    totalWeight += component.weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((weightedScore / totalWeight) * 10) / 10;
}

export function combineHardGateMultipliers(
  hardGates: readonly DetectorEvaluationHardGate[],
): number {
  const multiplier = hardGates.reduce(
    (value, gate) => value * (gate.passed ? 1 : gate.multiplier),
    1,
  );
  return Math.round(Math.max(0, Math.min(1, multiplier)) * 1000) / 1000;
}

function uniqueFlags(flags: readonly DetectorEvaluationFlag[]): DetectorEvaluationFlag[] {
  return [...new Set(flags)].sort();
}

function componentValue(
  components: readonly DetectorEvaluationComponentScore[],
  componentId: DetectorEvaluationComponentId,
): number | null {
  return components.find((component) => component.componentId === componentId)?.score ?? null;
}

export function recommendDetectorEvaluation(input: {
  components: readonly DetectorEvaluationComponentScore[];
  hardGates: readonly DetectorEvaluationHardGate[];
  flags: readonly DetectorEvaluationFlag[];
  gatedScore: number | null;
  reviewedLabelCount: number;
}): DetectorEvaluationRecommendation {
  if (input.hardGates.some((gate) => !gate.passed && gate.multiplier === 0)) {
    return "block_publication";
  }
  if (
    input.flags.includes("insufficient_labels") ||
    input.flags.includes("positive_only_gold_set") ||
    input.reviewedLabelCount < 20
  ) {
    return "watch";
  }

  const evidenceQuality = componentValue(input.components, "evidence_quality");
  if (evidenceQuality !== null && evidenceQuality < 500) return "needs_evidence_packet_work";

  const coverageRobustness = componentValue(input.components, "coverage_robustness");
  if (coverageRobustness !== null && coverageRobustness < 500) return "needs_feature_work";

  const precision = componentValue(input.components, "precision");
  if (precision !== null && precision < 500) return "retire_candidate";

  if (input.gatedScore !== null && input.gatedScore >= 800) return "keep_current";
  if (input.gatedScore !== null && input.gatedScore < 500) return "needs_feature_work";
  return "watch";
}

export function buildDetectorEvaluationScorecard(input: {
  detectorId: string;
  detectorVersion: string;
  detectorName: string;
  claimTier: string;
  components: readonly DetectorEvaluationComponentScore[];
  hardGates: readonly DetectorEvaluationHardGate[];
  flags?: readonly DetectorEvaluationFlag[];
  reviewedLabelCount?: number;
  recommendation?: DetectorEvaluationRecommendation;
}): DetectorEvaluationScorecard {
  const components = [...input.components];
  const hardGates = [...input.hardGates];
  const preGateScore = weightedMeanScore(components);
  const hardGateMultiplier = combineHardGateMultipliers(hardGates);
  const gatedScore =
    preGateScore === null ? null : Math.round(preGateScore * hardGateMultiplier * 10) / 10;
  const flags = uniqueFlags(input.flags ?? []);
  return {
    detectorId: input.detectorId,
    detectorVersion: input.detectorVersion,
    detectorName: input.detectorName,
    claimTier: input.claimTier,
    components,
    hardGates,
    flags,
    preGateScore,
    hardGateMultiplier,
    gatedScore,
    recommendation:
      input.recommendation ??
      recommendDetectorEvaluation({
        components,
        hardGates,
        flags,
        gatedScore,
        reviewedLabelCount: input.reviewedLabelCount ?? 0,
      }),
  };
}

export function goldSetEvaluationFlags(input: {
  evaluation: GoldSetEvaluation;
  expectationCount: number;
  nearMissCount: number;
  missingDataScopeCount: number;
  holdoutAvailable: boolean;
}): DetectorEvaluationFlag[] {
  const flags: DetectorEvaluationFlag[] = [];
  const negativeCount = input.evaluation.trueNegative + input.evaluation.falsePositive;
  const falseNegativeDiscoveryCount = input.evaluation.falseNegative;
  if (input.expectationCount === 0) flags.push("insufficient_labels");
  if (
    input.evaluation.truePositive > 0 &&
    negativeCount === 0 &&
    falseNegativeDiscoveryCount === 0
  ) {
    flags.push("positive_only_gold_set");
  }
  if (negativeCount === 0) flags.push("no_confirmed_negative_labels");
  if (input.nearMissCount === 0) flags.push("near_miss_set_unavailable");
  if (input.missingDataScopeCount === 0) flags.push("missing_data_scope_unavailable");
  if (!input.holdoutAvailable) flags.push("holdout_unavailable");
  return uniqueFlags(flags);
}

export function negativeOrNearMissHardGate(input: {
  evaluation: GoldSetEvaluation;
  nearMissCount: number;
}): DetectorEvaluationHardGate {
  const negativeCount = input.evaluation.trueNegative + input.evaluation.falsePositive;
  const passed = negativeCount > 0 || input.nearMissCount > 0;
  return {
    gateId: "no_negative_or_near_miss_set_available",
    label: "Negative or near-miss labels available",
    passed,
    multiplier: 0.8,
    reason: passed
      ? "At least one confirmed negative or near-miss scope is available."
      : "No confirmed negative or near-miss scopes are available, so perfect metrics are capped.",
  };
}

export function detectorReadinessHardGate(input: {
  readinessStatus: string | null;
}): DetectorEvaluationHardGate {
  const passed = input.readinessStatus === null || input.readinessStatus === "ready";
  return {
    gateId: "detector_readiness_not_ready",
    label: "Detector readiness",
    passed,
    multiplier: 0,
    reason: passed
      ? input.readinessStatus === null
        ? "Readiness artifact was unavailable; this gate is informational for the current slice."
        : "Detector readiness is ready."
      : `Detector readiness is ${input.readinessStatus}.`,
  };
}

// Decomposed review-priority scoring (S5.1 in docs/research/backend-goal-finish-detectors.md).
//
// The ideal-doc principle: severity != confidence, and a single detector score collapses several
// distinct review axes. This pure helper splits the review-queue sort key into review-packet fields —
// severity, evidence (source/sample sufficiency, i.e. the confidence axis), specificity (how narrowly
// scoped the claim is), and persistence (multi-period support) — plus a weighted composite
// review_priority_score. These are REVIEWER fields; the public UI keeps the simple severity/confidence
// pair. severity and confidence stay independent inputs here so a high-severity, low-confidence
// candidate sorts differently from a low-severity, high-confidence one.

export type ReviewSeverity = "info" | "low" | "medium" | "high";
export type ReviewConfidence = "insufficient" | "low" | "medium" | "high";

export type ReviewPrioritySignals = {
  readonly severity: ReviewSeverity;
  // The confidence/evidence axis: source-sufficiency + join quality, normalized 0..1.
  readonly evidenceSupport: number;
  // How narrowly scoped the claim is (segment-hour > route-month), normalized 0..1.
  readonly specificity: number;
  // Multi-period / historical support, normalized 0..1.
  readonly persistence: number;
};

export type ReviewPriorityWeights = {
  readonly severity: number;
  readonly evidence: number;
  readonly specificity: number;
  readonly persistence: number;
};

export const DEFAULT_REVIEW_PRIORITY_WEIGHTS: ReviewPriorityWeights = {
  severity: 0.4,
  evidence: 0.25,
  specificity: 0.2,
  persistence: 0.15,
};

const SEVERITY_SCORES: Record<ReviewSeverity, number> = {
  info: 10,
  low: 35,
  medium: 65,
  high: 90,
};

export type ReviewPriorityScore = {
  readonly severityScore: number;
  readonly evidenceScore: number;
  readonly specificityScore: number;
  readonly persistenceScore: number;
  readonly reviewPriorityScore: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildReviewPriorityScore(
  signals: ReviewPrioritySignals,
  weights: ReviewPriorityWeights = DEFAULT_REVIEW_PRIORITY_WEIGHTS,
): ReviewPriorityScore {
  const weightTotal =
    weights.severity + weights.evidence + weights.specificity + weights.persistence;
  if (weightTotal <= 0) throw new Error("Review-priority weights must sum to a positive value.");

  const severityScore = SEVERITY_SCORES[signals.severity];
  const evidenceScore = round2(clamp01(signals.evidenceSupport) * 100);
  const specificityScore = round2(clamp01(signals.specificity) * 100);
  const persistenceScore = round2(clamp01(signals.persistence) * 100);

  const weighted =
    weights.severity * severityScore +
    weights.evidence * evidenceScore +
    weights.specificity * specificityScore +
    weights.persistence * persistenceScore;

  return {
    severityScore,
    evidenceScore,
    specificityScore,
    persistenceScore,
    reviewPriorityScore: round2(weighted / weightTotal),
  };
}

/**
 * Comparator for ordering a review queue by decomposed priority (desc), tie-broken by severity then
 * evidence then specificity then persistence — so the queue order is reproducible and explainable from
 * the review-packet fields rather than a single opaque score.
 */
export function compareByReviewPriority(
  left: ReviewPriorityScore,
  right: ReviewPriorityScore,
): number {
  return (
    right.reviewPriorityScore - left.reviewPriorityScore ||
    right.severityScore - left.severityScore ||
    right.evidenceScore - left.evidenceScore ||
    right.specificityScore - left.specificityScore ||
    right.persistenceScore - left.persistenceScore
  );
}

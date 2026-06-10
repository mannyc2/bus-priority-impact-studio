import {
  type DetectorReadinessBucket,
  detectorScopeIdentityKey,
  emptyDetectorReadinessBucketCounts,
  sortedDetectorBucketRecord,
} from "./detector-readiness-projection";

// Reviewed-gold labels for the `intervention_event_study` detector (ADR-0018 steps 3-5).
//
// Wave 3 family adaptation (candidate-causal). Per the plan: readiness must cap at methodology review
// — there is NO `public_finding_candidate`/`route_context` bucket for effect language without human
// methodology approval. Calibration is "labeling panel quality, not effect truth". The vocabulary is
// therefore internal/methodology-review-only:
//   - `methodology_review_candidate` — all gates tested+passed; eligible for human methodology review
//   - `associational_context`        — control-eligible but not causal-gated; internal context only
//   - `needs_more_evidence`          — gates not tested / panel incomplete
//   - `suppress`                     — a gate failure (pre-trend/placebo/autocorrelation/method
//                                      divergence) or weak controls; not a usable panel
//
// The readiness projection maps every non-suppressed label to the internal `review_queue` bucket and
// never to a public bucket, and the eval carries a `publicLeakageCount: 0` invariant — effect language
// can never reach a public surface from this detector without human methodology approval.

export type InterventionEventStudyReviewedFrontendUse =
  | "methodology_review_candidate"
  | "associational_context"
  | "needs_more_evidence"
  | "suppress";

export type InterventionEventStudyCalibrationTag =
  | "candidate_causal_gates_pass"
  | "associational_only"
  | "pre_trend_failure"
  | "placebo_failure"
  | "autocorrelation_failure"
  | "method_divergence"
  | "weak_or_no_controls"
  | "effect_estimate_unstable"
  | "needs_gate_testing"
  | "never_public_without_methodology_review"
  | "not_a_usable_panel";

export type InterventionEventStudyReviewedDecision = {
  readonly detectorId: string;
  readonly scopeId: string;
  readonly routeId: string | null;
  readonly sourceQueue: "candidate_review" | "skipped_control" | "clean_no_hit_control";
  readonly expectedFrontendUse: InterventionEventStudyReviewedFrontendUse;
  readonly calibrationTags: readonly InterventionEventStudyCalibrationTag[];
  readonly reviewBatch: string;
  readonly reviewDepth: "light" | "adversarial";
  readonly reviewerConfidence: "low" | "medium" | "high";
  readonly rationale: string;
  readonly notes?: string;
  readonly reviewedEvidence?: Record<string, unknown>;
};

export type InterventionEventStudyGoldLabel = InterventionEventStudyReviewedDecision & {
  readonly labelId: string;
  readonly identityKey: string;
  readonly shouldEmitSignal: boolean;
  readonly shouldSurfaceForMethodologyReview: boolean;
  // Candidate-causal detector: a label may never reach a public surface without human methodology
  // approval, so public promotion is structurally impossible here.
  readonly shouldPromotePublic: false;
};

export type InterventionEventStudyReviewedGoldArtifact = {
  readonly artifactKind: "intervention_event_study_reviewed_gold";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly internalOnly: true;
  readonly source: {
    readonly reviewQueuePath: string;
    readonly decisionsPath: string;
  };
  readonly summary: {
    readonly labelCount: number;
    readonly methodologyReviewCandidateCount: number;
    readonly associationalContextCount: number;
    readonly needsMoreEvidenceCount: number;
    readonly suppressCount: number;
    readonly byCalibrationTag: Record<string, number>;
    readonly byReviewDepth: Record<string, number>;
  };
  readonly labels: readonly InterventionEventStudyGoldLabel[];
};

export type InterventionEventStudyCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly detectorScore?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type InterventionEventStudyCoverageLike = {
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type InterventionEventStudyReviewedGoldEvaluation = {
  readonly artifactKind: "intervention_event_study_reviewed_gold_evaluation";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly internalOnly: true;
  readonly summary: {
    readonly labelCount: number;
    readonly emittedReviewedCount: number;
    readonly methodologyReviewCandidateExpectedCount: number;
    readonly methodologyReviewCandidateSurvivedCount: number;
    readonly methodologyReviewCandidateDroppedCount: number;
    readonly suppressExpectedCount: number;
    // suppress leakage = a failed-gate / unusable panel still emitted as a scored candidate
    readonly suppressStillEmittedCount: number;
    readonly associationalOrNeedsMoreExpectedCount: number;
    readonly associationalOrNeedsMoreStillEmittedCount: number;
    readonly unreviewedEmittedCount: number;
    // structural invariant: a candidate-causal detector can never leak effect language to a public bucket
    readonly publicLeakageCount: 0;
  };
  readonly byExpectedFrontendUse: Record<
    InterventionEventStudyReviewedFrontendUse,
    { readonly expected: number; readonly emitted: number; readonly dropped: number }
  >;
  readonly byCalibrationTag: Record<
    string,
    { readonly expected: number; readonly emitted: number; readonly dropped: number }
  >;
  readonly byReviewDepth: Record<
    string,
    { readonly expected: number; readonly emitted: number; readonly dropped: number }
  >;
  readonly emittedReviewed: readonly InterventionEventStudyGoldLabel[];
  readonly droppedReviewed: readonly InterventionEventStudyGoldLabel[];
  readonly unreviewedEmittedCandidates: readonly InterventionEventStudyCandidateLike[];
};

export type InterventionEventStudyReadinessProjection = {
  readonly artifactKind: "intervention_event_study_readiness_projection";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly internalOnly: true;
  readonly summary: {
    readonly itemCount: number;
    readonly byBucket: Record<DetectorReadinessBucket, number>;
    readonly byDetector: Record<string, Record<DetectorReadinessBucket, number>>;
    readonly reviewedSuppressedCount: number;
    readonly coverageSkippedCount: number;
    readonly unreviewedSuppressedCoverageCount: number;
  };
  readonly items: readonly {
    readonly identityKey: string;
    readonly detectorId: string;
    readonly routeId: string | null;
    readonly scopeId: string;
    readonly bucket: DetectorReadinessBucket;
    readonly reviewedFrontendUse: InterventionEventStudyReviewedFrontendUse | "unreviewed";
    readonly emittedCandidate: boolean;
    readonly reasonCode: string | null;
    readonly calibrationTags: readonly InterventionEventStudyCalibrationTag[];
    readonly label: InterventionEventStudyGoldLabel | null;
    readonly candidate: InterventionEventStudyCandidateLike | null;
  }[];
};

export type BuildInterventionEventStudyReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly reviewQueuePath: string;
  readonly decisionsPath: string;
  readonly decisions: readonly InterventionEventStudyReviewedDecision[];
};

export type EvaluateInterventionEventStudyReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly gold: InterventionEventStudyReviewedGoldArtifact;
  readonly candidates: readonly InterventionEventStudyCandidateLike[];
};

export type BuildInterventionEventStudyReadinessProjectionInput =
  EvaluateInterventionEventStudyReviewedGoldInput & {
    readonly coverage: readonly InterventionEventStudyCoverageLike[];
  };

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function increment<T extends string>(map: Map<T, number>, key: T): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countRecord<T extends string>(map: Map<T, number>): Record<T, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<T, number>;
}

function emptyFrontendUseCounts(): Record<
  InterventionEventStudyReviewedFrontendUse,
  { expected: number; emitted: number; dropped: number }
> {
  return {
    methodology_review_candidate: { expected: 0, emitted: 0, dropped: 0 },
    associational_context: { expected: 0, emitted: 0, dropped: 0 },
    needs_more_evidence: { expected: 0, emitted: 0, dropped: 0 },
    suppress: { expected: 0, emitted: 0, dropped: 0 },
  };
}

function updateGroup(
  map: Map<string, { expected: number; emitted: number; dropped: number }>,
  key: string,
  emitted: boolean,
): void {
  const row = map.get(key) ?? { expected: 0, emitted: 0, dropped: 0 };
  row.expected += 1;
  if (emitted) row.emitted += 1;
  else row.dropped += 1;
  map.set(key, row);
}

function sortedGroupRecord(
  map: Map<string, { expected: number; emitted: number; dropped: number }>,
): Record<string, { expected: number; emitted: number; dropped: number }> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

// Internal/methodology-review-only: every non-suppressed label routes to the internal review_queue
// bucket; there is no public_finding_candidate or route_context outcome for this candidate-causal
// detector.
function readinessBucket(input: {
  readonly label: InterventionEventStudyGoldLabel | null;
  readonly emitted: boolean;
}): DetectorReadinessBucket {
  if (input.label === null) return input.emitted ? "review_queue" : "suppressed";
  return input.label.expectedFrontendUse === "suppress" ? "suppressed" : "review_queue";
}

export function buildInterventionEventStudyReviewedGoldArtifact(
  input: BuildInterventionEventStudyReviewedGoldInput,
): InterventionEventStudyReviewedGoldArtifact {
  const byCalibrationTag = new Map<InterventionEventStudyCalibrationTag, number>();
  const byReviewDepth = new Map<string, number>();
  const labels = input.decisions
    .map((decision): InterventionEventStudyGoldLabel => {
      const identityKey = detectorScopeIdentityKey({
        detectorId: decision.detectorId,
        scopeId: decision.scopeId,
      });
      for (const tag of decision.calibrationTags) increment(byCalibrationTag, tag);
      increment(byReviewDepth, decision.reviewDepth);
      return {
        ...decision,
        labelId: `${decision.detectorId}:${decision.scopeId}`,
        identityKey,
        shouldEmitSignal: decision.expectedFrontendUse !== "suppress",
        shouldSurfaceForMethodologyReview:
          decision.expectedFrontendUse === "methodology_review_candidate",
        shouldPromotePublic: false,
      };
    })
    .sort(
      (left, right) =>
        left.detectorId.localeCompare(right.detectorId) ||
        left.scopeId.localeCompare(right.scopeId),
    );

  return {
    artifactKind: "intervention_event_study_reviewed_gold",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
    internalOnly: true,
    source: {
      reviewQueuePath: input.reviewQueuePath,
      decisionsPath: input.decisionsPath,
    },
    summary: {
      labelCount: labels.length,
      methodologyReviewCandidateCount: labels.filter(
        (label) => label.expectedFrontendUse === "methodology_review_candidate",
      ).length,
      associationalContextCount: labels.filter(
        (label) => label.expectedFrontendUse === "associational_context",
      ).length,
      needsMoreEvidenceCount: labels.filter(
        (label) => label.expectedFrontendUse === "needs_more_evidence",
      ).length,
      suppressCount: labels.filter((label) => label.expectedFrontendUse === "suppress").length,
      byCalibrationTag: countRecord(byCalibrationTag),
      byReviewDepth: countRecord(byReviewDepth),
    },
    labels,
  };
}

export function evaluateInterventionEventStudyReviewedGold(
  input: EvaluateInterventionEventStudyReviewedGoldInput,
): InterventionEventStudyReviewedGoldEvaluation {
  const emittedKeys = new Set(
    input.candidates.flatMap((candidate) => {
      const detectorId = text(candidate.detectorId);
      const scopeId = text(candidate.scopeId);
      return detectorId === null || scopeId === null
        ? []
        : [detectorScopeIdentityKey({ detectorId, scopeId })];
    }),
  );
  const reviewedKeys = new Set(input.gold.labels.map((label) => label.identityKey));
  const emittedReviewed = input.gold.labels.filter((label) => emittedKeys.has(label.identityKey));
  const droppedReviewed = input.gold.labels.filter((label) => !emittedKeys.has(label.identityKey));
  const byExpectedFrontendUse = emptyFrontendUseCounts();
  const byCalibrationTag = new Map<
    InterventionEventStudyCalibrationTag,
    { expected: number; emitted: number; dropped: number }
  >();
  const byReviewDepth = new Map<string, { expected: number; emitted: number; dropped: number }>();

  for (const label of input.gold.labels) {
    const emitted = emittedKeys.has(label.identityKey);
    byExpectedFrontendUse[label.expectedFrontendUse].expected += 1;
    if (emitted) byExpectedFrontendUse[label.expectedFrontendUse].emitted += 1;
    else byExpectedFrontendUse[label.expectedFrontendUse].dropped += 1;
    for (const tag of label.calibrationTags) updateGroup(byCalibrationTag, tag, emitted);
    updateGroup(byReviewDepth, label.reviewDepth, emitted);
  }

  const unreviewedEmittedCandidates = input.candidates.filter((candidate) => {
    const detectorId = text(candidate.detectorId);
    const scopeId = text(candidate.scopeId);
    return detectorId === null || scopeId === null
      ? true
      : !reviewedKeys.has(detectorScopeIdentityKey({ detectorId, scopeId }));
  });
  const methodologyExpected = input.gold.labels.filter(
    (label) => label.expectedFrontendUse === "methodology_review_candidate",
  );
  const suppressExpected = input.gold.labels.filter(
    (label) => label.expectedFrontendUse === "suppress",
  );
  const associationalOrNeedsMoreExpected = input.gold.labels.filter(
    (label) =>
      label.expectedFrontendUse === "associational_context" ||
      label.expectedFrontendUse === "needs_more_evidence",
  );

  return {
    artifactKind: "intervention_event_study_reviewed_gold_evaluation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
    internalOnly: true,
    summary: {
      labelCount: input.gold.labels.length,
      emittedReviewedCount: emittedReviewed.length,
      methodologyReviewCandidateExpectedCount: methodologyExpected.length,
      methodologyReviewCandidateSurvivedCount: methodologyExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      methodologyReviewCandidateDroppedCount: methodologyExpected.filter(
        (label) => !emittedKeys.has(label.identityKey),
      ).length,
      suppressExpectedCount: suppressExpected.length,
      suppressStillEmittedCount: suppressExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      associationalOrNeedsMoreExpectedCount: associationalOrNeedsMoreExpected.length,
      associationalOrNeedsMoreStillEmittedCount: associationalOrNeedsMoreExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      unreviewedEmittedCount: unreviewedEmittedCandidates.length,
      publicLeakageCount: 0,
    },
    byExpectedFrontendUse,
    byCalibrationTag: Object.fromEntries(
      [...byCalibrationTag.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    byReviewDepth: sortedGroupRecord(byReviewDepth),
    emittedReviewed,
    droppedReviewed,
    unreviewedEmittedCandidates,
  };
}

export function buildInterventionEventStudyReadinessProjection(
  input: BuildInterventionEventStudyReadinessProjectionInput,
): InterventionEventStudyReadinessProjection {
  const candidateByKey = new Map(
    input.candidates.flatMap((candidate) => {
      const detectorId = text(candidate.detectorId);
      const scopeId = text(candidate.scopeId);
      return detectorId === null || scopeId === null
        ? []
        : [[detectorScopeIdentityKey({ detectorId, scopeId }), candidate] as const];
    }),
  );
  const coverageByKey = new Map(
    input.coverage.flatMap((coverage) => {
      const detectorId = text(coverage.detectorId);
      const scopeId = text(coverage.scopeId);
      return detectorId === null || scopeId === null
        ? []
        : [[detectorScopeIdentityKey({ detectorId, scopeId }), coverage] as const];
    }),
  );
  const labelByKey = new Map(input.gold.labels.map((label) => [label.identityKey, label] as const));
  const coverageSkippedKeys = new Set(
    input.coverage.flatMap((coverage) => {
      if (text(coverage.outcome) !== "skipped_missing_input") return [];
      const detectorId = text(coverage.detectorId);
      const scopeId = text(coverage.scopeId);
      return detectorId === null || scopeId === null
        ? []
        : [detectorScopeIdentityKey({ detectorId, scopeId })];
    }),
  );
  const keys = new Set([...labelByKey.keys(), ...candidateByKey.keys()]);
  const byBucket = emptyDetectorReadinessBucketCounts();
  const byDetector = new Map<string, Record<DetectorReadinessBucket, number>>();
  const items = [...keys].flatMap((key) => {
    const label = labelByKey.get(key) ?? null;
    const candidate = candidateByKey.get(key) ?? null;
    const detectorId = text(candidate?.detectorId) ?? label?.detectorId ?? null;
    const scopeId = text(candidate?.scopeId) ?? label?.scopeId ?? null;
    if (detectorId === null || scopeId === null) return [];
    const bucket = readinessBucket({ label, emitted: candidate !== null });
    byBucket[bucket] += 1;
    const detectorCounts = byDetector.get(detectorId) ?? emptyDetectorReadinessBucketCounts();
    detectorCounts[bucket] += 1;
    byDetector.set(detectorId, detectorCounts);
    const coverage = coverageByKey.get(key);
    return [
      {
        identityKey: key,
        detectorId,
        routeId: text(candidate?.routeId) ?? label?.routeId ?? null,
        scopeId,
        bucket,
        reviewedFrontendUse: label?.expectedFrontendUse ?? ("unreviewed" as const),
        emittedCandidate: candidate !== null,
        reasonCode: text(coverage?.reasonCode),
        calibrationTags: label?.calibrationTags ?? [],
        label,
        candidate,
      },
    ];
  });

  return {
    artifactKind: "intervention_event_study_readiness_projection",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
    internalOnly: true,
    summary: {
      itemCount: items.length,
      byBucket,
      byDetector: sortedDetectorBucketRecord(byDetector),
      reviewedSuppressedCount: input.gold.labels.filter(
        (label) => label.expectedFrontendUse === "suppress",
      ).length,
      coverageSkippedCount: coverageSkippedKeys.size,
      unreviewedSuppressedCoverageCount: [...coverageSkippedKeys].filter(
        (key) => !labelByKey.has(key),
      ).length,
    },
    items: items.sort(
      (left, right) =>
        left.bucket.localeCompare(right.bucket) ||
        left.detectorId.localeCompare(right.detectorId) ||
        left.scopeId.localeCompare(right.scopeId),
    ),
  };
}

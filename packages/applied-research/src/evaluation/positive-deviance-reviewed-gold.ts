import {
  type DetectorReadinessBucket,
  detectorScopeIdentityKey,
  emptyDetectorReadinessBucketCounts,
  sortedDetectorBucketRecord,
} from "./detector-readiness-projection";

// Reviewed-gold labels for the `positive_deviance` detector (ADR-0018 steps 3-5).
//
// Wave 4 family adaptation (see docs/research/backend-goal-finish-detectors.md #16): positive_deviance
// is a LEARNING detector, not a problem-finding detector, so the frontend-use vocabulary is INVERTED
// and INTERNAL-ONLY:
//   - `learning_candidate`  — a genuine positive deviant worth internal study (the "good" outcome)
//   - `watchlist`           — promising but needs more evidence before internal study
//   - `reviewer_only`       — surfaced to reviewers, no internal action
//   - `suppress`            — a FALSE deviant (schedule padding, data artifact, peer-construction
//                             artifact); "suppress" here means "not a real outperformer"
//
// There is deliberately NO public bucket. The readiness projection maps every non-suppressed label to
// the internal `review_queue` bucket and never to `public_finding_candidate`/`route_context`, so the
// internal-only contract is structurally enforced (the eval asserts public leakage is always 0). The
// eval reports learning-candidate survival and suppress (false-deviant) leakage, mirroring the shared
// gold/eval/projection contract while respecting the inverted semantics.

export type PositiveDevianceReviewedFrontendUse =
  | "learning_candidate"
  | "watchlist"
  | "reviewer_only"
  | "suppress";

export type PositiveDevianceCalibrationTag =
  | "true_positive_deviance"
  | "route_scope_outperformance"
  | "segment_scope_outperformance"
  | "peer_group_supported"
  | "multi_period_persistent"
  | "thin_peer_group"
  | "fragile_persistence"
  | "false_deviant_schedule_padding"
  | "false_deviant_data_artifact"
  | "peer_construction_artifact"
  | "single_period_not_persistent"
  | "not_a_best_practice_proof";

export type PositiveDevianceReviewedDecision = {
  readonly detectorId: string;
  readonly scopeId: string;
  readonly routeId: string | null;
  readonly sourceQueue: "candidate_review" | "skipped_control" | "clean_no_hit_control";
  readonly expectedFrontendUse: PositiveDevianceReviewedFrontendUse;
  readonly calibrationTags: readonly PositiveDevianceCalibrationTag[];
  readonly reviewBatch: string;
  readonly reviewDepth: "light" | "adversarial";
  readonly reviewerConfidence: "low" | "medium" | "high";
  readonly rationale: string;
  readonly notes?: string;
  readonly reviewedEvidence?: Record<string, unknown>;
};

export type PositiveDevianceGoldLabel = PositiveDevianceReviewedDecision & {
  readonly labelId: string;
  readonly identityKey: string;
  readonly shouldEmitSignal: boolean;
  readonly shouldSurfaceAsLearningCandidate: boolean;
  // Internal-only detector: a positive-deviance label may never reach a public surface.
  readonly shouldPromotePublic: false;
};

export type PositiveDevianceReviewedGoldArtifact = {
  readonly artifactKind: "positive_deviance_reviewed_gold";
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
    readonly learningCandidateCount: number;
    readonly watchlistCount: number;
    readonly reviewerOnlyCount: number;
    readonly suppressCount: number;
    readonly byCalibrationTag: Record<string, number>;
    readonly byReviewDepth: Record<string, number>;
  };
  readonly labels: readonly PositiveDevianceGoldLabel[];
};

export type PositiveDevianceCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly detectorScore?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type PositiveDevianceCoverageLike = {
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type PositiveDevianceReviewedGoldEvaluation = {
  readonly artifactKind: "positive_deviance_reviewed_gold_evaluation";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly internalOnly: true;
  readonly summary: {
    readonly labelCount: number;
    readonly emittedReviewedCount: number;
    readonly learningCandidateExpectedCount: number;
    readonly learningCandidateSurvivedCount: number;
    readonly learningCandidateDroppedCount: number;
    readonly suppressExpectedCount: number;
    // suppress leakage = false deviants still emitted as a positive-deviance signal
    readonly suppressStillEmittedCount: number;
    readonly watchlistOrReviewerExpectedCount: number;
    readonly watchlistOrReviewerStillEmittedCount: number;
    readonly unreviewedEmittedCount: number;
    // structural invariant: an internal-only detector can never leak to a public bucket
    readonly publicLeakageCount: 0;
  };
  readonly byExpectedFrontendUse: Record<
    PositiveDevianceReviewedFrontendUse,
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
  readonly emittedReviewed: readonly PositiveDevianceGoldLabel[];
  readonly droppedReviewed: readonly PositiveDevianceGoldLabel[];
  readonly unreviewedEmittedCandidates: readonly PositiveDevianceCandidateLike[];
};

export type PositiveDevianceReadinessProjection = {
  readonly artifactKind: "positive_deviance_readiness_projection";
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
    readonly reviewedFrontendUse: PositiveDevianceReviewedFrontendUse | "unreviewed";
    readonly emittedCandidate: boolean;
    readonly reasonCode: string | null;
    readonly calibrationTags: readonly PositiveDevianceCalibrationTag[];
    readonly label: PositiveDevianceGoldLabel | null;
    readonly candidate: PositiveDevianceCandidateLike | null;
  }[];
};

export type BuildPositiveDevianceReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly reviewQueuePath: string;
  readonly decisionsPath: string;
  readonly decisions: readonly PositiveDevianceReviewedDecision[];
};

export type EvaluatePositiveDevianceReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly gold: PositiveDevianceReviewedGoldArtifact;
  readonly candidates: readonly PositiveDevianceCandidateLike[];
};

export type BuildPositiveDevianceReadinessProjectionInput =
  EvaluatePositiveDevianceReviewedGoldInput & {
    readonly coverage: readonly PositiveDevianceCoverageLike[];
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
  PositiveDevianceReviewedFrontendUse,
  { expected: number; emitted: number; dropped: number }
> {
  return {
    learning_candidate: { expected: 0, emitted: 0, dropped: 0 },
    watchlist: { expected: 0, emitted: 0, dropped: 0 },
    reviewer_only: { expected: 0, emitted: 0, dropped: 0 },
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
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

// Internal-only: every non-suppressed label routes to the internal review_queue bucket; there is no
// public_finding_candidate or route_context outcome for this detector.
function readinessBucket(input: {
  readonly label: PositiveDevianceGoldLabel | null;
  readonly emitted: boolean;
}): DetectorReadinessBucket {
  if (input.label === null) return input.emitted ? "review_queue" : "suppressed";
  return input.label.expectedFrontendUse === "suppress" ? "suppressed" : "review_queue";
}

export function buildPositiveDevianceReviewedGoldArtifact(
  input: BuildPositiveDevianceReviewedGoldInput,
): PositiveDevianceReviewedGoldArtifact {
  const byCalibrationTag = new Map<PositiveDevianceCalibrationTag, number>();
  const byReviewDepth = new Map<string, number>();
  const labels = input.decisions
    .map((decision): PositiveDevianceGoldLabel => {
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
        shouldSurfaceAsLearningCandidate: decision.expectedFrontendUse === "learning_candidate",
        shouldPromotePublic: false,
      };
    })
    .sort(
      (left, right) =>
        left.detectorId.localeCompare(right.detectorId) ||
        left.scopeId.localeCompare(right.scopeId),
    );

  return {
    artifactKind: "positive_deviance_reviewed_gold",
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
      learningCandidateCount: labels.filter(
        (label) => label.expectedFrontendUse === "learning_candidate",
      ).length,
      watchlistCount: labels.filter((label) => label.expectedFrontendUse === "watchlist").length,
      reviewerOnlyCount: labels.filter((label) => label.expectedFrontendUse === "reviewer_only")
        .length,
      suppressCount: labels.filter((label) => label.expectedFrontendUse === "suppress").length,
      byCalibrationTag: countRecord(byCalibrationTag),
      byReviewDepth: countRecord(byReviewDepth),
    },
    labels,
  };
}

export function evaluatePositiveDevianceReviewedGold(
  input: EvaluatePositiveDevianceReviewedGoldInput,
): PositiveDevianceReviewedGoldEvaluation {
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
    PositiveDevianceCalibrationTag,
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
  const learningExpected = input.gold.labels.filter(
    (label) => label.expectedFrontendUse === "learning_candidate",
  );
  const suppressExpected = input.gold.labels.filter(
    (label) => label.expectedFrontendUse === "suppress",
  );
  const watchlistOrReviewerExpected = input.gold.labels.filter(
    (label) =>
      label.expectedFrontendUse === "watchlist" || label.expectedFrontendUse === "reviewer_only",
  );

  return {
    artifactKind: "positive_deviance_reviewed_gold_evaluation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
    internalOnly: true,
    summary: {
      labelCount: input.gold.labels.length,
      emittedReviewedCount: emittedReviewed.length,
      learningCandidateExpectedCount: learningExpected.length,
      learningCandidateSurvivedCount: learningExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      learningCandidateDroppedCount: learningExpected.filter(
        (label) => !emittedKeys.has(label.identityKey),
      ).length,
      suppressExpectedCount: suppressExpected.length,
      suppressStillEmittedCount: suppressExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      watchlistOrReviewerExpectedCount: watchlistOrReviewerExpected.length,
      watchlistOrReviewerStillEmittedCount: watchlistOrReviewerExpected.filter((label) =>
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

export function buildPositiveDevianceReadinessProjection(
  input: BuildPositiveDevianceReadinessProjectionInput,
): PositiveDevianceReadinessProjection {
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
    artifactKind: "positive_deviance_readiness_projection",
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

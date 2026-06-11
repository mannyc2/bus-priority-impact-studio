import {
  type DetectorReadinessBucket,
  detectorScopeIdentityKey,
  emptyDetectorReadinessBucketCounts,
  sortedDetectorBucketRecord,
} from "./detector-readiness-projection";

// Reviewed-gold labels for the `travel_time_variability` detector (ADR-0018 steps 3-5).
// Mirrors the observed-reliability gold/eval/projection contract: package-owned, deterministic, and
// fixture-testable without opening a DB. Labels carry route-direction-daypart identity, the eval
// reports suppress leakage + reviewed-primary survival, and the projection buckets cells into the
// shared readiness vocabulary.

export type TravelTimeVariabilityReviewedFrontendUse =
  | "primary_finding"
  | "route_context"
  | "reviewer_only"
  | "needs_more_evidence"
  | "suppress";

export type TravelTimeVariabilityCalibrationTag =
  | "true_travel_time_variability"
  | "route_direction_daypart_cell"
  | "runtime_sample_supported"
  | "high_buffer_index_spread"
  | "incident_driven_p95_outlier"
  | "thin_observed_trips"
  | "service_pattern_break"
  | "near_threshold"
  | "single_cell_not_route_generalizable"
  | "schedule_mismatch_confound"
  | "not_actionable_as_claim";

export type TravelTimeVariabilityReviewedDecision = {
  readonly detectorId: string;
  readonly scopeId: string;
  readonly routeId: string | null;
  readonly sourceQueue: "candidate_review" | "skipped_control" | "clean_no_hit_control";
  readonly expectedFrontendUse: TravelTimeVariabilityReviewedFrontendUse;
  readonly calibrationTags: readonly TravelTimeVariabilityCalibrationTag[];
  readonly reviewBatch: string;
  readonly reviewDepth: "light" | "adversarial";
  readonly reviewerConfidence: "low" | "medium" | "high";
  readonly rationale: string;
  readonly notes?: string;
  readonly reviewedEvidence?: Record<string, unknown>;
};

export type TravelTimeVariabilityGoldLabel = TravelTimeVariabilityReviewedDecision & {
  readonly labelId: string;
  readonly identityKey: string;
  readonly shouldEmitSignal: boolean;
  readonly shouldEmitFindingCandidate: boolean;
  readonly shouldEmitCandidate: boolean;
  readonly shouldPromotePrimary: boolean;
};

export type TravelTimeVariabilityReviewedGoldArtifact = {
  readonly artifactKind: "travel_time_variability_reviewed_gold";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly source: {
    readonly reviewQueuePath: string;
    readonly decisionsPath: string;
  };
  readonly summary: {
    readonly labelCount: number;
    readonly primaryFindingCount: number;
    readonly routeContextCount: number;
    readonly reviewerOnlyCount: number;
    readonly needsMoreEvidenceCount: number;
    readonly suppressCount: number;
    readonly byCalibrationTag: Record<string, number>;
    readonly byReviewDepth: Record<string, number>;
  };
  readonly labels: readonly TravelTimeVariabilityGoldLabel[];
};

export type TravelTimeVariabilityCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly detectorScore?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type TravelTimeVariabilityCoverageLike = {
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type TravelTimeVariabilityReviewedGoldEvaluation = {
  readonly artifactKind: "travel_time_variability_reviewed_gold_evaluation";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly summary: {
    readonly labelCount: number;
    readonly emittedReviewedCount: number;
    readonly primaryExpectedCount: number;
    readonly primarySurvivedCount: number;
    readonly primaryDroppedCount: number;
    readonly suppressExpectedCount: number;
    readonly suppressStillEmittedCount: number;
    readonly contextOrReviewerExpectedCount: number;
    readonly contextOrReviewerStillEmittedCount: number;
    readonly unreviewedEmittedCount: number;
  };
  readonly byExpectedFrontendUse: Record<
    TravelTimeVariabilityReviewedFrontendUse,
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
  readonly emittedReviewed: readonly TravelTimeVariabilityGoldLabel[];
  readonly droppedReviewed: readonly TravelTimeVariabilityGoldLabel[];
  readonly unreviewedEmittedCandidates: readonly TravelTimeVariabilityCandidateLike[];
};

export type TravelTimeVariabilityReadinessProjection = {
  readonly artifactKind: "travel_time_variability_readiness_projection";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
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
    readonly reviewedFrontendUse: TravelTimeVariabilityReviewedFrontendUse | "unreviewed";
    readonly emittedCandidate: boolean;
    readonly reasonCode: string | null;
    readonly calibrationTags: readonly TravelTimeVariabilityCalibrationTag[];
    readonly label: TravelTimeVariabilityGoldLabel | null;
    readonly candidate: TravelTimeVariabilityCandidateLike | null;
  }[];
};

export type BuildTravelTimeVariabilityReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly reviewQueuePath: string;
  readonly decisionsPath: string;
  readonly decisions: readonly TravelTimeVariabilityReviewedDecision[];
};

export type EvaluateTravelTimeVariabilityReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth: string;
  readonly gold: TravelTimeVariabilityReviewedGoldArtifact;
  readonly candidates: readonly TravelTimeVariabilityCandidateLike[];
};

export type BuildTravelTimeVariabilityReadinessProjectionInput =
  EvaluateTravelTimeVariabilityReviewedGoldInput & {
    readonly coverage: readonly TravelTimeVariabilityCoverageLike[];
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
  TravelTimeVariabilityReviewedFrontendUse,
  { expected: number; emitted: number; dropped: number }
> {
  return {
    primary_finding: { expected: 0, emitted: 0, dropped: 0 },
    route_context: { expected: 0, emitted: 0, dropped: 0 },
    reviewer_only: { expected: 0, emitted: 0, dropped: 0 },
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
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function readinessBucket(input: {
  readonly label: TravelTimeVariabilityGoldLabel | null;
  readonly emitted: boolean;
}): DetectorReadinessBucket {
  if (input.label === null) return input.emitted ? "review_queue" : "suppressed";
  switch (input.label.expectedFrontendUse) {
    case "primary_finding":
      return "public_finding_candidate";
    case "route_context":
      return "route_context";
    case "reviewer_only":
    case "needs_more_evidence":
      return "review_queue";
    case "suppress":
      return "suppressed";
  }
}

export function buildTravelTimeVariabilityReviewedGoldArtifact(
  input: BuildTravelTimeVariabilityReviewedGoldInput,
): TravelTimeVariabilityReviewedGoldArtifact {
  const byCalibrationTag = new Map<TravelTimeVariabilityCalibrationTag, number>();
  const byReviewDepth = new Map<string, number>();
  const labels = input.decisions
    .map((decision): TravelTimeVariabilityGoldLabel => {
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
        shouldEmitFindingCandidate: decision.expectedFrontendUse === "primary_finding",
        shouldEmitCandidate: decision.expectedFrontendUse === "primary_finding",
        shouldPromotePrimary: decision.expectedFrontendUse === "primary_finding",
      };
    })
    .sort(
      (left, right) =>
        left.detectorId.localeCompare(right.detectorId) ||
        left.scopeId.localeCompare(right.scopeId),
    );

  return {
    artifactKind: "travel_time_variability_reviewed_gold",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
    source: {
      reviewQueuePath: input.reviewQueuePath,
      decisionsPath: input.decisionsPath,
    },
    summary: {
      labelCount: labels.length,
      primaryFindingCount: labels.filter((label) => label.expectedFrontendUse === "primary_finding")
        .length,
      routeContextCount: labels.filter((label) => label.expectedFrontendUse === "route_context")
        .length,
      reviewerOnlyCount: labels.filter((label) => label.expectedFrontendUse === "reviewer_only")
        .length,
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

export function evaluateTravelTimeVariabilityReviewedGold(
  input: EvaluateTravelTimeVariabilityReviewedGoldInput,
): TravelTimeVariabilityReviewedGoldEvaluation {
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
    TravelTimeVariabilityCalibrationTag,
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
  const primaryExpected = input.gold.labels.filter((label) => label.shouldPromotePrimary);
  const suppressExpected = input.gold.labels.filter(
    (label) => label.expectedFrontendUse === "suppress",
  );
  const contextOrReviewerExpected = input.gold.labels.filter(
    (label) =>
      label.expectedFrontendUse === "route_context" ||
      label.expectedFrontendUse === "reviewer_only" ||
      label.expectedFrontendUse === "needs_more_evidence",
  );

  return {
    artifactKind: "travel_time_variability_reviewed_gold_evaluation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
    summary: {
      labelCount: input.gold.labels.length,
      emittedReviewedCount: emittedReviewed.length,
      primaryExpectedCount: primaryExpected.length,
      primarySurvivedCount: primaryExpected.filter((label) => emittedKeys.has(label.identityKey))
        .length,
      primaryDroppedCount: primaryExpected.filter((label) => !emittedKeys.has(label.identityKey))
        .length,
      suppressExpectedCount: suppressExpected.length,
      suppressStillEmittedCount: suppressExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      contextOrReviewerExpectedCount: contextOrReviewerExpected.length,
      contextOrReviewerStillEmittedCount: contextOrReviewerExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      unreviewedEmittedCount: unreviewedEmittedCandidates.length,
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

export function buildTravelTimeVariabilityReadinessProjection(
  input: BuildTravelTimeVariabilityReadinessProjectionInput,
): TravelTimeVariabilityReadinessProjection {
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
    artifactKind: "travel_time_variability_readiness_projection",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    asOfMonth: input.asOfMonth,
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

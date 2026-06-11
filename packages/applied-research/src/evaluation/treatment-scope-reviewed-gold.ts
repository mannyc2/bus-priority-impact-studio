import {
  type DetectorReadinessBucket,
  detectorScopeIdentityKey,
  emptyDetectorReadinessBucketCounts,
  sortedDetectorBucketRecord,
} from "./detector-readiness-projection";

export type TreatmentScopeReviewedFrontendUse =
  | "primary_finding"
  | "route_context"
  | "reviewer_only"
  | "needs_more_evidence"
  | "suppress"
  | "unknown";

export type TreatmentScopeReviewedDecision = {
  readonly candidateId?: unknown;
  readonly decision?: unknown;
  readonly action?: unknown;
  readonly reviewerConfidence?: unknown;
  readonly falsePositiveRootCause?: unknown;
  readonly calibrationTags?: unknown;
  readonly frontendUse?: unknown;
  readonly rationale?: unknown;
  readonly revisedClaimText?: unknown;
  readonly reviewBatch?: unknown;
  readonly reviewDepth?: unknown;
  readonly notes?: unknown;
};

export type TreatmentScopeReviewedPacketIndexRow = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly file?: unknown;
};

export type TreatmentScopeReviewedCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly routeId?: unknown;
  readonly scopeId?: unknown;
  readonly detectorScore?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type TreatmentScopeReviewedCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type TreatmentScopeGoldLabel = {
  readonly labelId: string;
  readonly candidateId: string;
  readonly detectorId: string;
  readonly routeId: string;
  readonly scopeId: string;
  readonly identityKey: string;
  readonly expectedFrontendUse: TreatmentScopeReviewedFrontendUse;
  readonly shouldEmitCandidate: boolean;
  readonly shouldPromotePrimary: boolean;
  readonly reviewerDecision: string | null;
  readonly reviewerAction: string | null;
  readonly reviewerConfidence: string | null;
  readonly falsePositiveRootCause: string | null;
  readonly calibrationTags: readonly string[];
  readonly reviewBatch: string;
  readonly reviewDepth: string;
  readonly packetFile: string | null;
  readonly rationale: string | null;
  readonly revisedClaimText: string | null;
  readonly reviewerNotes: string | null;
};

export type TreatmentScopeReadinessBucket = DetectorReadinessBucket;

export type TreatmentScopeReadinessProjectionItem = {
  readonly identityKey: string;
  readonly detectorId: string;
  readonly routeId: string | null;
  readonly scopeId: string;
  readonly bucket: TreatmentScopeReadinessBucket;
  readonly reviewedFrontendUse: TreatmentScopeReviewedFrontendUse | "unreviewed";
  readonly emittedCandidate: boolean;
  readonly geometrySourceConfirmed: boolean;
  readonly reasonCode: string | null;
  readonly caveats: readonly string[];
  readonly label: TreatmentScopeGoldLabel | null;
  readonly candidate: TreatmentScopeReviewedCandidateLike | null;
};

export type TreatmentScopeReadinessProjection = {
  readonly artifactKind: "treatment_scope_readiness_projection";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly summary: {
    readonly itemCount: number;
    readonly byBucket: Record<TreatmentScopeReadinessBucket, number>;
    readonly byDetector: Record<string, Record<TreatmentScopeReadinessBucket, number>>;
    readonly publicFindingCandidateCount: number;
    readonly routeContextCount: number;
    readonly reviewQueueCount: number;
    readonly suppressedCount: number;
  };
  readonly items: readonly TreatmentScopeReadinessProjectionItem[];
};

export type TreatmentScopeReviewedGoldArtifact = {
  readonly artifactKind: "treatment_scope_reviewed_gold";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly source: {
    readonly decisionsPath: string;
    readonly packetIndexPath: string;
  };
  readonly summary: {
    readonly labelCount: number;
    readonly primaryFindingCount: number;
    readonly contextCount: number;
    readonly reviewerOnlyCount: number;
    readonly needsMoreEvidenceCount: number;
    readonly suppressCount: number;
    readonly byDetector: Record<
      string,
      {
        readonly labelCount: number;
        readonly primaryFindingCount: number;
        readonly suppressCount: number;
      }
    >;
    readonly byFalsePositiveRootCause: Record<string, number>;
    readonly byReviewBatch: Record<string, number>;
    readonly byReviewDepth: Record<string, number>;
  };
  readonly labels: readonly TreatmentScopeGoldLabel[];
};

export type TreatmentScopeReviewedGoldEvaluation = {
  readonly artifactKind: "treatment_scope_reviewed_gold_evaluation";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly summary: {
    readonly labelCount: number;
    readonly emittedReviewedCount: number;
    readonly droppedReviewedCount: number;
    readonly primaryExpectedCount: number;
    readonly primarySurvivedCount: number;
    readonly primaryDroppedCount: number;
    readonly suppressExpectedCount: number;
    readonly suppressStillEmittedCount: number;
    readonly contextStillEmittedCount: number;
    readonly unreviewedEmittedCount: number;
  };
  readonly byDetector: Record<
    string,
    {
      readonly labelCount: number;
      readonly emittedReviewedCount: number;
      readonly primaryExpectedCount: number;
      readonly primarySurvivedCount: number;
      readonly suppressExpectedCount: number;
      readonly suppressStillEmittedCount: number;
      readonly unreviewedEmittedCount: number;
    }
  >;
  readonly byExpectedFrontendUse: Record<
    TreatmentScopeReviewedFrontendUse,
    {
      readonly expected: number;
      readonly emitted: number;
      readonly dropped: number;
    }
  >;
  readonly byFalsePositiveRootCause: Record<
    string,
    {
      readonly expected: number;
      readonly emitted: number;
      readonly dropped: number;
    }
  >;
  readonly byReviewBatch: Record<
    string,
    {
      readonly expected: number;
      readonly emitted: number;
      readonly dropped: number;
      readonly primaryExpected: number;
      readonly primarySurvived: number;
      readonly suppressExpected: number;
      readonly suppressStillEmitted: number;
    }
  >;
  readonly byReviewDepth: Record<
    string,
    {
      readonly expected: number;
      readonly emitted: number;
      readonly dropped: number;
      readonly primaryExpected: number;
      readonly primarySurvived: number;
      readonly suppressExpected: number;
      readonly suppressStillEmitted: number;
    }
  >;
  readonly emittedReviewed: readonly TreatmentScopeGoldLabel[];
  readonly droppedReviewed: readonly TreatmentScopeGoldLabel[];
  readonly unreviewedEmittedCandidates: readonly TreatmentScopeReviewedCandidateLike[];
};

export type BuildTreatmentScopeReviewedGoldArtifactInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly decisionsPath: string;
  readonly packetIndexPath: string;
  readonly decisions: readonly TreatmentScopeReviewedDecision[];
  readonly packetIndex: readonly TreatmentScopeReviewedPacketIndexRow[];
  readonly defaultReviewBatch?: string;
  readonly defaultReviewDepth?: string;
};

export type EvaluateTreatmentScopeReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly gold: TreatmentScopeReviewedGoldArtifact;
  readonly candidates: readonly TreatmentScopeReviewedCandidateLike[];
};

export type BuildTreatmentScopeReadinessProjectionInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly gold: TreatmentScopeReviewedGoldArtifact;
  readonly candidates: readonly TreatmentScopeReviewedCandidateLike[];
  readonly coverage: readonly TreatmentScopeReviewedCoverageLike[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = text(item);
    return parsed === null ? [] : [parsed];
  });
}

function frontendUse(value: unknown): TreatmentScopeReviewedFrontendUse {
  const parsed = text(value);
  if (
    parsed === "primary_finding" ||
    parsed === "route_context" ||
    parsed === "reviewer_only" ||
    parsed === "needs_more_evidence" ||
    parsed === "suppress"
  ) {
    return parsed;
  }
  return "unknown";
}

function nonEmptyObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function field(record: Record<string, unknown> | null | undefined, key: string): unknown {
  return record?.[key];
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countsRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function emptyFrontendUseCounts(): Record<
  TreatmentScopeReviewedFrontendUse,
  { expected: number; emitted: number; dropped: number }
> {
  return {
    primary_finding: { expected: 0, emitted: 0, dropped: 0 },
    route_context: { expected: 0, emitted: 0, dropped: 0 },
    reviewer_only: { expected: 0, emitted: 0, dropped: 0 },
    needs_more_evidence: { expected: 0, emitted: 0, dropped: 0 },
    suppress: { expected: 0, emitted: 0, dropped: 0 },
    unknown: { expected: 0, emitted: 0, dropped: 0 },
  };
}

function updateReviewGroup(
  map: Map<
    string,
    {
      expected: number;
      emitted: number;
      dropped: number;
      primaryExpected: number;
      primarySurvived: number;
      suppressExpected: number;
      suppressStillEmitted: number;
    }
  >,
  key: string,
  label: TreatmentScopeGoldLabel,
  emitted: boolean,
): void {
  const current = map.get(key) ?? {
    expected: 0,
    emitted: 0,
    dropped: 0,
    primaryExpected: 0,
    primarySurvived: 0,
    suppressExpected: 0,
    suppressStillEmitted: 0,
  };
  current.expected += 1;
  if (emitted) current.emitted += 1;
  else current.dropped += 1;
  if (label.shouldPromotePrimary) {
    current.primaryExpected += 1;
    if (emitted) current.primarySurvived += 1;
  }
  if (label.expectedFrontendUse === "suppress") {
    current.suppressExpected += 1;
    if (emitted) current.suppressStillEmitted += 1;
  }
  map.set(key, current);
}

function sortedReviewGroupRecord(
  map: Map<
    string,
    {
      expected: number;
      emitted: number;
      dropped: number;
      primaryExpected: number;
      primarySurvived: number;
      suppressExpected: number;
      suppressStillEmitted: number;
    }
  >,
): Record<
  string,
  {
    expected: number;
    emitted: number;
    dropped: number;
    primaryExpected: number;
    primarySurvived: number;
    suppressExpected: number;
    suppressStillEmitted: number;
  }
> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function parseInputsSeen(
  coverage: TreatmentScopeReviewedCoverageLike | undefined,
): Record<string, unknown> | null {
  const raw = text(coverage?.inputsSeenJson);
  if (raw === null) return null;
  try {
    return nonEmptyObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

function hasEnhancedBusStopOnlyRefs(inputs: Record<string, unknown> | null): boolean {
  const refs = field(inputs, "treatmentSourceRefs");
  const refItems = Array.isArray(refs) ? refs : [];
  const lowerRefs = refItems.flatMap((ref) => {
    const parsed = text(ref);
    return parsed === null ? [] : [parsed.toLowerCase()];
  });
  return (
    lowerRefs.some((ref) => ref.includes("enhanced bus stop")) &&
    !lowerRefs.some(
      (ref) =>
        ref.includes("curbside") ||
        ref.includes("busway") ||
        ref.includes("offset") ||
        ref.includes("center running") ||
        ref.includes("left-side running") ||
        ref.includes("buses and local deliveries only"),
    )
  );
}

function geometrySourceConfirmed(input: {
  detectorId: string;
  inputs: Record<string, unknown> | null;
}): boolean {
  const { detectorId, inputs } = input;
  if (inputs === null) return false;
  const matchMethod = text(field(inputs, "matchMethod"));
  const overlapShare = numberValue(field(inputs, "overlapShare"));
  if (detectorId === "treatment_scope_gap") {
    const fitContext = nonEmptyObject(field(inputs, "treatmentScopeFitContext"));
    const fitStatus = text(field(fitContext, "fitStatus"));
    const sourceGapCount = numberValue(field(fitContext, "sourceGapCount")) ?? 0;
    const positiveRouteTreatmentCount =
      numberValue(field(inputs, "positiveRouteTreatmentCount")) ?? 0;
    return (
      fitStatus === "true_uncovered" &&
      sourceGapCount === 0 &&
      positiveRouteTreatmentCount >= 1 &&
      (matchMethod === "not_matched" || overlapShare === 0)
    );
  }
  if (detectorId === "treatment_scope_mismatch") {
    return (
      matchMethod === "route_shape_overlap" &&
      overlapShare !== null &&
      overlapShare >= 0.8 &&
      !hasEnhancedBusStopOnlyRefs(inputs)
    );
  }
  return false;
}

function caveatsFor(input: {
  label: TreatmentScopeGoldLabel | null;
  coverage: TreatmentScopeReviewedCoverageLike | undefined;
  inputs: Record<string, unknown> | null;
  geometrySourceConfirmed: boolean;
}): string[] {
  const caveats = new Set<string>();
  for (const tag of input.label?.calibrationTags ?? []) caveats.add(tag);
  const reasonCode = text(input.coverage?.reasonCode);
  if (reasonCode !== null) caveats.add(reasonCode);
  const fitContext = nonEmptyObject(field(input.inputs, "treatmentScopeFitContext"));
  const fitStatus = text(field(fitContext, "fitStatus"));
  if (fitStatus !== null) caveats.add(`fit_status:${fitStatus}`);
  if (!input.geometrySourceConfirmed) caveats.add("geometry_source_not_confirmed");
  if (hasEnhancedBusStopOnlyRefs(input.inputs)) caveats.add("enhanced_bus_stop_only");
  return [...caveats].sort();
}

function readinessBucket(input: {
  label: TreatmentScopeGoldLabel | null;
  emitted: boolean;
  geometrySourceConfirmed: boolean;
  caveats: readonly string[];
}): TreatmentScopeReadinessBucket {
  const { label, emitted, geometrySourceConfirmed, caveats } = input;
  if (label?.expectedFrontendUse === "suppress") return "suppressed";
  if (!emitted) return "suppressed";
  if (label?.expectedFrontendUse === "primary_finding") {
    return geometrySourceConfirmed ? "public_finding_candidate" : "review_queue";
  }
  if (label?.expectedFrontendUse === "route_context") return "route_context";
  if (
    label?.expectedFrontendUse === "reviewer_only" ||
    label?.expectedFrontendUse === "needs_more_evidence"
  ) {
    return "review_queue";
  }
  if (
    caveats.some(
      (caveat) =>
        caveat.includes("terminal") ||
        caveat.includes("duplicate") ||
        caveat.includes("insufficient_history") ||
        caveat.includes("historically_stable") ||
        caveat.includes("stable_or_improving") ||
        caveat.includes("source_gap") ||
        caveat.includes("route_level_source_too_broad") ||
        caveat.includes("enhanced_bus_stop_only"),
    )
  ) {
    return "suppressed";
  }
  return "review_queue";
}

export function buildTreatmentScopeReviewedGoldArtifact(
  input: BuildTreatmentScopeReviewedGoldArtifactInput,
): TreatmentScopeReviewedGoldArtifact {
  const packetByCandidateId = new Map(
    input.packetIndex.flatMap((packet) => {
      const candidateId = text(packet.candidateId);
      return candidateId === null ? [] : [[candidateId, packet] as const];
    }),
  );
  const byDetector = new Map<
    string,
    { labelCount: number; primaryFindingCount: number; suppressCount: number }
  >();
  const byFalsePositiveRootCause = new Map<string, number>();
  const byReviewBatch = new Map<string, number>();
  const byReviewDepth = new Map<string, number>();
  const labels = input.decisions.flatMap((decision): TreatmentScopeGoldLabel[] => {
    const candidateId = text(decision.candidateId);
    if (candidateId === null) return [];
    const packet = packetByCandidateId.get(candidateId);
    const detectorId = text(packet?.detectorId);
    const routeId = text(packet?.routeId);
    const scopeId = text(packet?.scopeId);
    if (detectorId === null || routeId === null || scopeId === null) return [];
    const expectedFrontendUse = frontendUse(decision.frontendUse);
    const reviewBatch = text(decision.reviewBatch) ?? input.defaultReviewBatch ?? "unknown";
    const reviewDepth = text(decision.reviewDepth) ?? input.defaultReviewDepth ?? "unknown";
    const shouldPromotePrimary = expectedFrontendUse === "primary_finding";
    const shouldEmitCandidate = expectedFrontendUse !== "suppress";
    const falsePositiveRootCause = text(decision.falsePositiveRootCause);
    const current = byDetector.get(detectorId) ?? {
      labelCount: 0,
      primaryFindingCount: 0,
      suppressCount: 0,
    };
    current.labelCount += 1;
    if (shouldPromotePrimary) current.primaryFindingCount += 1;
    if (expectedFrontendUse === "suppress") current.suppressCount += 1;
    byDetector.set(detectorId, current);
    increment(byFalsePositiveRootCause, falsePositiveRootCause ?? "unknown");
    increment(byReviewBatch, reviewBatch);
    increment(byReviewDepth, reviewDepth);
    return [
      {
        labelId: `${detectorId}:${scopeId}`,
        candidateId,
        detectorId,
        routeId,
        scopeId,
        identityKey: detectorScopeIdentityKey({ detectorId, scopeId }),
        expectedFrontendUse,
        shouldEmitCandidate,
        shouldPromotePrimary,
        reviewerDecision: text(decision.decision),
        reviewerAction: text(decision.action),
        reviewerConfidence: text(decision.reviewerConfidence),
        falsePositiveRootCause,
        calibrationTags: stringArray(decision.calibrationTags),
        reviewBatch,
        reviewDepth,
        packetFile: text(packet?.file),
        rationale: text(decision.rationale),
        revisedClaimText: text(decision.revisedClaimText),
        reviewerNotes: text(decision.notes),
      },
    ];
  });

  return {
    artifactKind: "treatment_scope_reviewed_gold",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    source: {
      decisionsPath: input.decisionsPath,
      packetIndexPath: input.packetIndexPath,
    },
    summary: {
      labelCount: labels.length,
      primaryFindingCount: labels.filter((label) => label.expectedFrontendUse === "primary_finding")
        .length,
      contextCount: labels.filter((label) => label.expectedFrontendUse === "route_context").length,
      reviewerOnlyCount: labels.filter((label) => label.expectedFrontendUse === "reviewer_only")
        .length,
      needsMoreEvidenceCount: labels.filter(
        (label) => label.expectedFrontendUse === "needs_more_evidence",
      ).length,
      suppressCount: labels.filter((label) => label.expectedFrontendUse === "suppress").length,
      byDetector: Object.fromEntries(
        [...byDetector.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
      byFalsePositiveRootCause: countsRecord(byFalsePositiveRootCause),
      byReviewBatch: countsRecord(byReviewBatch),
      byReviewDepth: countsRecord(byReviewDepth),
    },
    labels: labels.sort(
      (left, right) =>
        left.detectorId.localeCompare(right.detectorId) ||
        left.scopeId.localeCompare(right.scopeId),
    ),
  };
}

export function evaluateTreatmentScopeReviewedGold(
  input: EvaluateTreatmentScopeReviewedGoldInput,
): TreatmentScopeReviewedGoldEvaluation {
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
  const fpCounts = new Map<string, { expected: number; emitted: number; dropped: number }>();
  const byReviewBatch = new Map<
    string,
    {
      expected: number;
      emitted: number;
      dropped: number;
      primaryExpected: number;
      primarySurvived: number;
      suppressExpected: number;
      suppressStillEmitted: number;
    }
  >();
  const byReviewDepth = new Map<
    string,
    {
      expected: number;
      emitted: number;
      dropped: number;
      primaryExpected: number;
      primarySurvived: number;
      suppressExpected: number;
      suppressStillEmitted: number;
    }
  >();
  const byDetector = new Map<
    string,
    {
      labelCount: number;
      emittedReviewedCount: number;
      primaryExpectedCount: number;
      primarySurvivedCount: number;
      suppressExpectedCount: number;
      suppressStillEmittedCount: number;
      unreviewedEmittedCount: number;
    }
  >();
  const unreviewedEmittedCandidates = input.candidates.filter((candidate) => {
    const detectorId = text(candidate.detectorId);
    const scopeId = text(candidate.scopeId);
    return detectorId === null || scopeId === null
      ? true
      : !reviewedKeys.has(detectorScopeIdentityKey({ detectorId, scopeId }));
  });

  for (const label of input.gold.labels) {
    const emitted = emittedKeys.has(label.identityKey);
    byExpectedFrontendUse[label.expectedFrontendUse].expected += 1;
    if (emitted) byExpectedFrontendUse[label.expectedFrontendUse].emitted += 1;
    else byExpectedFrontendUse[label.expectedFrontendUse].dropped += 1;
    const rootCause = label.falsePositiveRootCause ?? "unknown";
    const root = fpCounts.get(rootCause) ?? { expected: 0, emitted: 0, dropped: 0 };
    root.expected += 1;
    if (emitted) root.emitted += 1;
    else root.dropped += 1;
    fpCounts.set(rootCause, root);
    updateReviewGroup(byReviewBatch, label.reviewBatch, label, emitted);
    updateReviewGroup(byReviewDepth, label.reviewDepth, label, emitted);
    const detector = byDetector.get(label.detectorId) ?? {
      labelCount: 0,
      emittedReviewedCount: 0,
      primaryExpectedCount: 0,
      primarySurvivedCount: 0,
      suppressExpectedCount: 0,
      suppressStillEmittedCount: 0,
      unreviewedEmittedCount: 0,
    };
    detector.labelCount += 1;
    if (emitted) detector.emittedReviewedCount += 1;
    if (label.shouldPromotePrimary) {
      detector.primaryExpectedCount += 1;
      if (emitted) detector.primarySurvivedCount += 1;
    }
    if (label.expectedFrontendUse === "suppress") {
      detector.suppressExpectedCount += 1;
      if (emitted) detector.suppressStillEmittedCount += 1;
    }
    byDetector.set(label.detectorId, detector);
  }
  for (const candidate of unreviewedEmittedCandidates) {
    const detectorId = text(candidate.detectorId);
    if (detectorId === null) continue;
    const detector = byDetector.get(detectorId) ?? {
      labelCount: 0,
      emittedReviewedCount: 0,
      primaryExpectedCount: 0,
      primarySurvivedCount: 0,
      suppressExpectedCount: 0,
      suppressStillEmittedCount: 0,
      unreviewedEmittedCount: 0,
    };
    detector.unreviewedEmittedCount += 1;
    byDetector.set(detectorId, detector);
  }
  const primaryExpected = input.gold.labels.filter((label) => label.shouldPromotePrimary);
  const suppressExpected = input.gold.labels.filter(
    (label) => label.expectedFrontendUse === "suppress",
  );
  const contextStillEmittedCount = emittedReviewed.filter(
    (label) =>
      label.expectedFrontendUse === "route_context" ||
      label.expectedFrontendUse === "reviewer_only" ||
      label.expectedFrontendUse === "needs_more_evidence",
  ).length;

  return {
    artifactKind: "treatment_scope_reviewed_gold_evaluation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    summary: {
      labelCount: input.gold.labels.length,
      emittedReviewedCount: emittedReviewed.length,
      droppedReviewedCount: droppedReviewed.length,
      primaryExpectedCount: primaryExpected.length,
      primarySurvivedCount: primaryExpected.filter((label) => emittedKeys.has(label.identityKey))
        .length,
      primaryDroppedCount: primaryExpected.filter((label) => !emittedKeys.has(label.identityKey))
        .length,
      suppressExpectedCount: suppressExpected.length,
      suppressStillEmittedCount: suppressExpected.filter((label) =>
        emittedKeys.has(label.identityKey),
      ).length,
      contextStillEmittedCount,
      unreviewedEmittedCount: unreviewedEmittedCandidates.length,
    },
    byDetector: Object.fromEntries(
      [...byDetector.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    byExpectedFrontendUse,
    byFalsePositiveRootCause: Object.fromEntries(
      [...fpCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    byReviewBatch: sortedReviewGroupRecord(byReviewBatch),
    byReviewDepth: sortedReviewGroupRecord(byReviewDepth),
    emittedReviewed,
    droppedReviewed,
    unreviewedEmittedCandidates,
  };
}

export function buildTreatmentScopeReadinessProjection(
  input: BuildTreatmentScopeReadinessProjectionInput,
): TreatmentScopeReadinessProjection {
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
  const keys = new Set([...labelByKey.keys(), ...candidateByKey.keys()]);
  const byBucket = emptyDetectorReadinessBucketCounts();
  const byDetector = new Map<string, Record<TreatmentScopeReadinessBucket, number>>();
  const items = [...keys].flatMap((key): TreatmentScopeReadinessProjectionItem[] => {
    const label = labelByKey.get(key) ?? null;
    const candidate = candidateByKey.get(key) ?? null;
    const detectorId = text(candidate?.detectorId) ?? label?.detectorId ?? null;
    const scopeId = text(candidate?.scopeId) ?? label?.scopeId ?? null;
    if (detectorId === null || scopeId === null) return [];
    const coverage = coverageByKey.get(key);
    const inputs = parseInputsSeen(coverage);
    const confirmed = geometrySourceConfirmed({ detectorId, inputs });
    const caveats = caveatsFor({ label, coverage, inputs, geometrySourceConfirmed: confirmed });
    const bucket = readinessBucket({
      label,
      emitted: candidate !== null,
      geometrySourceConfirmed: confirmed,
      caveats,
    });
    byBucket[bucket] += 1;
    const detectorCounts = byDetector.get(detectorId) ?? emptyDetectorReadinessBucketCounts();
    detectorCounts[bucket] += 1;
    byDetector.set(detectorId, detectorCounts);
    return [
      {
        identityKey: key,
        detectorId,
        routeId: text(candidate?.routeId) ?? label?.routeId ?? null,
        scopeId,
        bucket,
        reviewedFrontendUse: label?.expectedFrontendUse ?? "unreviewed",
        emittedCandidate: candidate !== null,
        geometrySourceConfirmed: confirmed,
        reasonCode: text(coverage?.reasonCode),
        caveats,
        label,
        candidate,
      },
    ];
  });

  return {
    artifactKind: "treatment_scope_readiness_projection",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    summary: {
      itemCount: items.length,
      byBucket,
      byDetector: sortedDetectorBucketRecord(byDetector),
      publicFindingCandidateCount: byBucket.public_finding_candidate,
      routeContextCount: byBucket.route_context,
      reviewQueueCount: byBucket.review_queue,
      suppressedCount: byBucket.suppressed,
    },
    items: items.sort(
      (left, right) =>
        left.bucket.localeCompare(right.bucket) ||
        left.detectorId.localeCompare(right.detectorId) ||
        left.scopeId.localeCompare(right.scopeId),
    ),
  };
}

import {
  type DetectorReadinessBucket,
  detectorScopeIdentityKey,
  emptyDetectorReadinessBucketCounts,
} from "./detector-readiness-projection";
import type { SpeedPaceReviewItem } from "./speed-pace-review-queue";

// Reviewed-gold, evaluation, and readiness projection for `speed_pace_hotspot` (ADR-0018 steps 3-7).
// Mirrors the treatment-scope / customer-journey families but keeps speed-pace-specific tags and the
// candidate-cap recall metric. Shares identity + bucket helpers with the other detector families.

export type SpeedPaceReviewedFrontendUse =
  | "primary_finding"
  | "route_context"
  | "reviewer_only"
  | "needs_more_evidence"
  | "suppress"
  | "unknown";

// Detector-specific calibration tags (false-positive roots / review annotations).
export type SpeedPaceCalibrationTag =
  | "real_slow_segment"
  | "route_context_only"
  | "terminal_or_layover"
  | "short_segment"
  | "low_observation_count"
  | "baseline_unavailable_or_weak"
  | "geometry_ambiguous"
  | "daypart_artifact"
  | "duplicate_physical_scope"
  | "needs_history_context"
  | "cap_suppressed";

export type SpeedPaceReviewedDecision = {
  readonly scopeId?: unknown;
  readonly detectorId?: unknown;
  readonly frontendUse?: unknown;
  readonly reviewerConfidence?: unknown;
  readonly falsePositiveRootCause?: unknown;
  readonly calibrationTags?: unknown;
  readonly reviewBatch?: unknown;
  readonly reviewDepth?: unknown;
  readonly rationale?: unknown;
  readonly revisedClaimText?: unknown;
  readonly notes?: unknown;
};

export type SpeedPaceGoldLabel = {
  readonly labelId: string;
  readonly detectorId: string;
  readonly scopeId: string;
  readonly identityKey: string;
  readonly routeId: string | null;
  readonly segmentId: string | null;
  readonly direction: string | null;
  readonly daypart: string | null;
  readonly expectedFrontendUse: SpeedPaceReviewedFrontendUse;
  readonly shouldEmitCandidate: boolean;
  readonly shouldPromotePrimary: boolean;
  readonly reviewerConfidence: string | null;
  readonly falsePositiveRootCause: string | null;
  readonly calibrationTags: readonly string[];
  readonly reviewBatch: string;
  readonly reviewDepth: string;
  readonly rationale: string | null;
  readonly revisedClaimText: string | null;
  readonly reviewerNotes: string | null;
};

export type SpeedPaceReviewedGoldArtifact = {
  readonly artifactKind: "speed_pace_reviewed_gold";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: string;
  readonly source: { readonly decisionsPath: string; readonly reviewQueuePath: string };
  readonly summary: {
    readonly labelCount: number;
    readonly primaryFindingCount: number;
    readonly routeContextCount: number;
    readonly reviewerOnlyCount: number;
    readonly needsMoreEvidenceCount: number;
    readonly suppressCount: number;
    readonly byFalsePositiveRootCause: Record<string, number>;
    readonly byCalibrationTag: Record<string, number>;
    readonly byReviewBatch: Record<string, number>;
    readonly byReviewDepth: Record<string, number>;
  };
  readonly labels: readonly SpeedPaceGoldLabel[];
};

export type SpeedPaceReviewedGoldEvaluation = {
  readonly artifactKind: "speed_pace_reviewed_gold_evaluation";
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
    // Speed-pace-specific: reviewed scopes the reviewer judged emittable but the cap dropped.
    readonly capSuppressedReviewedCount: number;
    readonly capSuppressedShouldEmitCount: number;
  };
  readonly byExpectedFrontendUse: Record<
    SpeedPaceReviewedFrontendUse,
    { readonly expected: number; readonly emitted: number; readonly dropped: number }
  >;
  readonly byCalibrationTag: Record<
    string,
    { readonly expected: number; readonly emitted: number; readonly dropped: number }
  >;
  readonly byReviewBatch: Record<string, ReviewGroupCounts>;
  readonly byReviewDepth: Record<string, ReviewGroupCounts>;
  readonly droppedReviewed: readonly SpeedPaceGoldLabel[];
};

type ReviewGroupCounts = {
  readonly expected: number;
  readonly emitted: number;
  readonly dropped: number;
  readonly primaryExpected: number;
  readonly primarySurvived: number;
  readonly suppressExpected: number;
  readonly suppressStillEmitted: number;
};

export type SpeedPaceReadinessBucket = DetectorReadinessBucket;

export type SpeedPaceReadinessProjectionItem = {
  readonly identityKey: string;
  readonly detectorId: string;
  readonly routeId: string | null;
  readonly scopeId: string;
  readonly segmentId: string | null;
  readonly bucket: SpeedPaceReadinessBucket;
  readonly reviewedFrontendUse: SpeedPaceReviewedFrontendUse | "unreviewed";
  readonly emittedCandidate: boolean;
  readonly promotionGatesPass: boolean;
  readonly promotionBlockers: readonly string[];
  readonly canonicalForPhysicalScope: boolean;
  readonly caveats: readonly string[];
};

export type SpeedPaceReadinessProjection = {
  readonly artifactKind: "speed_pace_readiness_projection";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: string;
  readonly summary: {
    readonly itemCount: number;
    readonly byBucket: Record<SpeedPaceReadinessBucket, number>;
    readonly publicFindingCandidateCount: number;
    readonly routeContextCount: number;
    readonly reviewQueueCount: number;
    readonly suppressedCount: number;
    readonly reviewedSuppressedCount: number;
    readonly coverageSkippedCount: number;
    readonly unreviewedSuppressedCoverageCount: number;
  };
  readonly items: readonly SpeedPaceReadinessProjectionItem[];
};

export type BuildSpeedPaceReviewedGoldArtifactInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly decisionsPath: string;
  readonly reviewQueuePath: string;
  readonly decisions: readonly SpeedPaceReviewedDecision[];
  readonly reviewItems: readonly SpeedPaceReviewItem[];
  readonly defaultReviewBatch?: string;
  readonly defaultReviewDepth?: string;
};

export type EvaluateSpeedPaceReviewedGoldInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly gold: SpeedPaceReviewedGoldArtifact;
  readonly reviewItems: readonly SpeedPaceReviewItem[];
};

export type BuildSpeedPaceReadinessProjectionInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly gold: SpeedPaceReviewedGoldArtifact;
  readonly reviewItems: readonly SpeedPaceReviewItem[];
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

function frontendUse(value: unknown): SpeedPaceReviewedFrontendUse {
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

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countsRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function emptyFrontendUseCounts(): Record<
  SpeedPaceReviewedFrontendUse,
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

function emptyReviewGroup(): ReviewGroupCounts {
  return {
    expected: 0,
    emitted: 0,
    dropped: 0,
    primaryExpected: 0,
    primarySurvived: 0,
    suppressExpected: 0,
    suppressStillEmitted: 0,
  };
}

function updateReviewGroup(
  map: Map<string, ReviewGroupCounts>,
  key: string,
  label: SpeedPaceGoldLabel,
  emitted: boolean,
): void {
  const current = map.get(key) ?? emptyReviewGroup();
  const next: ReviewGroupCounts = {
    expected: current.expected + 1,
    emitted: current.emitted + (emitted ? 1 : 0),
    dropped: current.dropped + (emitted ? 0 : 1),
    primaryExpected: current.primaryExpected + (label.shouldPromotePrimary ? 1 : 0),
    primarySurvived: current.primarySurvived + (label.shouldPromotePrimary && emitted ? 1 : 0),
    suppressExpected: current.suppressExpected + (label.expectedFrontendUse === "suppress" ? 1 : 0),
    suppressStillEmitted:
      current.suppressStillEmitted + (label.expectedFrontendUse === "suppress" && emitted ? 1 : 0),
  };
  map.set(key, next);
}

export function buildSpeedPaceReviewedGoldArtifact(
  input: BuildSpeedPaceReviewedGoldArtifactInput,
): SpeedPaceReviewedGoldArtifact {
  const itemByKey = new Map(input.reviewItems.map((item) => [item.identityKey, item] as const));
  const byFalsePositiveRootCause = new Map<string, number>();
  const byCalibrationTag = new Map<string, number>();
  const byReviewBatch = new Map<string, number>();
  const byReviewDepth = new Map<string, number>();

  const labels = input.decisions.flatMap((decision): SpeedPaceGoldLabel[] => {
    const detectorId = text(decision.detectorId) ?? "speed_pace_hotspot";
    const scopeId = text(decision.scopeId);
    if (scopeId === null) return [];
    const identityKey = detectorScopeIdentityKey({ detectorId, scopeId });
    const item = itemByKey.get(identityKey);
    const expectedFrontendUse = frontendUse(decision.frontendUse);
    const reviewBatch = text(decision.reviewBatch) ?? input.defaultReviewBatch ?? "unknown";
    const reviewDepth = text(decision.reviewDepth) ?? input.defaultReviewDepth ?? "unknown";
    const falsePositiveRootCause = text(decision.falsePositiveRootCause);
    const calibrationTags = stringArray(decision.calibrationTags);
    increment(byFalsePositiveRootCause, falsePositiveRootCause ?? "unknown");
    for (const tag of calibrationTags) increment(byCalibrationTag, tag);
    increment(byReviewBatch, reviewBatch);
    increment(byReviewDepth, reviewDepth);
    return [
      {
        labelId: `${detectorId}:${scopeId}`,
        detectorId,
        scopeId,
        identityKey,
        routeId: item?.routeId ?? null,
        segmentId: item?.segmentId ?? null,
        direction: item?.direction ?? null,
        daypart: item?.daypart ?? null,
        expectedFrontendUse,
        shouldEmitCandidate: expectedFrontendUse !== "suppress",
        shouldPromotePrimary: expectedFrontendUse === "primary_finding",
        reviewerConfidence: text(decision.reviewerConfidence),
        falsePositiveRootCause,
        calibrationTags,
        reviewBatch,
        reviewDepth,
        rationale: text(decision.rationale),
        revisedClaimText: text(decision.revisedClaimText),
        reviewerNotes: text(decision.notes),
      },
    ];
  });

  return {
    artifactKind: "speed_pace_reviewed_gold",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: "speed_pace_hotspot",
    source: { decisionsPath: input.decisionsPath, reviewQueuePath: input.reviewQueuePath },
    summary: {
      labelCount: labels.length,
      primaryFindingCount: labels.filter((l) => l.expectedFrontendUse === "primary_finding").length,
      routeContextCount: labels.filter((l) => l.expectedFrontendUse === "route_context").length,
      reviewerOnlyCount: labels.filter((l) => l.expectedFrontendUse === "reviewer_only").length,
      needsMoreEvidenceCount: labels.filter((l) => l.expectedFrontendUse === "needs_more_evidence")
        .length,
      suppressCount: labels.filter((l) => l.expectedFrontendUse === "suppress").length,
      byFalsePositiveRootCause: countsRecord(byFalsePositiveRootCause),
      byCalibrationTag: countsRecord(byCalibrationTag),
      byReviewBatch: countsRecord(byReviewBatch),
      byReviewDepth: countsRecord(byReviewDepth),
    },
    labels: labels.sort((a, b) => a.scopeId.localeCompare(b.scopeId)),
  };
}

export function evaluateSpeedPaceReviewedGold(
  input: EvaluateSpeedPaceReviewedGoldInput,
): SpeedPaceReviewedGoldEvaluation {
  const itemByKey = new Map(input.reviewItems.map((item) => [item.identityKey, item] as const));
  const emittedKeys = new Set(
    input.reviewItems.filter((item) => item.emitted).map((item) => item.identityKey),
  );
  const reviewedKeys = new Set(input.gold.labels.map((label) => label.identityKey));

  const byExpectedFrontendUse = emptyFrontendUseCounts();
  const byCalibrationTag = new Map<
    string,
    { expected: number; emitted: number; dropped: number }
  >();
  const byReviewBatch = new Map<string, ReviewGroupCounts>();
  const byReviewDepth = new Map<string, ReviewGroupCounts>();

  let capSuppressedReviewedCount = 0;
  let capSuppressedShouldEmitCount = 0;

  for (const label of input.gold.labels) {
    const emitted = emittedKeys.has(label.identityKey);
    byExpectedFrontendUse[label.expectedFrontendUse].expected += 1;
    if (emitted) byExpectedFrontendUse[label.expectedFrontendUse].emitted += 1;
    else byExpectedFrontendUse[label.expectedFrontendUse].dropped += 1;
    for (const tag of label.calibrationTags) {
      const current = byCalibrationTag.get(tag) ?? { expected: 0, emitted: 0, dropped: 0 };
      current.expected += 1;
      if (emitted) current.emitted += 1;
      else current.dropped += 1;
      byCalibrationTag.set(tag, current);
    }
    updateReviewGroup(byReviewBatch, label.reviewBatch, label, emitted);
    updateReviewGroup(byReviewDepth, label.reviewDepth, label, emitted);
    const item = itemByKey.get(label.identityKey);
    if (item?.capSuppressed === true) {
      capSuppressedReviewedCount += 1;
      if (label.shouldEmitCandidate) capSuppressedShouldEmitCount += 1;
    }
  }

  const primaryExpected = input.gold.labels.filter((l) => l.shouldPromotePrimary);
  const suppressExpected = input.gold.labels.filter((l) => l.expectedFrontendUse === "suppress");
  const emittedReviewed = input.gold.labels.filter((l) => emittedKeys.has(l.identityKey));
  const droppedReviewed = input.gold.labels.filter((l) => !emittedKeys.has(l.identityKey));
  const unreviewedEmittedCount = input.reviewItems.filter(
    (item) => item.emitted && !reviewedKeys.has(item.identityKey),
  ).length;
  const contextStillEmittedCount = emittedReviewed.filter(
    (l) =>
      l.expectedFrontendUse === "route_context" ||
      l.expectedFrontendUse === "reviewer_only" ||
      l.expectedFrontendUse === "needs_more_evidence",
  ).length;

  return {
    artifactKind: "speed_pace_reviewed_gold_evaluation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    summary: {
      labelCount: input.gold.labels.length,
      emittedReviewedCount: emittedReviewed.length,
      droppedReviewedCount: droppedReviewed.length,
      primaryExpectedCount: primaryExpected.length,
      primarySurvivedCount: primaryExpected.filter((l) => emittedKeys.has(l.identityKey)).length,
      primaryDroppedCount: primaryExpected.filter((l) => !emittedKeys.has(l.identityKey)).length,
      suppressExpectedCount: suppressExpected.length,
      suppressStillEmittedCount: suppressExpected.filter((l) => emittedKeys.has(l.identityKey))
        .length,
      contextStillEmittedCount,
      unreviewedEmittedCount,
      capSuppressedReviewedCount,
      capSuppressedShouldEmitCount,
    },
    byExpectedFrontendUse,
    byCalibrationTag: Object.fromEntries(
      [...byCalibrationTag.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    byReviewBatch: Object.fromEntries(
      [...byReviewBatch.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    byReviewDepth: Object.fromEntries(
      [...byReviewDepth.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    droppedReviewed,
  };
}

export type SpeedPacePromotionGateResult = {
  readonly pass: boolean;
  readonly blockers: readonly string[];
};

export function speedPacePromotionGates(item: SpeedPaceReviewItem): SpeedPacePromotionGateResult {
  const blockers: string[] = [];
  if (!item.emitted) blockers.push("not_emitted");
  if (item.terminalPosition === "first" || item.terminalPosition === "last") {
    blockers.push("terminal_segment");
  }
  if (item.lowObservation) blockers.push("low_observation");
  if (item.metrics.slownessIndex === null) blockers.push("baseline_unavailable");
  // No spatial-confidence gate: the segment_daypart resolver does not compute a spatial-join
  // confidence (rows are pre-joined to GTFS timepoint stop pairs), so an all-1.0 gate would claim a
  // geometry verification that never happened. Marked unsupported (S2.3).
  if (item.metrics.segmentLengthFeet === null) blockers.push("segment_length_unknown");
  return { pass: blockers.length === 0, blockers: blockers.sort() };
}

export function buildSpeedPaceReadinessProjection(
  input: BuildSpeedPaceReadinessProjectionInput,
): SpeedPaceReadinessProjection {
  const labelByKey = new Map(input.gold.labels.map((label) => [label.identityKey, label] as const));
  const itemByKey = new Map(input.reviewItems.map((item) => [item.identityKey, item] as const));

  // Canonical representative per physical scope among emitted candidates. The physical scope is the
  // directed stop pair (`physicalNodePairId`), so the same street block emitted under several
  // routes/dayparts/directions elects ONE canonical public candidate; the rest are downgraded to
  // route_context. Tie-break: highest detector score, then highest slowness, then identity key.
  const physicalKeyOf = (item: SpeedPaceReviewItem): string | null =>
    item.physicalNodePairId ?? item.segmentId;
  const canonicalByPhysical = new Map<string, { key: string; score: number; slowness: number }>();
  for (const item of input.reviewItems) {
    const physicalKey = physicalKeyOf(item);
    if (!item.emitted || physicalKey === null) continue;
    const score = item.detectorScore ?? 0;
    const slowness = item.metrics.slownessIndex ?? 0;
    const current = canonicalByPhysical.get(physicalKey);
    if (
      current === undefined ||
      score > current.score ||
      (score === current.score && slowness > current.slowness) ||
      (score === current.score &&
        slowness === current.slowness &&
        item.identityKey.localeCompare(current.key) < 0)
    ) {
      canonicalByPhysical.set(physicalKey, { key: item.identityKey, score, slowness });
    }
  }

  const keys = new Set<string>([
    ...labelByKey.keys(),
    ...input.reviewItems.filter((item) => item.emitted).map((item) => item.identityKey),
  ]);

  const byBucket = emptyDetectorReadinessBucketCounts();
  let reviewedSuppressedCount = 0;
  let coverageSkippedCount = 0;
  let unreviewedSuppressedCoverageCount = 0;

  const items = [...keys].flatMap((key): SpeedPaceReadinessProjectionItem[] => {
    const label = labelByKey.get(key) ?? null;
    const item = itemByKey.get(key) ?? null;
    if (item === null && label === null) return [];
    const detectorId = item?.detectorId ?? label?.detectorId ?? "speed_pace_hotspot";
    const scopeId = item?.scopeId ?? label?.scopeId ?? "";
    const emitted = item?.emitted ?? false;
    const gates =
      item === null ? { pass: false, blockers: ["no_review_item"] } : speedPacePromotionGates(item);
    const physicalKey = item === null ? null : physicalKeyOf(item);
    const canonical =
      item !== null &&
      physicalKey !== null &&
      canonicalByPhysical.get(physicalKey)?.key === item.identityKey;

    const caveats = new Set<string>();
    for (const tag of label?.calibrationTags ?? []) caveats.add(tag);
    for (const blocker of gates.blockers) caveats.add(blocker);
    if (item?.capSuppressed === true) caveats.add("cap_suppressed");
    if (item !== null && item.duplicatePhysicalCount > 1 && !canonical) {
      caveats.add("duplicate_physical_scope");
    }

    let bucket: SpeedPaceReadinessBucket;
    if (label?.expectedFrontendUse === "suppress") {
      bucket = "suppressed";
      reviewedSuppressedCount += 1;
    } else if (!emitted) {
      // Reviewed-but-not-emitted (e.g. cap-suppressed control the reviewer wanted): review queue.
      bucket = "review_queue";
      coverageSkippedCount += 1;
      if (label === null) unreviewedSuppressedCoverageCount += 1;
    } else if (label?.expectedFrontendUse === "primary_finding") {
      if (gates.pass && canonical) bucket = "public_finding_candidate";
      else if (gates.pass && !canonical) bucket = "route_context";
      else bucket = "review_queue";
    } else if (label?.expectedFrontendUse === "route_context") {
      bucket = "route_context";
    } else if (
      label?.expectedFrontendUse === "reviewer_only" ||
      label?.expectedFrontendUse === "needs_more_evidence"
    ) {
      bucket = "review_queue";
    } else {
      // Emitted but unreviewed.
      bucket = "review_queue";
    }
    byBucket[bucket] += 1;

    return [
      {
        identityKey: key,
        detectorId,
        routeId: item?.routeId ?? label?.routeId ?? null,
        scopeId,
        segmentId: item?.segmentId ?? label?.segmentId ?? null,
        bucket,
        reviewedFrontendUse: label?.expectedFrontendUse ?? "unreviewed",
        emittedCandidate: emitted,
        promotionGatesPass: gates.pass,
        promotionBlockers: gates.blockers,
        canonicalForPhysicalScope: canonical,
        caveats: [...caveats].sort(),
      },
    ];
  });

  return {
    artifactKind: "speed_pace_readiness_projection",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: "speed_pace_hotspot",
    summary: {
      itemCount: items.length,
      byBucket,
      publicFindingCandidateCount: byBucket.public_finding_candidate,
      routeContextCount: byBucket.route_context,
      reviewQueueCount: byBucket.review_queue,
      suppressedCount: byBucket.suppressed,
      reviewedSuppressedCount,
      coverageSkippedCount,
      unreviewedSuppressedCoverageCount,
    },
    items: items.sort(
      (a, b) => a.bucket.localeCompare(b.bucket) || a.scopeId.localeCompare(b.scopeId),
    ),
  };
}

import {
  DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
  DELAY_CONCENTRATION_DETECTOR_ID,
  type DelayConcentrationThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `delay_concentration` detector (ADR-0018 Wave 1 #4).
//
// The March 2026 no-write inventory emits only 7 route-level candidates and the high-limit probe
// emits the same 7, so cap suppression is not the dominant risk. The queue instead pulls forward the
// detector's known calibration risks: routes just above the fleet outlier floor, routes with few
// eligible segments, concentration driven by one segment, and concentration readouts sensitive to the
// "6 of N" segment mix. It also samples clean/skipped route controls by borough.

export type DelayConcentrationReviewStratum =
  | "top_score"
  | "near_threshold"
  | "low_eligible_segments"
  | "segment_count_sensitive"
  | "single_segment_dominant"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type DelayConcentrationReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type DelayConcentrationReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type DelayConcentrationReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type DelayConcentrationTopSegmentReviewMetric = {
  readonly segmentId: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly direction: string | null;
  readonly excessDelayMin: number | null;
  readonly share: number | null;
  readonly weightedAverageSpeedMph: number | null;
};

export type DelayConcentrationReviewMetrics = {
  readonly hasSpeedData: boolean | null;
  readonly speedObservationCount: number | null;
  readonly segmentCount: number | null;
  readonly eligibleSegmentCount: number | null;
  readonly gini: number | null;
  readonly giniFleetPercentile: number | null;
  readonly delayFleetPercentile: number | null;
  readonly referenceSpeedMph: number | null;
  readonly referenceSpeedPercentile: number | null;
  readonly totalExcessDelayMin: number | null;
  readonly minSegmentsToReadoutShare: number | null;
  readonly readoutShare: number | null;
  readonly topSegmentsShare: number | null;
  readonly topSegmentCount: number | null;
  readonly topSegmentShare: number | null;
  readonly benchmarkRouteCount: number | null;
  readonly fleetMedianGini: number | null;
  readonly absoluteDelayFloor: number | null;
  readonly topSegments: readonly DelayConcentrationTopSegmentReviewMetric[];
};

export type DelayConcentrationReviewItem = {
  readonly detectorId: string;
  readonly scopeId: string;
  readonly identityKey: string;
  readonly candidateId: string | null;
  readonly routeId: string | null;
  readonly emitted: boolean;
  readonly rank: number | null;
  readonly detectorScore: number | null;
  readonly severity: string | null;
  readonly confidence: string | null;
  readonly claimText: string | null;
  readonly metrics: DelayConcentrationReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly lowEligibleSegments: boolean;
  readonly segmentCountSensitive: boolean;
  readonly singleSegmentDominant: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: DelayConcentrationReviewStratum;
  readonly selectedForReview: boolean;
};

export type DelayConcentrationReviewQueueArtifact = {
  readonly artifactKind: "delay_concentration_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof DELAY_CONCENTRATION_DETECTOR_ID;
  readonly thresholds: DelayConcentrationThresholds & {
    readonly productionCandidateLimit: number;
    readonly lowEligibleSegmentBuffer: number;
    readonly nearThresholdScore: number;
    readonly dominantSegmentShare: number;
    readonly segmentCountSensitiveReadoutSegments: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly lowEligibleSegmentCount: number;
    readonly segmentCountSensitiveCount: number;
    readonly singleSegmentDominantCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<DelayConcentrationReviewStratum, number>;
    readonly selectedByStratum: Record<DelayConcentrationReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly DelayConcentrationReviewItem[];
};

export type DelayConcentrationReviewStratumQuota = Partial<
  Record<DelayConcentrationReviewStratum, number>
>;

export type BuildDelayConcentrationReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly DelayConcentrationReviewCandidateLike[];
  readonly evidence: readonly DelayConcentrationReviewEvidenceLike[];
  readonly coverage: readonly DelayConcentrationReviewCoverageLike[];
  readonly thresholds?: Partial<DelayConcentrationThresholds>;
  readonly productionCandidateLimit?: number;
  readonly lowEligibleSegmentBuffer?: number;
  readonly nearThresholdScore?: number;
  readonly dominantSegmentShare?: number;
  readonly segmentCountSensitiveReadoutSegments?: number;
  readonly quota?: DelayConcentrationReviewStratumQuota;
};

const DEFAULT_PRODUCTION_CANDIDATE_LIMIT = 100;
const DEFAULT_LOW_ELIGIBLE_SEGMENT_BUFFER = 3;
const DEFAULT_NEAR_THRESHOLD_SCORE = 82;
const DEFAULT_DOMINANT_SEGMENT_SHARE = 0.5;
const DEFAULT_SEGMENT_COUNT_SENSITIVE_READOUT_SEGMENTS = 2;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<DelayConcentrationReviewStratum, number> = {
  top_score: 12,
  near_threshold: 8,
  low_eligible_segments: 8,
  segment_count_sensitive: 8,
  single_segment_dominant: 6,
  borough_spread: 10,
  cap_suppressed_control: 8,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<DelayConcentrationReviewItem, "stratum" | "selectedForReview">;
  readonly boroughPrefix: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function field(record: Record<string, unknown> | null | undefined, key: string): unknown {
  return record === null || record === undefined ? undefined : record[key];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mergeRecords(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (left === null && right === null) return null;
  return { ...(left ?? {}), ...(right ?? {}) };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCountRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function emptyStratumCounts(): Record<DelayConcentrationReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    low_eligible_segments: 0,
    segment_count_sensitive: 0,
    single_segment_dominant: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function topSegmentsFrom(
  value: unknown,
): readonly DelayConcentrationTopSegmentReviewMetric[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DelayConcentrationTopSegmentReviewMetric[] => {
    const record = asRecord(entry);
    if (record === null) return [];
    return [
      {
        segmentId: text(field(record, "segmentId")),
        from: text(field(record, "from")),
        to: text(field(record, "to")),
        direction: text(field(record, "direction")),
        excessDelayMin: num(field(record, "excessDelayMin")),
        share: num(field(record, "share")),
        weightedAverageSpeedMph: num(field(record, "weightedAverageSpeedMph")),
      },
    ];
  });
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): DelayConcentrationReviewMetrics {
  const topSegments = topSegmentsFrom(field(ref, "topSegments"));
  return {
    hasSpeedData: bool(field(ref, "hasSpeedData")),
    speedObservationCount: num(field(ref, "speedObservationCount")),
    segmentCount: num(field(ref, "segmentCount")),
    eligibleSegmentCount: num(field(ref, "eligibleSegmentCount")),
    gini: num(field(ref, "gini")),
    giniFleetPercentile: num(field(ref, "giniFleetPercentile")),
    delayFleetPercentile: num(field(ref, "delayFleetPercentile")),
    referenceSpeedMph: num(field(ref, "referenceSpeedMph")),
    referenceSpeedPercentile: num(field(ref, "referenceSpeedPercentile")),
    totalExcessDelayMin: num(field(ref, "totalExcessDelayMin")),
    minSegmentsToReadoutShare: num(field(ref, "minSegmentsToReadoutShare")),
    readoutShare: num(field(ref, "readoutShare")),
    topSegmentsShare: num(field(ref, "topSegmentsShare")),
    topSegmentCount: topSegments.length > 0 ? topSegments.length : null,
    topSegmentShare: topSegments[0]?.share ?? null,
    benchmarkRouteCount: num(field(ref, "benchmarkRouteCount")),
    fleetMedianGini: num(field(ref, "fleetMedianGini")),
    absoluteDelayFloor: num(field(ref, "absoluteDelayFloor")),
    topSegments,
  };
}

function priorityScore(item: Omit<DelayConcentrationReviewItem, "stratum" | "selectedForReview">) {
  if (item.detectorScore !== null) return item.detectorScore;
  if (item.metrics.giniFleetPercentile !== null) return item.metrics.giniFleetPercentile * 100;
  return item.metrics.gini ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const messages: string[] = [];
  const list = field(ref, "counterEvidence");
  if (Array.isArray(list)) {
    messages.push(
      ...list.filter((value): value is string => typeof value === "string" && value.length > 0),
    );
  }
  const limitation = text(field(ref, "limitation"));
  if (limitation !== null) messages.push(limitation);
  return messages;
}

export function buildDelayConcentrationReviewQueue(
  input: BuildDelayConcentrationReviewQueueInput,
): DelayConcentrationReviewQueueArtifact {
  const detectorThresholds: DelayConcentrationThresholds = {
    ...DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_PRODUCTION_CANDIDATE_LIMIT;
  const lowEligibleSegmentBuffer =
    input.lowEligibleSegmentBuffer ?? DEFAULT_LOW_ELIGIBLE_SEGMENT_BUFFER;
  const nearThresholdScore = input.nearThresholdScore ?? DEFAULT_NEAR_THRESHOLD_SCORE;
  const dominantSegmentShare = input.dominantSegmentShare ?? DEFAULT_DOMINANT_SEGMENT_SHARE;
  const segmentCountSensitiveReadoutSegments =
    input.segmentCountSensitiveReadoutSegments ??
    DEFAULT_SEGMENT_COUNT_SENSITIVE_READOUT_SEGMENTS;
  const quota = { ...DEFAULT_QUOTA, ...input.quota };

  const primaryRefByCandidate = new Map<string, Record<string, unknown>>();
  const counterRefByCandidate = new Map<string, Record<string, unknown>>();
  const counterByCandidate = new Map<string, string[]>();
  for (const link of input.evidence) {
    const candidateId = text(link.candidateId);
    if (candidateId === null) continue;
    const role = text(link.evidenceRole);
    const ref = asRecord(link.evidenceRef);
    if (ref === null) continue;
    if (role === "primary") primaryRefByCandidate.set(candidateId, ref);
    if (role === "counter_evidence") {
      counterRefByCandidate.set(candidateId, ref);
      counterByCandidate.set(candidateId, counterEvidenceMessages(ref));
    }
  }

  const emittedByKey = new Map<string, DelayConcentrationReviewCandidateLike>();
  for (const candidate of input.candidates) {
    const detectorId = text(candidate.detectorId);
    const scopeId = text(candidate.scopeId);
    if (detectorId === null || scopeId === null) continue;
    emittedByKey.set(detectorScopeIdentityKey({ detectorId, scopeId }), candidate);
  }
  const rankByKey = rankByDetectorScore(
    input.candidates.flatMap((candidate) => {
      const detectorId = text(candidate.detectorId);
      const scopeId = text(candidate.scopeId);
      return detectorId === null || scopeId === null
        ? []
        : [{ detectorId, scopeId, detectorScore: num(candidate.detectorScore) }];
    }),
  );

  const enriched: Enriched[] = input.coverage.flatMap((coverage): Enriched[] => {
    const detectorId = text(coverage.detectorId);
    const scopeId = text(coverage.scopeId);
    if (detectorId === null || scopeId === null) return [];
    const identityKey = detectorScopeIdentityKey({ detectorId, scopeId });
    const inputs = asRecord(coverage.inputsSeenJson);
    const candidate = emittedByKey.get(identityKey) ?? null;
    const emitted = candidate !== null;
    const candidateId = text(candidate?.candidateId);
    const primaryRef =
      candidateId === null ? null : (primaryRefByCandidate.get(candidateId) ?? null);
    const counterRef =
      candidateId === null ? null : (counterRefByCandidate.get(candidateId) ?? null);
    const ref = mergeRecords(mergeRecords(inputs, primaryRef), counterRef);
    const routeId =
      text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const metrics = reviewMetricsFrom(ref);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const lowEligibleSegments =
      emitted &&
      metrics.eligibleSegmentCount !== null &&
      metrics.eligibleSegmentCount <=
        detectorThresholds.minSegmentsForRoute + lowEligibleSegmentBuffer;
    const segmentCountSensitive =
      emitted &&
      ((metrics.minSegmentsToReadoutShare !== null &&
        metrics.minSegmentsToReadoutShare <= segmentCountSensitiveReadoutSegments) ||
        (metrics.eligibleSegmentCount !== null &&
          metrics.eligibleSegmentCount <=
            detectorThresholds.topSegmentsReadout + lowEligibleSegmentBuffer));
    const singleSegmentDominant =
      emitted &&
      metrics.topSegmentShare !== null &&
      metrics.topSegmentShare >= dominantSegmentShare;
    const outcome = text(coverage.outcome);

    return [
      {
        boroughPrefix: boroughPrefix(routeId),
        item: {
          detectorId,
          scopeId,
          identityKey,
          candidateId,
          routeId,
          emitted,
          rank,
          detectorScore: num(candidate?.detectorScore),
          severity: text(candidate?.severity),
          confidence: text(candidate?.confidence),
          claimText: text(candidate?.claimText),
          metrics,
          coverageOutcome: outcome,
          skipReasonCode: text(coverage.reasonCode),
          skipReason: text(coverage.reason),
          lowEligibleSegments,
          segmentCountSensitive,
          singleSegmentDominant,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): DelayConcentrationReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.lowEligibleSegments) return "low_eligible_segments";
    if (it.singleSegmentDominant) return "single_segment_dominant";
    if (it.segmentCountSensitive) return "segment_count_sensitive";
    const score = it.detectorScore ?? 0;
    if (score <= nearThresholdScore) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    DelayConcentrationReviewStratum,
    { entry: Enriched; stratum: DelayConcentrationReviewStratum }[]
  >();
  for (const row of withStratum) {
    const list = groups.get(row.stratum) ?? [];
    list.push(row);
    groups.set(row.stratum, list);
  }
  for (const [stratum, rows] of groups) {
    const limit = quota[stratum] ?? 0;
    const useBoroughSpread =
      stratum === "cap_suppressed_control" ||
      stratum === "clean_control" ||
      stratum === "skipped_control" ||
      stratum === "borough_spread";
    const sorted = [...rows].sort((left, right) => {
      const priorityCompare = priorityScore(right.entry.item) - priorityScore(left.entry.item);
      if (priorityCompare !== 0) return priorityCompare;
      return left.entry.item.scopeId.localeCompare(right.entry.item.scopeId);
    });
    const picked = useBoroughSpread
      ? roundRobinByBorough(sorted, limit, (row) => row.entry.boroughPrefix)
      : sorted.slice(0, limit);
    for (const row of picked) selectedKeys.add(row.entry.item.identityKey);
  }

  const byStratum = emptyStratumCounts();
  const selectedByStratum = emptyStratumCounts();
  const emittedByBoroughPrefix = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  const skippedByReasonCode = new Map<string, number>();
  let capSuppressedCount = 0;
  let lowEligibleSegmentCount = 0;
  let segmentCountSensitiveCount = 0;
  let singleSegmentDominantCount = 0;
  const items: DelayConcentrationReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) increment(emittedByBoroughPrefix, entry.boroughPrefix);
    if (entry.item.capSuppressed) {
      capSuppressedCount += 1;
      increment(capSuppressedByBoroughPrefix, entry.boroughPrefix);
    }
    if (entry.item.lowEligibleSegments) lowEligibleSegmentCount += 1;
    if (entry.item.segmentCountSensitive) segmentCountSensitiveCount += 1;
    if (entry.item.singleSegmentDominant) singleSegmentDominantCount += 1;
    if (
      entry.item.coverageOutcome === "skipped_missing_input" &&
      entry.item.skipReasonCode !== null
    ) {
      increment(skippedByReasonCode, entry.item.skipReasonCode);
    }
    return { ...entry.item, stratum, selectedForReview };
  });

  items.sort(
    (left, right) =>
      Number(right.selectedForReview) - Number(left.selectedForReview) ||
      left.stratum.localeCompare(right.stratum) ||
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      left.scopeId.localeCompare(right.scopeId),
  );

  return {
    artifactKind: "delay_concentration_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: DELAY_CONCENTRATION_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      lowEligibleSegmentBuffer,
      nearThresholdScore,
      dominantSegmentShare,
      segmentCountSensitiveReadoutSegments,
    },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
      lowEligibleSegmentCount,
      segmentCountSensitiveCount,
      singleSegmentDominantCount,
      selectedForReviewCount: items.filter((item) => item.selectedForReview).length,
      byStratum,
      selectedByStratum,
      emittedByBoroughPrefix: sortedCountRecord(emittedByBoroughPrefix),
      capSuppressedByBoroughPrefix: sortedCountRecord(capSuppressedByBoroughPrefix),
      skippedByReasonCode: sortedCountRecord(skippedByReasonCode),
    },
    items,
  };
}

import {
  DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  type PositiveDevianceThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `positive_deviance` detector (ADR-0018 step 2).
//
// The detector scores route/segment scopes that sit in the top performance decile versus matched
// peers, persistent across periods, and emits the top `candidateLimit` (default 100) by score. The
// 2026-03 no-write inventory emitted 48 candidates with no cap suppression at the high limit, so the
// review risk here is not the cap but peer construction: thin peer groups, fragile persistence (only
// the minimum number of qualifying periods), and segment-scope generalization. Reciprocal worst-
// practice metrics are a *skip* gate upstream, so they appear only in the skipped-control stratum, not
// among emitted candidates. Cap suppression is detected from score rank vs the production cap so the
// stratum stays meaningful if a future month emits past the cap.

export type PositiveDevianceReviewStratum =
  | "top_score"
  | "near_threshold"
  | "thin_peers"
  | "fragile_persistence"
  | "segment_scope"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type PositiveDevianceReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type PositiveDevianceReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type PositiveDevianceReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type PositiveDevianceReviewMetrics = {
  readonly scopeKind: string | null;
  readonly metricName: string | null;
  readonly peerGroupLabel: string | null;
  readonly peerCount: number | null;
  readonly periodCount: number | null;
  readonly qualifyingPeriodCount: number | null;
  readonly reciprocalMetricWarningCount: number | null;
};

export type PositiveDevianceReviewItem = {
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
  readonly metrics: PositiveDevianceReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly thinPeers: boolean;
  readonly fragilePersistence: boolean;
  readonly segmentScope: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: PositiveDevianceReviewStratum;
  readonly selectedForReview: boolean;
};

export type PositiveDevianceReviewQueueArtifact = {
  readonly artifactKind: "positive_deviance_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof POSITIVE_DEVIANCE_DETECTOR_ID;
  readonly thresholds: PositiveDevianceThresholds & {
    readonly productionCandidateLimit: number;
    readonly weakPeerCount: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<PositiveDevianceReviewStratum, number>;
    readonly selectedByStratum: Record<PositiveDevianceReviewStratum, number>;
    readonly emittedByScopeKind: Record<string, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly PositiveDevianceReviewItem[];
};

export type PositiveDevianceReviewStratumQuota = Partial<
  Record<PositiveDevianceReviewStratum, number>
>;

export type BuildPositiveDevianceReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly PositiveDevianceReviewCandidateLike[];
  readonly evidence: readonly PositiveDevianceReviewEvidenceLike[];
  readonly coverage: readonly PositiveDevianceReviewCoverageLike[];
  readonly thresholds?: Partial<PositiveDevianceThresholds>;
  readonly productionCandidateLimit?: number;
  readonly weakPeerCount?: number;
  readonly quota?: PositiveDevianceReviewStratumQuota;
};

const DEFAULT_WEAK_PEER_COUNT = 12;
const NEAR_THRESHOLD_SCORE = 66;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<PositiveDevianceReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  thin_peers: 10,
  fragile_persistence: 10,
  segment_scope: 8,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<PositiveDevianceReviewItem, "stratum" | "selectedForReview">;
  readonly boroughPrefix: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function emptyStratumCounts(): Record<PositiveDevianceReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    thin_peers: 0,
    fragile_persistence: 0,
    segment_scope: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): PositiveDevianceReviewMetrics {
  return {
    scopeKind: text(field(ref, "scopeKind")),
    metricName: text(field(ref, "metricName")),
    peerGroupLabel: text(field(ref, "peerGroupLabel")),
    peerCount: num(field(ref, "peerCount")),
    periodCount: num(field(ref, "periodCount")),
    qualifyingPeriodCount:
      num(field(ref, "qualifyingPeriodCount")) ?? arrayLength(field(ref, "qualifyingPeriods")),
    reciprocalMetricWarningCount: arrayLength(field(ref, "reciprocalMetricWarnings")),
  };
}

function priorityScore(item: Omit<PositiveDevianceReviewItem, "stratum" | "selectedForReview">) {
  return item.detectorScore ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const list = field(ref, "counterEvidence");
  if (!Array.isArray(list)) return [];
  return list.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function buildPositiveDevianceReviewQueue(
  input: BuildPositiveDevianceReviewQueueInput,
): PositiveDevianceReviewQueueArtifact {
  const detectorThresholds: PositiveDevianceThresholds = {
    ...DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.candidateLimit;
  const weakPeerCount = input.weakPeerCount ?? DEFAULT_WEAK_PEER_COUNT;
  const quota = { ...DEFAULT_QUOTA, ...input.quota };

  const primaryRefByCandidate = new Map<string, Record<string, unknown>>();
  const counterByCandidate = new Map<string, string[]>();
  for (const link of input.evidence) {
    const candidateId = text(link.candidateId);
    if (candidateId === null) continue;
    const role = text(link.evidenceRole);
    const ref = asRecord(link.evidenceRef);
    if (ref === null) continue;
    if (role === "primary") primaryRefByCandidate.set(candidateId, ref);
    if (role === "counter_evidence") counterByCandidate.set(candidateId, counterEvidenceMessages(ref));
  }

  const emittedByKey = new Map<string, PositiveDevianceReviewCandidateLike>();
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
    const evidenceRef = candidateId === null ? null : (primaryRefByCandidate.get(candidateId) ?? null);
    const ref = mergeRecords(inputs, evidenceRef);
    const routeId = text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const metrics = reviewMetricsFrom(ref);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const thinPeers = emitted && metrics.peerCount !== null && metrics.peerCount < weakPeerCount;
    const fragilePersistence =
      emitted &&
      metrics.qualifyingPeriodCount !== null &&
      metrics.qualifyingPeriodCount <= detectorThresholds.minStablePeriods;
    const segmentScope = emitted && metrics.scopeKind === "segment";
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
          thinPeers,
          fragilePersistence,
          segmentScope,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): PositiveDevianceReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.thinPeers) return "thin_peers";
    if (it.fragilePersistence) return "fragile_persistence";
    if (it.segmentScope) return "segment_scope";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    PositiveDevianceReviewStratum,
    { entry: Enriched; stratum: PositiveDevianceReviewStratum }[]
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
  const emittedByScopeKind = new Map<string, number>();
  const emittedByBoroughPrefix = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  const skippedByReasonCode = new Map<string, number>();
  let capSuppressedCount = 0;
  const items: PositiveDevianceReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) {
      increment(emittedByBoroughPrefix, entry.boroughPrefix);
      increment(emittedByScopeKind, entry.item.metrics.scopeKind ?? "unknown");
    }
    if (entry.item.capSuppressed) {
      capSuppressedCount += 1;
      increment(capSuppressedByBoroughPrefix, entry.boroughPrefix);
    }
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
    artifactKind: "positive_deviance_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: POSITIVE_DEVIANCE_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      weakPeerCount,
    },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
      selectedForReviewCount: items.filter((item) => item.selectedForReview).length,
      byStratum,
      selectedByStratum,
      emittedByScopeKind: sortedCountRecord(emittedByScopeKind),
      emittedByBoroughPrefix: sortedCountRecord(emittedByBoroughPrefix),
      capSuppressedByBoroughPrefix: sortedCountRecord(capSuppressedByBoroughPrefix),
      skippedByReasonCode: sortedCountRecord(skippedByReasonCode),
    },
    items,
  };
}

import {
  DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
  type MultiMonthSpeedPeerThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `multi_month_speed_peer` detector (ADR-0018 step 2).
//
// The detector flags routes whose multi-month average speed sits a deficit below their matched peer
// median, emitting the top `candidateLimit` (default 100) by score (55-100). The 2026-03 no-write
// inventory emitted 8 candidates with no cap suppression, so the dominant review risk is peer-group
// transparency (rankings invite methodology attacks): fallback peer groups (not the strong
// route-family-type[-spatial] method), thin observed months, and the reciprocal-metric (mph vs pace)
// and seasonal/service-pattern confounds. This queue surfaces those strata and samples cap-suppressed
// + borough-spread controls. Cap suppression is detected from score rank vs the production cap so the
// stratum stays meaningful if a future month emits past the cap.

export type MultiMonthSpeedPeerReviewStratum =
  | "top_score"
  | "near_threshold"
  | "fallback_peers"
  | "thin_months"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type MultiMonthSpeedPeerReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type MultiMonthSpeedPeerReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type MultiMonthSpeedPeerReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type MultiMonthSpeedPeerReviewMetrics = {
  readonly observedMonthCount: number | null;
  readonly averageSpeedMph: number | null;
  readonly averagePeerMedianSpeedMph: number | null;
  readonly averagePeerDeficitMph: number | null;
  readonly peerGroupMethods: readonly string[];
  readonly hasStrongPeerGroup: boolean;
};

export type MultiMonthSpeedPeerReviewItem = {
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
  readonly metrics: MultiMonthSpeedPeerReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly fallbackPeers: boolean;
  readonly thinMonths: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: MultiMonthSpeedPeerReviewStratum;
  readonly selectedForReview: boolean;
};

export type MultiMonthSpeedPeerReviewQueueArtifact = {
  readonly artifactKind: "multi_month_speed_peer_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof MULTI_MONTH_SPEED_PEER_DETECTOR_ID;
  readonly thresholds: MultiMonthSpeedPeerThresholds & {
    readonly productionCandidateLimit: number;
    readonly thinMonthCount: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<MultiMonthSpeedPeerReviewStratum, number>;
    readonly selectedByStratum: Record<MultiMonthSpeedPeerReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly MultiMonthSpeedPeerReviewItem[];
};

export type MultiMonthSpeedPeerReviewStratumQuota = Partial<
  Record<MultiMonthSpeedPeerReviewStratum, number>
>;

export type BuildMultiMonthSpeedPeerReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly MultiMonthSpeedPeerReviewCandidateLike[];
  readonly evidence: readonly MultiMonthSpeedPeerReviewEvidenceLike[];
  readonly coverage: readonly MultiMonthSpeedPeerReviewCoverageLike[];
  readonly thresholds?: Partial<MultiMonthSpeedPeerThresholds>;
  readonly productionCandidateLimit?: number;
  readonly thinMonthCount?: number;
  readonly quota?: MultiMonthSpeedPeerReviewStratumQuota;
};

const STRONG_PEER_GROUP_METHODS: ReadonlySet<string> = new Set([
  "route_family_type_spatial",
  "route_family_type",
]);
const DEFAULT_THIN_MONTH_COUNT = 6;
const NEAR_THRESHOLD_SCORE = 64;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<MultiMonthSpeedPeerReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  fallback_peers: 12,
  thin_months: 10,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<MultiMonthSpeedPeerReviewItem, "stratum" | "selectedForReview">;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCountRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function emptyStratumCounts(): Record<MultiMonthSpeedPeerReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    fallback_peers: 0,
    thin_months: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): MultiMonthSpeedPeerReviewMetrics {
  const peerGroupMethods = stringArray(field(ref, "peerGroupMethods"));
  const hasStrongPeerGroup =
    peerGroupMethods.length > 0 &&
    peerGroupMethods.every((method) => STRONG_PEER_GROUP_METHODS.has(method));
  return {
    observedMonthCount: num(field(ref, "observedMonthCount")),
    averageSpeedMph: num(field(ref, "averageSpeedMph")),
    averagePeerMedianSpeedMph: num(field(ref, "averagePeerMedianSpeedMph")),
    averagePeerDeficitMph: num(field(ref, "averagePeerDeficitMph")),
    peerGroupMethods,
    hasStrongPeerGroup,
  };
}

function priorityScore(item: Omit<MultiMonthSpeedPeerReviewItem, "stratum" | "selectedForReview">) {
  if (item.detectorScore !== null) return item.detectorScore;
  return item.metrics.averagePeerDeficitMph ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const messages: string[] = [];
  const limitation = text(field(ref, "limitation"));
  if (limitation !== null) messages.push(limitation);
  const description = text(field(ref, "peerGroupDescription"));
  if (description !== null) messages.push(description);
  return messages;
}

export function buildMultiMonthSpeedPeerReviewQueue(
  input: BuildMultiMonthSpeedPeerReviewQueueInput,
): MultiMonthSpeedPeerReviewQueueArtifact {
  const detectorThresholds: MultiMonthSpeedPeerThresholds = {
    ...DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS.candidateLimit;
  const thinMonthCount = input.thinMonthCount ?? DEFAULT_THIN_MONTH_COUNT;
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
    if (role === "counter_evidence")
      counterByCandidate.set(candidateId, counterEvidenceMessages(ref));
  }

  const emittedByKey = new Map<string, MultiMonthSpeedPeerReviewCandidateLike>();
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
    const evidenceRef =
      candidateId === null ? null : (primaryRefByCandidate.get(candidateId) ?? null);
    const ref = mergeRecords(inputs, evidenceRef);
    const routeId =
      text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const metrics = reviewMetricsFrom(ref);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const fallbackPeers =
      emitted && metrics.peerGroupMethods.length > 0 && !metrics.hasStrongPeerGroup;
    const thinMonths =
      emitted && metrics.observedMonthCount !== null && metrics.observedMonthCount < thinMonthCount;
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
          fallbackPeers,
          thinMonths,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): MultiMonthSpeedPeerReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.fallbackPeers) return "fallback_peers";
    if (it.thinMonths) return "thin_months";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    MultiMonthSpeedPeerReviewStratum,
    { entry: Enriched; stratum: MultiMonthSpeedPeerReviewStratum }[]
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
  const items: MultiMonthSpeedPeerReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) increment(emittedByBoroughPrefix, entry.boroughPrefix);
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
    artifactKind: "multi_month_speed_peer_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      thinMonthCount,
    },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
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

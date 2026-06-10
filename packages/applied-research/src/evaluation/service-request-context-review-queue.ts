import {
  DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  type ServiceRequestContextThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `service_request_context` detector (ADR-0018 step 2).
//
// Wave 4 family adaptation (associational context). The detector flags slow route-months that coincide
// with substantial 311 service-request context, emitting the top `candidateLimit` (default 100) by
// score (55-100). The 2026-03 inventory emitted 27 with no cap suppression. 311 complaints are broad
// street-condition context and carry reporting bias — so `primary_finding` is rare by design and the
// review focus is association strength: route-LION fanout, low match weight, and thin high-confidence
// touch support (plus the complaint-type allowlist + borough/route-length normalization the ideal-doc
// 311 promotion path calls for). This queue surfaces those risk strata (read from the 311 context in
// coverage/evidence) and samples borough-spread controls. Cap suppression is detected from score rank
// vs the production cap.

export type ServiceRequestContextReviewStratum =
  | "top_score"
  | "near_threshold"
  | "high_route_fanout"
  | "low_match_weight"
  | "thin_high_confidence_touches"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type ServiceRequestContextReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type ServiceRequestContextReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type ServiceRequestContextReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type ServiceRequestContextReviewMetrics = {
  readonly routeWeightedAverageSpeedMph: number | null;
  readonly maxHotspotScore: number | null;
  readonly touchedEventCount: number | null;
  readonly averageMatchWeight: number | null;
  readonly maxRouteFanout: number | null;
  readonly highConfidenceTouchCount: number | null;
  readonly eventKinds: readonly string[];
};

export type ServiceRequestContextReviewItem = {
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
  readonly metrics: ServiceRequestContextReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly highRouteFanout: boolean;
  readonly lowMatchWeight: boolean;
  readonly thinHighConfidenceTouches: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: ServiceRequestContextReviewStratum;
  readonly selectedForReview: boolean;
};

export type ServiceRequestContextReviewQueueArtifact = {
  readonly artifactKind: "service_request_context_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof SERVICE_REQUEST_CONTEXT_DETECTOR_ID;
  readonly thresholds: ServiceRequestContextThresholds & {
    readonly productionCandidateLimit: number;
    readonly highRouteFanout: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<ServiceRequestContextReviewStratum, number>;
    readonly selectedByStratum: Record<ServiceRequestContextReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly ServiceRequestContextReviewItem[];
};

export type ServiceRequestContextReviewStratumQuota = Partial<
  Record<ServiceRequestContextReviewStratum, number>
>;

export type BuildServiceRequestContextReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly ServiceRequestContextReviewCandidateLike[];
  readonly evidence: readonly ServiceRequestContextReviewEvidenceLike[];
  readonly coverage: readonly ServiceRequestContextReviewCoverageLike[];
  readonly thresholds?: Partial<ServiceRequestContextThresholds>;
  readonly productionCandidateLimit?: number;
  readonly highRouteFanout?: number;
  readonly quota?: ServiceRequestContextReviewStratumQuota;
};

const DEFAULT_HIGH_ROUTE_FANOUT = 25;
const NEAR_THRESHOLD_SCORE = 62;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<ServiceRequestContextReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  high_route_fanout: 12,
  low_match_weight: 12,
  thin_high_confidence_touches: 10,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<ServiceRequestContextReviewItem, "stratum" | "selectedForReview">;
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

function emptyStratumCounts(): Record<ServiceRequestContextReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    high_route_fanout: 0,
    low_match_weight: 0,
    thin_high_confidence_touches: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(
  ref: Record<string, unknown> | null,
): ServiceRequestContextReviewMetrics {
  const ctx = asRecord(field(ref, "serviceRequestContext"));
  return {
    routeWeightedAverageSpeedMph: num(field(ref, "routeWeightedAverageSpeedMph")),
    maxHotspotScore: num(field(ref, "maxHotspotScore")),
    touchedEventCount: num(field(ctx, "touchedEventCount")),
    averageMatchWeight: num(field(ctx, "averageMatchWeight")),
    maxRouteFanout: num(field(ctx, "maxRouteFanout")),
    highConfidenceTouchCount: num(field(ctx, "highConfidenceTouchCount")),
    eventKinds: stringArray(field(ctx, "eventKinds")),
  };
}

function priorityScore(
  item: Omit<ServiceRequestContextReviewItem, "stratum" | "selectedForReview">,
) {
  if (item.detectorScore !== null) return item.detectorScore;
  return item.metrics.touchedEventCount ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const limitation = text(field(ref, "limitation"));
  return limitation === null ? [] : [limitation];
}

export function buildServiceRequestContextReviewQueue(
  input: BuildServiceRequestContextReviewQueueInput,
): ServiceRequestContextReviewQueueArtifact {
  const detectorThresholds: ServiceRequestContextThresholds = {
    ...DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS.candidateLimit;
  const highRouteFanout = input.highRouteFanout ?? DEFAULT_HIGH_ROUTE_FANOUT;
  const quota = { ...DEFAULT_QUOTA, ...input.quota };

  const primaryRefByCandidate = new Map<string, Record<string, unknown>>();
  const counterByCandidate = new Map<string, string[]>();
  for (const link of input.evidence) {
    const candidateId = text(link.candidateId);
    if (candidateId === null) continue;
    const role = text(link.evidenceRole);
    const ref = asRecord(link.evidenceRef);
    if (ref === null) continue;
    // The 311 context lives on the `context`/`counter_evidence` evidence; the primary carries only the
    // speed signal. Merge whichever refs carry the serviceRequestContext so the metrics resolve for
    // emitted rows even before the coverage inputs are consulted.
    if (role === "primary" || role === "context") {
      primaryRefByCandidate.set(
        candidateId,
        mergeRecords(primaryRefByCandidate.get(candidateId) ?? null, ref) ?? ref,
      );
    }
    if (role === "counter_evidence") {
      counterByCandidate.set(candidateId, counterEvidenceMessages(ref));
      primaryRefByCandidate.set(
        candidateId,
        mergeRecords(primaryRefByCandidate.get(candidateId) ?? null, ref) ?? ref,
      );
    }
  }

  const emittedByKey = new Map<string, ServiceRequestContextReviewCandidateLike>();
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
    const highRouteFanoutFlag =
      emitted && metrics.maxRouteFanout !== null && metrics.maxRouteFanout >= highRouteFanout;
    const lowMatchWeightFlag =
      emitted &&
      metrics.averageMatchWeight !== null &&
      metrics.averageMatchWeight < detectorThresholds.minAverageMatchWeight;
    const thinHighConfidenceTouches =
      emitted &&
      metrics.highConfidenceTouchCount !== null &&
      metrics.highConfidenceTouchCount <
        detectorThresholds.minServiceRequestHighConfidenceTouchCount;
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
          highRouteFanout: highRouteFanoutFlag,
          lowMatchWeight: lowMatchWeightFlag,
          thinHighConfidenceTouches,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): ServiceRequestContextReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.highRouteFanout) return "high_route_fanout";
    if (it.lowMatchWeight) return "low_match_weight";
    if (it.thinHighConfidenceTouches) return "thin_high_confidence_touches";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    ServiceRequestContextReviewStratum,
    { entry: Enriched; stratum: ServiceRequestContextReviewStratum }[]
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
  const items: ServiceRequestContextReviewItem[] = withStratum.map(({ entry, stratum }) => {
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
    artifactKind: "service_request_context_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      highRouteFanout,
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

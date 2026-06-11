import {
  DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
  type TravelTimeVariabilityThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `travel_time_variability` detector (ADR-0018 step 2).
//
// The route-direction-daypart detector emits the top-100 cells by buffer index (P95-vs-P50 spread).
// That global cap can hide both cap-suppressed cells (qualify but rank past 100) and the review risks
// the spec calls out: incident-driven P95 outliers, thin observed-trip support, and service-pattern
// breaks that make the spread non-comparable. This queue enriches a no-write run, stratifies those
// risks, and samples cap-suppressed + borough-spread controls before reviewed-gold labels are written.
// Cap suppression is computed directly from coverage inputs because clean_no_hit rows carry P50/P95.

export type TravelTimeVariabilityReviewStratum =
  | "top_score"
  | "near_threshold"
  | "low_trip_support"
  | "incident_outlier_suspect"
  | "service_pattern_caveat"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type TravelTimeVariabilityReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type TravelTimeVariabilityReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type TravelTimeVariabilityReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type TravelTimeVariabilityReviewMetrics = {
  readonly observedRuntimeP50Minutes: number | null;
  readonly observedRuntimeP95Minutes: number | null;
  readonly bufferIndex: number | null;
  readonly observedTripCount: number | null;
  readonly servicePatternVersion: string | null;
  readonly direction: string | null;
  readonly daypart: string | null;
};

export type TravelTimeVariabilityReviewItem = {
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
  readonly metrics: TravelTimeVariabilityReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly lowTripSupport: boolean;
  readonly incidentOutlierSuspect: boolean;
  readonly servicePatternCaveat: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: TravelTimeVariabilityReviewStratum;
  readonly selectedForReview: boolean;
};

export type TravelTimeVariabilityReviewQueueArtifact = {
  readonly artifactKind: "travel_time_variability_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof TRAVEL_TIME_VARIABILITY_DETECTOR_ID;
  readonly thresholds: TravelTimeVariabilityThresholds & {
    readonly weakTripSupport: number;
    readonly incidentBufferIndexFloor: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<TravelTimeVariabilityReviewStratum, number>;
    readonly selectedByStratum: Record<TravelTimeVariabilityReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly TravelTimeVariabilityReviewItem[];
};

export type TravelTimeVariabilityReviewStratumQuota = Partial<
  Record<TravelTimeVariabilityReviewStratum, number>
>;

export type BuildTravelTimeVariabilityReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly TravelTimeVariabilityReviewCandidateLike[];
  readonly evidence: readonly TravelTimeVariabilityReviewEvidenceLike[];
  readonly coverage: readonly TravelTimeVariabilityReviewCoverageLike[];
  readonly thresholds?: Partial<TravelTimeVariabilityThresholds>;
  readonly weakTripSupport?: number;
  readonly incidentBufferIndexFloor?: number;
  readonly quota?: TravelTimeVariabilityReviewStratumQuota;
};

const DEFAULT_WEAK_TRIP_SUPPORT = 45;
const DEFAULT_INCIDENT_BUFFER_INDEX_FLOOR = 1;
const NEAR_THRESHOLD_SCORE = 66;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<TravelTimeVariabilityReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  low_trip_support: 8,
  incident_outlier_suspect: 8,
  service_pattern_caveat: 6,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<TravelTimeVariabilityReviewItem, "stratum" | "selectedForReview">;
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

function emptyStratumCounts(): Record<TravelTimeVariabilityReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    low_trip_support: 0,
    incident_outlier_suspect: 0,
    service_pattern_caveat: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function computeBufferIndex(p50: number | null, p95: number | null): number | null {
  if (p50 === null || p95 === null) return null;
  if (!Number.isFinite(p50) || p50 <= 0) return null;
  if (!Number.isFinite(p95) || p95 < p50) return null;
  return (p95 - p50) / p50;
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): TravelTimeVariabilityReviewMetrics {
  const p50 = num(field(ref, "observedRuntimeP50Minutes"));
  const p95 = num(field(ref, "observedRuntimeP95Minutes"));
  return {
    observedRuntimeP50Minutes: p50,
    observedRuntimeP95Minutes: p95,
    bufferIndex: num(field(ref, "bufferIndex")) ?? computeBufferIndex(p50, p95),
    observedTripCount: num(field(ref, "observedTripCount")),
    servicePatternVersion: text(field(ref, "servicePatternVersion")),
    direction: text(field(ref, "direction")),
    daypart: text(field(ref, "daypart")),
  };
}

function qualifiesTravelTimeVariability(
  metrics: TravelTimeVariabilityReviewMetrics,
  thresholds: TravelTimeVariabilityThresholds,
): boolean {
  return (
    metrics.observedTripCount !== null &&
    metrics.observedTripCount >= thresholds.minObservedTrips &&
    metrics.bufferIndex !== null &&
    metrics.bufferIndex >= thresholds.minBufferIndex
  );
}

function priorityScore(item: Omit<TravelTimeVariabilityReviewItem, "stratum" | "selectedForReview">) {
  if (item.detectorScore !== null) return item.detectorScore;
  return (item.metrics.bufferIndex ?? 0) * 100;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const list = field(ref, "counterEvidence");
  if (!Array.isArray(list)) return [];
  return list.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function buildTravelTimeVariabilityReviewQueue(
  input: BuildTravelTimeVariabilityReviewQueueInput,
): TravelTimeVariabilityReviewQueueArtifact {
  const detectorThresholds: TravelTimeVariabilityThresholds = {
    ...DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const weakTripSupport = input.weakTripSupport ?? DEFAULT_WEAK_TRIP_SUPPORT;
  const incidentBufferIndexFloor =
    input.incidentBufferIndexFloor ?? DEFAULT_INCIDENT_BUFFER_INDEX_FLOOR;
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

  const emittedByKey = new Map<string, TravelTimeVariabilityReviewCandidateLike>();
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
    const lowTripSupport =
      metrics.observedTripCount !== null && metrics.observedTripCount < weakTripSupport;
    const incidentOutlierSuspect =
      metrics.bufferIndex !== null && metrics.bufferIndex >= incidentBufferIndexFloor;
    const servicePatternCaveat = emitted && metrics.servicePatternVersion === null;
    const outcome = text(coverage.outcome);
    const capSuppressed =
      !emitted &&
      outcome === "clean_no_hit" &&
      qualifiesTravelTimeVariability(metrics, detectorThresholds);

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
          rank: rankByKey.get(identityKey) ?? null,
          detectorScore: num(candidate?.detectorScore),
          severity: text(candidate?.severity),
          confidence: text(candidate?.confidence),
          claimText: text(candidate?.claimText),
          metrics,
          coverageOutcome: outcome,
          skipReasonCode: text(coverage.reasonCode),
          skipReason: text(coverage.reason),
          lowTripSupport,
          incidentOutlierSuspect,
          servicePatternCaveat,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): TravelTimeVariabilityReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      if (it.coverageOutcome !== "clean_no_hit") return "skipped_control";
      return it.capSuppressed ? "cap_suppressed_control" : "clean_control";
    }
    if (it.incidentOutlierSuspect) return "incident_outlier_suspect";
    if (it.lowTripSupport) return "low_trip_support";
    if (it.servicePatternCaveat) return "service_pattern_caveat";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    TravelTimeVariabilityReviewStratum,
    { entry: Enriched; stratum: TravelTimeVariabilityReviewStratum }[]
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
  const items: TravelTimeVariabilityReviewItem[] = withStratum.map(({ entry, stratum }) => {
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
    artifactKind: "travel_time_variability_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      weakTripSupport,
      incidentBufferIndexFloor,
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

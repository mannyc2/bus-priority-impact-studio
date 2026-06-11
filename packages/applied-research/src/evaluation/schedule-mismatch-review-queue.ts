import {
  DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  type ScheduleMismatchThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `schedule_mismatch` detector (ADR-0018 step 2).
//
// The route-direction-daypart detector emits the top-100 cells by absolute runtime deviation and
// carries two reason classes: `schedule_too_tight` (observed slower than scheduled) and
// `schedule_padding_review` (observed faster — possible padding). The global top-100 cap suppresses
// most qualifying cells, and the padding class is structurally rarer, so an unstratified queue would
// review almost only the tight class. This queue enriches a no-write run, forces the padding class
// into review, surfaces thin-support and service-pattern caveats, and samples cap-suppressed +
// borough-spread controls. Cap suppression is computed from coverage inputs (scheduled + observed
// median + trips) because clean_no_hit rows carry them.

export type ScheduleMismatchReviewStratum =
  | "top_score"
  | "near_threshold"
  | "padding_review"
  | "thin_trip_support"
  | "service_pattern_caveat"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type ScheduleMismatchReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly reasonCode?: unknown;
  readonly claimText?: unknown;
};

export type ScheduleMismatchReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type ScheduleMismatchReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type ScheduleMismatchReviewMetrics = {
  readonly scheduledRuntimeMinutes: number | null;
  readonly observedRuntimeP50Minutes: number | null;
  readonly signedPercent: number | null;
  readonly absoluteSignedPercent: number | null;
  readonly observedTripCount: number | null;
  readonly servicePatternVersion: string | null;
  readonly direction: string | null;
  readonly daypart: string | null;
};

export type ScheduleMismatchReviewItem = {
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
  readonly reasonCode: string | null;
  readonly claimText: string | null;
  readonly metrics: ScheduleMismatchReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly paddingReview: boolean;
  readonly thinTripSupport: boolean;
  readonly servicePatternCaveat: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: ScheduleMismatchReviewStratum;
  readonly selectedForReview: boolean;
};

export type ScheduleMismatchReviewQueueArtifact = {
  readonly artifactKind: "schedule_mismatch_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof SCHEDULE_MISMATCH_DETECTOR_ID;
  readonly thresholds: ScheduleMismatchThresholds & {
    readonly weakTripSupport: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<ScheduleMismatchReviewStratum, number>;
    readonly selectedByStratum: Record<ScheduleMismatchReviewStratum, number>;
    readonly emittedByReasonCode: Record<string, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly ScheduleMismatchReviewItem[];
};

export type ScheduleMismatchReviewStratumQuota = Partial<
  Record<ScheduleMismatchReviewStratum, number>
>;

export type BuildScheduleMismatchReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly ScheduleMismatchReviewCandidateLike[];
  readonly evidence: readonly ScheduleMismatchReviewEvidenceLike[];
  readonly coverage: readonly ScheduleMismatchReviewCoverageLike[];
  readonly thresholds?: Partial<ScheduleMismatchThresholds>;
  readonly weakTripSupport?: number;
  readonly quota?: ScheduleMismatchReviewStratumQuota;
};

const DEFAULT_WEAK_TRIP_SUPPORT = 20;
const NEAR_THRESHOLD_SCORE = 66;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<ScheduleMismatchReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  padding_review: 12,
  thin_trip_support: 8,
  service_pattern_caveat: 6,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<ScheduleMismatchReviewItem, "stratum" | "selectedForReview">;
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

function emptyStratumCounts(): Record<ScheduleMismatchReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    padding_review: 0,
    thin_trip_support: 0,
    service_pattern_caveat: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function signedPercentFrom(
  scheduled: number | null,
  observedP50: number | null,
): number | null {
  if (scheduled === null || observedP50 === null) return null;
  if (!Number.isFinite(scheduled) || scheduled <= 0) return null;
  if (!Number.isFinite(observedP50)) return null;
  return observedP50 / scheduled - 1;
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): ScheduleMismatchReviewMetrics {
  const scheduled = num(field(ref, "scheduledRuntimeMinutes"));
  const observedP50 = num(field(ref, "observedRuntimeP50Minutes"));
  const signedPercent = num(field(ref, "signedPercent")) ?? signedPercentFrom(scheduled, observedP50);
  return {
    scheduledRuntimeMinutes: scheduled,
    observedRuntimeP50Minutes: observedP50,
    signedPercent,
    absoluteSignedPercent: signedPercent === null ? null : Math.abs(signedPercent),
    observedTripCount: num(field(ref, "observedTripCount")),
    servicePatternVersion: text(field(ref, "servicePatternVersion")),
    direction: text(field(ref, "direction")),
    daypart: text(field(ref, "daypart")),
  };
}

function qualifiesScheduleMismatch(
  metrics: ScheduleMismatchReviewMetrics,
  thresholds: ScheduleMismatchThresholds,
): boolean {
  return (
    metrics.observedTripCount !== null &&
    metrics.observedTripCount >= thresholds.minObservedTrips &&
    metrics.absoluteSignedPercent !== null &&
    metrics.absoluteSignedPercent >= thresholds.minAbsoluteSignedPercent
  );
}

function priorityScore(item: Omit<ScheduleMismatchReviewItem, "stratum" | "selectedForReview">) {
  if (item.detectorScore !== null) return item.detectorScore;
  return (item.metrics.absoluteSignedPercent ?? 0) * 100;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const list = field(ref, "counterEvidence");
  if (!Array.isArray(list)) return [];
  return list.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function buildScheduleMismatchReviewQueue(
  input: BuildScheduleMismatchReviewQueueInput,
): ScheduleMismatchReviewQueueArtifact {
  const detectorThresholds: ScheduleMismatchThresholds = {
    ...DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const weakTripSupport = input.weakTripSupport ?? DEFAULT_WEAK_TRIP_SUPPORT;
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

  const emittedByKey = new Map<string, ScheduleMismatchReviewCandidateLike>();
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
    const reasonCode = text(candidate?.reasonCode);
    const paddingReview = reasonCode === "schedule_padding_review";
    const thinTripSupport =
      metrics.observedTripCount !== null && metrics.observedTripCount < weakTripSupport;
    const servicePatternCaveat = emitted && metrics.servicePatternVersion === null;
    const outcome = text(coverage.outcome);
    const capSuppressed =
      !emitted &&
      outcome === "clean_no_hit" &&
      qualifiesScheduleMismatch(metrics, detectorThresholds);

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
          reasonCode,
          claimText: text(candidate?.claimText),
          metrics,
          coverageOutcome: outcome,
          skipReasonCode: text(coverage.reasonCode),
          skipReason: text(coverage.reason),
          paddingReview,
          thinTripSupport,
          servicePatternCaveat,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): ScheduleMismatchReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      if (it.coverageOutcome !== "clean_no_hit") return "skipped_control";
      return it.capSuppressed ? "cap_suppressed_control" : "clean_control";
    }
    if (it.paddingReview) return "padding_review";
    if (it.thinTripSupport) return "thin_trip_support";
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
    ScheduleMismatchReviewStratum,
    { entry: Enriched; stratum: ScheduleMismatchReviewStratum }[]
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
  const emittedByReasonCode = new Map<string, number>();
  const emittedByBoroughPrefix = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  const skippedByReasonCode = new Map<string, number>();
  let capSuppressedCount = 0;
  const items: ScheduleMismatchReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) {
      increment(emittedByBoroughPrefix, entry.boroughPrefix);
      increment(emittedByReasonCode, entry.item.reasonCode ?? "unknown");
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
    artifactKind: "schedule_mismatch_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: SCHEDULE_MISMATCH_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      weakTripSupport,
    },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
      selectedForReviewCount: items.filter((item) => item.selectedForReview).length,
      byStratum,
      selectedByStratum,
      emittedByReasonCode: sortedCountRecord(emittedByReasonCode),
      emittedByBoroughPrefix: sortedCountRecord(emittedByBoroughPrefix),
      capSuppressedByBoroughPrefix: sortedCountRecord(capSuppressedByBoroughPrefix),
      skippedByReasonCode: sortedCountRecord(skippedByReasonCode),
    },
    items,
  };
}

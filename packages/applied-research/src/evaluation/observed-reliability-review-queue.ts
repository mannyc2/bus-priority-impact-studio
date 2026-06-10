import {
  DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  type ObservedReliabilityThresholds,
} from "@bp/analytics";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `observed_reliability` detector (ADR-0018 step 2).
//
// The route-month detector is intentionally conservative, but its top-100 cap and route-level
// aggregation can still hide review risk. This queue enriches emitted candidates and controls from a
// no-write run, surfaces low-support/corroboration strata, and explicitly samples cap-suppressed
// route-month controls before reviewed-gold labels are written.

export type ObservedReliabilityReviewStratum =
  | "top_score"
  | "near_threshold"
  | "low_gtfs_rt_samples"
  | "weak_schedule_baseline"
  | "weak_bwa_support"
  | "bwa_conflict"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type ObservedReliabilityReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type ObservedReliabilityReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type ObservedReliabilityReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type ObservedReliabilityReviewMetrics = {
  readonly reliabilityStatus: string | null;
  readonly sampleCount: number | null;
  readonly minSampleThreshold: number | null;
  readonly observedLongGapShare: number | null;
  readonly waitReliabilityRatio: number | null;
  readonly excessWaitMinutes: number | null;
  readonly scheduledBaselineHeadwaySampleCount: number | null;
  readonly busWaitAssessmentTripCount: number | null;
  readonly busWaitAssessment: number | null;
};

export type ObservedReliabilityReviewItem = {
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
  readonly metrics: ObservedReliabilityReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly lowGtfsRtSamples: boolean;
  readonly weakScheduleBaseline: boolean;
  readonly weakBusWaitAssessmentSupport: boolean;
  readonly busWaitAssessmentConflict: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: ObservedReliabilityReviewStratum;
  readonly selectedForReview: boolean;
};

export type ObservedReliabilityReviewQueueArtifact = {
  readonly artifactKind: "observed_reliability_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof OBSERVED_RELIABILITY_DETECTOR_ID;
  readonly thresholds: ObservedReliabilityThresholds & {
    readonly lowGtfsRtSampleCount: number;
    readonly weakScheduledBaselineSamples: number;
    readonly weakBusWaitAssessmentTrips: number;
    readonly busWaitAssessmentConflictFloor: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<ObservedReliabilityReviewStratum, number>;
    readonly selectedByStratum: Record<ObservedReliabilityReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly ObservedReliabilityReviewItem[];
};

export type ObservedReliabilityReviewStratumQuota = Partial<
  Record<ObservedReliabilityReviewStratum, number>
>;

export type BuildObservedReliabilityReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly ObservedReliabilityReviewCandidateLike[];
  readonly evidence: readonly ObservedReliabilityReviewEvidenceLike[];
  readonly coverage: readonly ObservedReliabilityReviewCoverageLike[];
  readonly thresholds?: Partial<ObservedReliabilityThresholds>;
  readonly lowGtfsRtSampleCount?: number;
  readonly weakScheduledBaselineSamples?: number;
  readonly weakBusWaitAssessmentTrips?: number;
  readonly busWaitAssessmentConflictFloor?: number;
  readonly quota?: ObservedReliabilityReviewStratumQuota;
};

const DEFAULT_LOW_GTFS_RT_SAMPLE_COUNT = 500;
const DEFAULT_WEAK_SCHEDULED_BASELINE_SAMPLES = 2;
const DEFAULT_WEAK_BUS_WAIT_ASSESSMENT_TRIPS = 5;
const DEFAULT_BUS_WAIT_ASSESSMENT_CONFLICT_FLOOR = 0.7;
const NEAR_THRESHOLD_SCORE = 72;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<ObservedReliabilityReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  low_gtfs_rt_samples: 8,
  weak_schedule_baseline: 6,
  weak_bwa_support: 8,
  bwa_conflict: 8,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<ObservedReliabilityReviewItem, "stratum" | "selectedForReview">;
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

function boroughPrefix(routeId: string | null): string {
  if (routeId === null) return "unknown";
  const match = routeId.match(/^[A-Za-z]+/);
  return match === null ? "unknown" : match[0].toUpperCase();
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCountRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function emptyStratumCounts(): Record<ObservedReliabilityReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    low_gtfs_rt_samples: 0,
    weak_schedule_baseline: 0,
    weak_bwa_support: 0,
    bwa_conflict: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): ObservedReliabilityReviewMetrics {
  return {
    reliabilityStatus: text(field(ref, "reliabilityStatus")),
    sampleCount: num(field(ref, "sampleCount")),
    minSampleThreshold: num(field(ref, "minSampleThreshold")),
    observedLongGapShare: num(field(ref, "observedLongGapShare")),
    waitReliabilityRatio: num(field(ref, "waitReliabilityRatio")),
    excessWaitMinutes: num(field(ref, "excessWaitMinutes")),
    scheduledBaselineHeadwaySampleCount: num(field(ref, "scheduledBaselineHeadwaySampleCount")),
    busWaitAssessmentTripCount: num(field(ref, "busWaitAssessmentTripCount")),
    busWaitAssessment: num(field(ref, "busWaitAssessment")),
  };
}

function qualifiesObservedReliability(
  metrics: ObservedReliabilityReviewMetrics,
  thresholds: ObservedReliabilityThresholds,
): boolean {
  if (metrics.reliabilityStatus !== null && metrics.reliabilityStatus !== "observed") return false;
  return (
    metrics.sampleCount !== null &&
    metrics.sampleCount >= thresholds.minGtfsRtHeadwaySamples &&
    metrics.scheduledBaselineHeadwaySampleCount !== null &&
    metrics.scheduledBaselineHeadwaySampleCount >= thresholds.minScheduledBaselineSamples &&
    metrics.busWaitAssessmentTripCount !== null &&
    metrics.busWaitAssessmentTripCount >= thresholds.minBusWaitAssessmentTrips &&
    metrics.observedLongGapShare !== null &&
    metrics.observedLongGapShare >= thresholds.minObservedLongGapShare &&
    metrics.waitReliabilityRatio !== null &&
    metrics.waitReliabilityRatio >= thresholds.minWaitReliabilityRatio &&
    metrics.busWaitAssessment !== null &&
    metrics.busWaitAssessment <= thresholds.maxBusWaitAssessment
  );
}

function priorityScore(item: Omit<ObservedReliabilityReviewItem, "stratum" | "selectedForReview">) {
  if (item.detectorScore !== null) return item.detectorScore;
  return (
    (item.metrics.observedLongGapShare ?? 0) * 100 +
    (item.metrics.waitReliabilityRatio ?? 0) * 10 -
    (item.metrics.busWaitAssessment ?? 1)
  );
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  if (ref === null) return [];
  const limitation = text(field(ref, "limitation"));
  const messages: string[] = [];
  if (limitation !== null) messages.push(limitation);
  const sampleCount = num(field(ref, "sampleCount"));
  const configuredMinGtfsRtHeadwaySamples = num(field(ref, "configuredMinGtfsRtHeadwaySamples"));
  if (sampleCount !== null && configuredMinGtfsRtHeadwaySamples !== null) {
    messages.push(`GTFS-RT headway samples: ${sampleCount}/${configuredMinGtfsRtHeadwaySamples}`);
  }
  const scheduledBaselineHeadwaySampleCount = num(
    field(ref, "scheduledBaselineHeadwaySampleCount"),
  );
  const configuredMinScheduledBaselineSamples = num(
    field(ref, "configuredMinScheduledBaselineSamples"),
  );
  if (
    scheduledBaselineHeadwaySampleCount !== null &&
    configuredMinScheduledBaselineSamples !== null
  ) {
    messages.push(
      `Scheduled-baseline samples: ${scheduledBaselineHeadwaySampleCount}/${configuredMinScheduledBaselineSamples}`,
    );
  }
  const busWaitAssessmentTripCount = num(field(ref, "busWaitAssessmentTripCount"));
  const configuredMinBusWaitAssessmentTrips = num(field(ref, "configuredMinBusWaitAssessmentTrips"));
  if (busWaitAssessmentTripCount !== null && configuredMinBusWaitAssessmentTrips !== null) {
    messages.push(`BWA trips: ${busWaitAssessmentTripCount}/${configuredMinBusWaitAssessmentTrips}`);
  }
  return messages;
}

export function buildObservedReliabilityReviewQueue(
  input: BuildObservedReliabilityReviewQueueInput,
): ObservedReliabilityReviewQueueArtifact {
  const detectorThresholds: ObservedReliabilityThresholds = {
    ...DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const lowGtfsRtSampleCount =
    input.lowGtfsRtSampleCount ?? DEFAULT_LOW_GTFS_RT_SAMPLE_COUNT;
  const weakScheduledBaselineSamples =
    input.weakScheduledBaselineSamples ?? DEFAULT_WEAK_SCHEDULED_BASELINE_SAMPLES;
  const weakBusWaitAssessmentTrips =
    input.weakBusWaitAssessmentTrips ?? DEFAULT_WEAK_BUS_WAIT_ASSESSMENT_TRIPS;
  const busWaitAssessmentConflictFloor =
    input.busWaitAssessmentConflictFloor ?? DEFAULT_BUS_WAIT_ASSESSMENT_CONFLICT_FLOOR;
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
    if (role === "counter_evidence") {
      counterByCandidate.set(candidateId, counterEvidenceMessages(ref));
    }
  }

  const emittedByKey = new Map<string, ObservedReliabilityReviewCandidateLike>();
  for (const candidate of input.candidates) {
    const detectorId = text(candidate.detectorId);
    const scopeId = text(candidate.scopeId);
    if (detectorId === null || scopeId === null) continue;
    emittedByKey.set(detectorScopeIdentityKey({ detectorId, scopeId }), candidate);
  }
  const rankByKey = new Map<string, number>();
  [...input.candidates]
    .map((candidate) => ({
      key: detectorScopeIdentityKey({
        detectorId: text(candidate.detectorId) ?? "",
        scopeId: text(candidate.scopeId) ?? "",
      }),
      score: num(candidate.detectorScore) ?? 0,
      scopeId: text(candidate.scopeId) ?? "",
    }))
    .sort((left, right) => right.score - left.score || left.scopeId.localeCompare(right.scopeId))
    .forEach((entry, index) => {
      rankByKey.set(entry.key, index + 1);
    });

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
    const lowGtfsRtSamples =
      metrics.sampleCount !== null && metrics.sampleCount < lowGtfsRtSampleCount;
    const weakScheduleBaseline =
      metrics.scheduledBaselineHeadwaySampleCount !== null &&
      metrics.scheduledBaselineHeadwaySampleCount < weakScheduledBaselineSamples;
    const weakBusWaitAssessmentSupport =
      metrics.busWaitAssessmentTripCount !== null &&
      metrics.busWaitAssessmentTripCount < weakBusWaitAssessmentTrips;
    const busWaitAssessmentConflict =
      metrics.busWaitAssessment !== null &&
      metrics.busWaitAssessment >= busWaitAssessmentConflictFloor &&
      metrics.busWaitAssessment <= detectorThresholds.maxBusWaitAssessment;
    const outcome = text(coverage.outcome);
    const capSuppressed =
      !emitted &&
      outcome === "clean_no_hit" &&
      qualifiesObservedReliability(metrics, detectorThresholds);

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
          lowGtfsRtSamples,
          weakScheduleBaseline,
          weakBusWaitAssessmentSupport,
          busWaitAssessmentConflict,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): ObservedReliabilityReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      if (it.coverageOutcome !== "clean_no_hit") return "skipped_control";
      return it.capSuppressed ? "cap_suppressed_control" : "clean_control";
    }
    if (it.lowGtfsRtSamples) return "low_gtfs_rt_samples";
    if (it.weakScheduleBaseline) return "weak_schedule_baseline";
    if (it.weakBusWaitAssessmentSupport) return "weak_bwa_support";
    if (it.busWaitAssessmentConflict) return "bwa_conflict";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    ObservedReliabilityReviewStratum,
    { entry: Enriched; stratum: ObservedReliabilityReviewStratum }[]
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
    const picked = useBoroughSpread ? roundRobinByBorough(sorted, limit) : sorted.slice(0, limit);
    for (const row of picked) selectedKeys.add(row.entry.item.identityKey);
  }

  const byStratum = emptyStratumCounts();
  const selectedByStratum = emptyStratumCounts();
  const emittedByBoroughPrefix = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  const skippedByReasonCode = new Map<string, number>();
  let capSuppressedCount = 0;
  const items: ObservedReliabilityReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) increment(emittedByBoroughPrefix, entry.boroughPrefix);
    if (entry.item.capSuppressed) {
      capSuppressedCount += 1;
      increment(capSuppressedByBoroughPrefix, entry.boroughPrefix);
    }
    if (entry.item.coverageOutcome === "skipped_missing_input" && entry.item.skipReasonCode !== null) {
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
    artifactKind: "observed_reliability_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      lowGtfsRtSampleCount,
      weakScheduledBaselineSamples,
      weakBusWaitAssessmentTrips,
      busWaitAssessmentConflictFloor,
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

function roundRobinByBorough(
  sorted: { entry: Enriched; stratum: ObservedReliabilityReviewStratum }[],
  limit: number,
): { entry: Enriched; stratum: ObservedReliabilityReviewStratum }[] {
  if (limit <= 0) return [];
  const byBorough = new Map<
    string,
    { entry: Enriched; stratum: ObservedReliabilityReviewStratum }[]
  >();
  for (const row of sorted) {
    const list = byBorough.get(row.entry.boroughPrefix) ?? [];
    list.push(row);
    byBorough.set(row.entry.boroughPrefix, list);
  }
  const boroughs = [...byBorough.keys()].sort((left, right) => left.localeCompare(right));
  const picked: { entry: Enriched; stratum: ObservedReliabilityReviewStratum }[] = [];
  let round = 0;
  while (picked.length < limit) {
    let added = false;
    for (const borough of boroughs) {
      const list = byBorough.get(borough);
      const row = list === undefined ? undefined : list[round];
      if (row === undefined) continue;
      picked.push(row);
      added = true;
      if (picked.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return picked;
}

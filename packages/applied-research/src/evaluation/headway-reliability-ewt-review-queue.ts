import {
  DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  type HeadwayReliabilityEwtThresholds,
} from "@bp/analytics";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `headway_reliability_ewt` detector (ADR-0018 step 2).
//
// The detector scores stop-direction-hour cells and emits only the top `candidateLimit` (default 100)
// by score. The 2026-03 no-write inventory found 1,698 cells above the emission threshold, so the
// production cap suppresses ~94% of qualifying cells and skews emission toward a few high-EWT route
// prefixes (Q3 express / Staten Island in the top-100 sample). This queue is therefore built from a
// HIGH-LIMIT run (e.g. `--candidate-limit 20000`) so the cap-suppressed population carries its
// computed EWT/LoS evidence. Cap suppression is detected from score rank vs the production cap, not
// from coverage rows — non-emitted clean_no_hit cells do not carry the computed excess-wait/LoS
// metrics in their coverage payload.

export type HeadwayReliabilityEwtReviewStratum =
  | "top_score"
  | "near_threshold"
  | "thin_headway_samples"
  | "borderline_frequency"
  | "extreme_variability"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type HeadwayReliabilityEwtReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type HeadwayReliabilityEwtReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type HeadwayReliabilityEwtReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type HeadwayReliabilityEwtReviewMetrics = {
  readonly stopId: string | null;
  readonly stopName: string | null;
  readonly direction: string | null;
  readonly localHour: number | null;
  readonly excessWaitTimeMinutes: number | null;
  readonly averageWaitTimeMinutes: number | null;
  readonly scheduledWaitTimeMinutes: number | null;
  readonly coefficientOfVariation: number | null;
  readonly los: string | null;
  readonly observedHeadwayCount: number | null;
  readonly scheduledBusesPerHour: number | null;
  readonly scheduledHeadwayMinutes: number | null;
};

export type HeadwayReliabilityEwtReviewItem = {
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
  readonly metrics: HeadwayReliabilityEwtReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly thinHeadwaySamples: boolean;
  readonly borderlineFrequency: boolean;
  readonly extremeVariability: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: HeadwayReliabilityEwtReviewStratum;
  readonly selectedForReview: boolean;
};

export type HeadwayReliabilityEwtReviewQueueArtifact = {
  readonly artifactKind: "headway_reliability_ewt_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof HEADWAY_RELIABILITY_EWT_DETECTOR_ID;
  readonly thresholds: HeadwayReliabilityEwtThresholds & {
    readonly productionCandidateLimit: number;
    readonly thinHeadwaySampleCount: number;
    readonly borderlineBusesPerHour: number;
    readonly extremeVariabilityLos: string;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<HeadwayReliabilityEwtReviewStratum, number>;
    readonly selectedByStratum: Record<HeadwayReliabilityEwtReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly HeadwayReliabilityEwtReviewItem[];
};

export type HeadwayReliabilityEwtReviewStratumQuota = Partial<
  Record<HeadwayReliabilityEwtReviewStratum, number>
>;

export type BuildHeadwayReliabilityEwtReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly HeadwayReliabilityEwtReviewCandidateLike[];
  readonly evidence: readonly HeadwayReliabilityEwtReviewEvidenceLike[];
  readonly coverage: readonly HeadwayReliabilityEwtReviewCoverageLike[];
  readonly thresholds?: Partial<HeadwayReliabilityEwtThresholds>;
  readonly productionCandidateLimit?: number;
  readonly thinHeadwaySampleCount?: number;
  readonly borderlineBusesPerHour?: number;
  readonly extremeVariabilityLos?: string;
  readonly quota?: HeadwayReliabilityEwtReviewStratumQuota;
};

const HEADWAY_LOS_RANK: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
const NEAR_THRESHOLD_SCORE = 84;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<HeadwayReliabilityEwtReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  thin_headway_samples: 10,
  borderline_frequency: 8,
  extreme_variability: 10,
  borough_spread: 12,
  cap_suppressed_control: 16,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<HeadwayReliabilityEwtReviewItem, "stratum" | "selectedForReview">;
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
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function emptyStratumCounts(): Record<HeadwayReliabilityEwtReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    thin_headway_samples: 0,
    borderline_frequency: 0,
    extreme_variability: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(
  ref: Record<string, unknown> | null,
): HeadwayReliabilityEwtReviewMetrics {
  return {
    stopId: text(field(ref, "stopId")),
    stopName: text(field(ref, "stopName")),
    direction: text(field(ref, "direction")),
    localHour: num(field(ref, "localHour")),
    excessWaitTimeMinutes: num(field(ref, "excessWaitTimeMinutes")),
    averageWaitTimeMinutes: num(field(ref, "averageWaitTimeMinutes")),
    scheduledWaitTimeMinutes: num(field(ref, "scheduledWaitTimeMinutes")),
    coefficientOfVariation: num(field(ref, "coefficientOfVariation")),
    los: text(field(ref, "los")),
    observedHeadwayCount: num(field(ref, "observedHeadwayCount")),
    scheduledBusesPerHour: num(field(ref, "scheduledBusesPerHour")),
    scheduledHeadwayMinutes: num(field(ref, "scheduledHeadwayMinutes")),
  };
}

function priorityScore(
  item: Omit<HeadwayReliabilityEwtReviewItem, "stratum" | "selectedForReview">,
): number {
  if (item.detectorScore !== null) return item.detectorScore;
  return item.metrics.excessWaitTimeMinutes ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  if (ref === null) return [];
  const messages: string[] = [];
  const counter = field(ref, "counterEvidence");
  if (Array.isArray(counter)) {
    for (const entry of counter) {
      const value = text(entry);
      if (value !== null) messages.push(value);
    }
  }
  return messages;
}

export function buildHeadwayReliabilityEwtReviewQueue(
  input: BuildHeadwayReliabilityEwtReviewQueueInput,
): HeadwayReliabilityEwtReviewQueueArtifact {
  const detectorThresholds: HeadwayReliabilityEwtThresholds = {
    ...DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS.candidateLimit;
  const thinHeadwaySampleCount =
    input.thinHeadwaySampleCount ?? detectorThresholds.highConfidenceHeadways;
  const borderlineBusesPerHour =
    input.borderlineBusesPerHour ?? detectorThresholds.minScheduledBusesPerHour + 1;
  const extremeVariabilityLos = input.extremeVariabilityLos ?? "F";
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

  const emittedByKey = new Map<string, HeadwayReliabilityEwtReviewCandidateLike>();
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

  const extremeRank = HEADWAY_LOS_RANK[extremeVariabilityLos] ?? 6;

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
    const routeId = text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const metrics = reviewMetricsFrom(ref);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const thinHeadwaySamples =
      emitted &&
      metrics.observedHeadwayCount !== null &&
      metrics.observedHeadwayCount < thinHeadwaySampleCount;
    const borderlineFrequency =
      emitted &&
      metrics.scheduledBusesPerHour !== null &&
      metrics.scheduledBusesPerHour < borderlineBusesPerHour;
    const extremeVariability =
      emitted && metrics.los !== null && (HEADWAY_LOS_RANK[metrics.los] ?? 0) >= extremeRank;
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
          thinHeadwaySamples,
          borderlineFrequency,
          extremeVariability,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): HeadwayReliabilityEwtReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.extremeVariability) return "extreme_variability";
    if (it.thinHeadwaySamples) return "thin_headway_samples";
    if (it.borderlineFrequency) return "borderline_frequency";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    HeadwayReliabilityEwtReviewStratum,
    { entry: Enriched; stratum: HeadwayReliabilityEwtReviewStratum }[]
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
  const items: HeadwayReliabilityEwtReviewItem[] = withStratum.map(({ entry, stratum }) => {
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
    artifactKind: "headway_reliability_ewt_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      thinHeadwaySampleCount,
      borderlineBusesPerHour,
      extremeVariabilityLos,
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
  sorted: { entry: Enriched; stratum: HeadwayReliabilityEwtReviewStratum }[],
  limit: number,
): { entry: Enriched; stratum: HeadwayReliabilityEwtReviewStratum }[] {
  if (limit <= 0) return [];
  const byBorough = new Map<
    string,
    { entry: Enriched; stratum: HeadwayReliabilityEwtReviewStratum }[]
  >();
  for (const row of sorted) {
    const list = byBorough.get(row.entry.boroughPrefix) ?? [];
    list.push(row);
    byBorough.set(row.entry.boroughPrefix, list);
  }
  const boroughs = [...byBorough.keys()].sort((left, right) => left.localeCompare(right));
  const picked: { entry: Enriched; stratum: HeadwayReliabilityEwtReviewStratum }[] = [];
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

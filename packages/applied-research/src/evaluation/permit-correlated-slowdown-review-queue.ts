import {
  DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  type PermitCorrelatedSlowdownThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `permit_correlated_slowdown` detector (ADR-0018 step 2).
//
// Wave 4 family adaptation (associational context). The detector flags slow route-months that
// coincide with substantial DOT permit touches, emitting the top `candidateLimit` (default 100) by
// score (60-100). The 2026-03 inventory emitted 28 with no cap suppression. Permit touches are broad
// street-work context, not causal evidence — so `primary_finding` is rare by design and the review
// focus is association strength: route-LION fanout (a permit touching many routes is weak), low match
// weight, and temporal alignment. This queue surfaces the `high_route_fanout` and `low_match_weight`
// risk strata (read from the counter-evidence permit-context) and samples borough-spread controls. Cap
// suppression is detected from score rank vs the production cap.

export type PermitCorrelatedSlowdownReviewStratum =
  | "top_score"
  | "near_threshold"
  | "high_route_fanout"
  | "low_match_weight"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type PermitCorrelatedSlowdownReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type PermitCorrelatedSlowdownReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type PermitCorrelatedSlowdownReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type PermitCorrelatedSlowdownReviewMetrics = {
  readonly routeWeightedAverageSpeedMph: number | null;
  readonly maxHotspotScore: number | null;
  readonly permitTouchedEventCount: number | null;
  readonly averageMatchWeight: number | null;
  readonly maxRouteFanout: number | null;
  readonly highConfidenceTouchCount: number | null;
};

export type PermitCorrelatedSlowdownReviewItem = {
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
  readonly metrics: PermitCorrelatedSlowdownReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly highRouteFanout: boolean;
  readonly lowMatchWeight: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: PermitCorrelatedSlowdownReviewStratum;
  readonly selectedForReview: boolean;
};

export type PermitCorrelatedSlowdownReviewQueueArtifact = {
  readonly artifactKind: "permit_correlated_slowdown_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID;
  readonly thresholds: PermitCorrelatedSlowdownThresholds & {
    readonly productionCandidateLimit: number;
    readonly highRouteFanout: number;
    readonly lowMatchWeight: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<PermitCorrelatedSlowdownReviewStratum, number>;
    readonly selectedByStratum: Record<PermitCorrelatedSlowdownReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly PermitCorrelatedSlowdownReviewItem[];
};

export type PermitCorrelatedSlowdownReviewStratumQuota = Partial<
  Record<PermitCorrelatedSlowdownReviewStratum, number>
>;

export type BuildPermitCorrelatedSlowdownReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly PermitCorrelatedSlowdownReviewCandidateLike[];
  readonly evidence: readonly PermitCorrelatedSlowdownReviewEvidenceLike[];
  readonly coverage: readonly PermitCorrelatedSlowdownReviewCoverageLike[];
  readonly thresholds?: Partial<PermitCorrelatedSlowdownThresholds>;
  readonly productionCandidateLimit?: number;
  readonly highRouteFanout?: number;
  readonly lowMatchWeight?: number;
  readonly quota?: PermitCorrelatedSlowdownReviewStratumQuota;
};

const DEFAULT_HIGH_ROUTE_FANOUT = 25;
const DEFAULT_LOW_MATCH_WEIGHT = 0.5;
const NEAR_THRESHOLD_SCORE = 66;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<PermitCorrelatedSlowdownReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  high_route_fanout: 12,
  low_match_weight: 12,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<PermitCorrelatedSlowdownReviewItem, "stratum" | "selectedForReview">;
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
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function emptyStratumCounts(): Record<PermitCorrelatedSlowdownReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    high_route_fanout: 0,
    low_match_weight: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(
  featureRef: Record<string, unknown> | null,
  permitCtx: Record<string, unknown> | null,
): PermitCorrelatedSlowdownReviewMetrics {
  return {
    routeWeightedAverageSpeedMph: num(field(featureRef, "routeWeightedAverageSpeedMph")),
    maxHotspotScore: num(field(featureRef, "maxHotspotScore")),
    permitTouchedEventCount: num(field(featureRef, "permitTouchedEventCount")),
    averageMatchWeight: num(field(permitCtx, "averageMatchWeight")),
    maxRouteFanout:
      num(field(permitCtx, "maxRouteFanout")) ?? num(field(featureRef, "permitRouteCount")),
    highConfidenceTouchCount: num(field(permitCtx, "highConfidenceTouchCount")),
  };
}

function priorityScore(
  item: Omit<PermitCorrelatedSlowdownReviewItem, "stratum" | "selectedForReview">,
) {
  if (item.detectorScore !== null) return item.detectorScore;
  return item.metrics.permitTouchedEventCount ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const limitation = text(field(ref, "limitation"));
  return limitation === null ? [] : [limitation];
}

export function buildPermitCorrelatedSlowdownReviewQueue(
  input: BuildPermitCorrelatedSlowdownReviewQueueInput,
): PermitCorrelatedSlowdownReviewQueueArtifact {
  const detectorThresholds: PermitCorrelatedSlowdownThresholds = {
    ...DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS.candidateLimit;
  const highRouteFanout = input.highRouteFanout ?? DEFAULT_HIGH_ROUTE_FANOUT;
  const lowMatchWeight = input.lowMatchWeight ?? DEFAULT_LOW_MATCH_WEIGHT;
  const quota = { ...DEFAULT_QUOTA, ...input.quota };

  const primaryRefByCandidate = new Map<string, Record<string, unknown>>();
  const permitContextByCandidate = new Map<string, Record<string, unknown>>();
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
      const permitCtx = asRecord(field(ref, "permitContext"));
      if (permitCtx !== null) permitContextByCandidate.set(candidateId, permitCtx);
    }
  }

  const emittedByKey = new Map<string, PermitCorrelatedSlowdownReviewCandidateLike>();
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
    const permitCtx =
      candidateId === null ? null : (permitContextByCandidate.get(candidateId) ?? null);
    const ref = mergeRecords(inputs, evidenceRef);
    const routeId =
      text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const metrics = reviewMetricsFrom(ref, permitCtx);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const highRouteFanoutFlag =
      emitted && metrics.maxRouteFanout !== null && metrics.maxRouteFanout >= highRouteFanout;
    const lowMatchWeightFlag =
      emitted && metrics.averageMatchWeight !== null && metrics.averageMatchWeight < lowMatchWeight;
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
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): PermitCorrelatedSlowdownReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.highRouteFanout) return "high_route_fanout";
    if (it.lowMatchWeight) return "low_match_weight";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    PermitCorrelatedSlowdownReviewStratum,
    { entry: Enriched; stratum: PermitCorrelatedSlowdownReviewStratum }[]
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
  const items: PermitCorrelatedSlowdownReviewItem[] = withStratum.map(({ entry, stratum }) => {
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
    artifactKind: "permit_correlated_slowdown_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      highRouteFanout,
      lowMatchWeight,
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

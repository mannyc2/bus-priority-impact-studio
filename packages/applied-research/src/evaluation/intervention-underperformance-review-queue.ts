import {
  DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  type InterventionUnderperformanceThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `intervention_underperformance` detector (ADR-0018 step 2).
//
// Wave 3 (intervention family, highest claim risk). The detector flags high-pain routes whose
// evaluated bus-priority treatment has a non-positive peer-adjusted speed delta, emitting the top
// `candidateLimit` (default 100) by score (~85-100). The 2026-03 inventory emitted 28 candidates with
// no cap suppression, so the dominant review risk is peer-adjustment validity (thin comparison peers,
// route-change/window confounds) and treatment-evidence honesty ("missing date ≠ no intervention":
// thin/undated treatment source refs). This queue surfaces those strata and samples cap-suppressed +
// borough-spread controls. Cap suppression is detected from score rank vs the production cap.

export type InterventionUnderperformanceReviewStratum =
  | "top_score"
  | "near_threshold"
  | "thin_comparison_peers"
  | "thin_treatment_evidence"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type InterventionUnderperformanceReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type InterventionUnderperformanceReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type InterventionUnderperformanceReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type InterventionUnderperformanceReviewMetrics = {
  readonly speedPainScore: number | null;
  readonly adjustedSpeedDeltaMph: number | null;
  readonly comparisonRouteCount: number | null;
  readonly routeTreatmentEvidenceCount: number | null;
  readonly treatmentSourceRefCount: number | null;
};

export type InterventionUnderperformanceReviewItem = {
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
  readonly metrics: InterventionUnderperformanceReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly thinComparisonPeers: boolean;
  readonly thinTreatmentEvidence: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: InterventionUnderperformanceReviewStratum;
  readonly selectedForReview: boolean;
};

export type InterventionUnderperformanceReviewQueueArtifact = {
  readonly artifactKind: "intervention_underperformance_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID;
  readonly thresholds: InterventionUnderperformanceThresholds & {
    readonly productionCandidateLimit: number;
    readonly strongComparisonRouteCount: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<InterventionUnderperformanceReviewStratum, number>;
    readonly selectedByStratum: Record<InterventionUnderperformanceReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly InterventionUnderperformanceReviewItem[];
};

export type InterventionUnderperformanceReviewStratumQuota = Partial<
  Record<InterventionUnderperformanceReviewStratum, number>
>;

export type BuildInterventionUnderperformanceReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly InterventionUnderperformanceReviewCandidateLike[];
  readonly evidence: readonly InterventionUnderperformanceReviewEvidenceLike[];
  readonly coverage: readonly InterventionUnderperformanceReviewCoverageLike[];
  readonly thresholds?: Partial<InterventionUnderperformanceThresholds>;
  readonly productionCandidateLimit?: number;
  readonly strongComparisonRouteCount?: number;
  readonly quota?: InterventionUnderperformanceReviewStratumQuota;
};

const DEFAULT_STRONG_COMPARISON_ROUTE_COUNT = 3;
const NEAR_THRESHOLD_SCORE = 88;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<InterventionUnderperformanceReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  thin_comparison_peers: 12,
  thin_treatment_evidence: 12,
  borough_spread: 10,
  cap_suppressed_control: 12,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<InterventionUnderperformanceReviewItem, "stratum" | "selectedForReview">;
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

function emptyStratumCounts(): Record<InterventionUnderperformanceReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    thin_comparison_peers: 0,
    thin_treatment_evidence: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(
  ref: Record<string, unknown> | null,
): InterventionUnderperformanceReviewMetrics {
  return {
    speedPainScore: num(field(ref, "speedPainScore")),
    adjustedSpeedDeltaMph: num(field(ref, "adjustedSpeedDeltaMph")),
    comparisonRouteCount:
      num(field(ref, "comparisonRouteCount")) ?? num(field(ref, "selectedComparisonRouteCount")),
    routeTreatmentEvidenceCount: num(field(ref, "routeTreatmentEvidenceCount")),
    treatmentSourceRefCount: num(field(ref, "treatmentSourceRefCount")),
  };
}

function priorityScore(
  item: Omit<InterventionUnderperformanceReviewItem, "stratum" | "selectedForReview">,
) {
  if (item.detectorScore !== null) return item.detectorScore;
  return item.metrics.speedPainScore ?? 0;
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const limitation = text(field(ref, "limitation"));
  return limitation === null ? [] : [limitation];
}

export function buildInterventionUnderperformanceReviewQueue(
  input: BuildInterventionUnderperformanceReviewQueueInput,
): InterventionUnderperformanceReviewQueueArtifact {
  const detectorThresholds: InterventionUnderperformanceThresholds = {
    ...DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ??
    DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS.candidateLimit;
  const strongComparisonRouteCount =
    input.strongComparisonRouteCount ?? DEFAULT_STRONG_COMPARISON_ROUTE_COUNT;
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

  const emittedByKey = new Map<string, InterventionUnderperformanceReviewCandidateLike>();
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
    const thinComparisonPeers =
      emitted &&
      metrics.comparisonRouteCount !== null &&
      metrics.comparisonRouteCount < strongComparisonRouteCount;
    const thinTreatmentEvidence =
      emitted && (metrics.treatmentSourceRefCount === null || metrics.treatmentSourceRefCount <= 0);
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
          thinComparisonPeers,
          thinTreatmentEvidence,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): InterventionUnderperformanceReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.thinComparisonPeers) return "thin_comparison_peers";
    if (it.thinTreatmentEvidence) return "thin_treatment_evidence";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    InterventionUnderperformanceReviewStratum,
    { entry: Enriched; stratum: InterventionUnderperformanceReviewStratum }[]
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
  const items: InterventionUnderperformanceReviewItem[] = withStratum.map(({ entry, stratum }) => {
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
    artifactKind: "intervention_underperformance_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      strongComparisonRouteCount,
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

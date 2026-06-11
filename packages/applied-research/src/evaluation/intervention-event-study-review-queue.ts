import {
  DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  type InterventionEventStudyThresholds,
} from "@bp/analytics";
import { boroughPrefix, rankByDetectorScore, roundRobinByBorough } from "./cap-policy";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `intervention_event_study` detector (ADR-0018 step 2).
//
// Wave 3 family adaptation (candidate-causal). The detector scores treated-scope intervention panels
// by absolute event-study effect + methodology-gate pass, emitting the top `candidateLimit` (default
// 100) by score. The 2026-03 inventory emitted 100 at the cap while 236 qualify, so cap suppression is
// REAL here. Calibration is "labeling panel quality, not effect truth": the key review axis is the
// methodology gates (control eligibility, pre-trend, placebo-in-time/space, autocorrelation, method
// divergence). This queue forces the gate-pass class into review, surfaces pre-trend/placebo and
// method-divergence risk classes, and samples cap-suppressed + borough-spread controls. Cap
// suppression is detected from score rank vs the production cap.

export type InterventionEventStudyReviewStratum =
  | "top_score"
  | "near_threshold"
  | "gate_pass"
  | "pretrend_or_placebo_risk"
  | "method_divergence"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type InterventionEventStudyReviewCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type InterventionEventStudyReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type InterventionEventStudyReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type InterventionEventStudyReviewMetrics = {
  readonly interventionType: string | null;
  readonly eventStudyEstimate: number | null;
  readonly controlScopeCount: number | null;
  readonly associationallyScoreable: boolean | null;
  readonly candidateCausalEligible: boolean | null;
  readonly blockingReasons: readonly string[];
};

export type InterventionEventStudyReviewItem = {
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
  readonly metrics: InterventionEventStudyReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly gatePass: boolean;
  readonly pretrendOrPlaceboRisk: boolean;
  readonly methodDivergence: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: InterventionEventStudyReviewStratum;
  readonly selectedForReview: boolean;
};

export type InterventionEventStudyReviewQueueArtifact = {
  readonly artifactKind: "intervention_event_study_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof INTERVENTION_EVENT_STUDY_DETECTOR_ID;
  readonly thresholds: InterventionEventStudyThresholds & {
    readonly productionCandidateLimit: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<InterventionEventStudyReviewStratum, number>;
    readonly selectedByStratum: Record<InterventionEventStudyReviewStratum, number>;
    readonly emittedByGateStatus: Record<string, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly InterventionEventStudyReviewItem[];
};

export type InterventionEventStudyReviewStratumQuota = Partial<
  Record<InterventionEventStudyReviewStratum, number>
>;

export type BuildInterventionEventStudyReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly InterventionEventStudyReviewCandidateLike[];
  readonly evidence: readonly InterventionEventStudyReviewEvidenceLike[];
  readonly coverage: readonly InterventionEventStudyReviewCoverageLike[];
  readonly thresholds?: Partial<InterventionEventStudyThresholds>;
  readonly productionCandidateLimit?: number;
  readonly quota?: InterventionEventStudyReviewStratumQuota;
};

const PRETREND_PLACEBO_BLOCKERS: ReadonlySet<string> = new Set([
  "pre_trend_failed",
  "placebo_in_time_failed",
  "placebo_in_space_failed",
  "autocorrelation_failed",
]);
const NEAR_THRESHOLD_SCORE = 64;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<InterventionEventStudyReviewStratum, number> = {
  top_score: 10,
  near_threshold: 8,
  gate_pass: 16,
  pretrend_or_placebo_risk: 12,
  method_divergence: 10,
  borough_spread: 10,
  cap_suppressed_control: 16,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<InterventionEventStudyReviewItem, "stratum" | "selectedForReview">;
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

function emptyStratumCounts(): Record<InterventionEventStudyReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    gate_pass: 0,
    pretrend_or_placebo_risk: 0,
    method_divergence: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(
  ref: Record<string, unknown> | null,
): InterventionEventStudyReviewMetrics {
  const gate = asRecord(field(ref, "gateSummary"));
  return {
    interventionType: text(field(ref, "interventionType")),
    eventStudyEstimate: num(field(ref, "eventStudyEstimate")),
    controlScopeCount:
      num(field(ref, "controlScopeCount")) ??
      (Array.isArray(field(ref, "controlScopeIds"))
        ? (field(ref, "controlScopeIds") as unknown[]).length
        : null),
    associationallyScoreable: bool(field(gate, "associationallyScoreable")),
    candidateCausalEligible: bool(field(gate, "candidateCausalEligible")),
    blockingReasons: stringArray(field(gate, "blockingReasons")),
  };
}

function gateStatus(metrics: InterventionEventStudyReviewMetrics): string {
  if (metrics.candidateCausalEligible === true) return "candidate_causal_eligible";
  if (metrics.associationallyScoreable === true) return "associational_only";
  return "not_scoreable";
}

function priorityScore(
  item: Omit<InterventionEventStudyReviewItem, "stratum" | "selectedForReview">,
) {
  if (item.detectorScore !== null) return item.detectorScore;
  return Math.abs(item.metrics.eventStudyEstimate ?? 0);
}

function counterEvidenceMessages(ref: Record<string, unknown> | null): string[] {
  const caveats = field(ref, "caveats");
  return stringArray(caveats);
}

export function buildInterventionEventStudyReviewQueue(
  input: BuildInterventionEventStudyReviewQueueInput,
): InterventionEventStudyReviewQueueArtifact {
  const detectorThresholds: InterventionEventStudyThresholds = {
    ...DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS.candidateLimit;
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

  const emittedByKey = new Map<string, InterventionEventStudyReviewCandidateLike>();
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
      text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "treatedScopeId"));
    const metrics = reviewMetricsFrom(ref);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const gatePass = emitted && metrics.candidateCausalEligible === true;
    const methodDivergence = emitted && metrics.blockingReasons.includes("method_divergence");
    const pretrendOrPlaceboRisk =
      emitted && metrics.blockingReasons.some((reason) => PRETREND_PLACEBO_BLOCKERS.has(reason));
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
          gatePass,
          pretrendOrPlaceboRisk,
          methodDivergence,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): InterventionEventStudyReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.methodDivergence) return "method_divergence";
    if (it.pretrendOrPlaceboRisk) return "pretrend_or_placebo_risk";
    if (it.gatePass) return "gate_pass";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    InterventionEventStudyReviewStratum,
    { entry: Enriched; stratum: InterventionEventStudyReviewStratum }[]
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
  const emittedByGateStatus = new Map<string, number>();
  const emittedByBoroughPrefix = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  const skippedByReasonCode = new Map<string, number>();
  let capSuppressedCount = 0;
  const items: InterventionEventStudyReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) {
      increment(emittedByBoroughPrefix, entry.boroughPrefix);
      increment(emittedByGateStatus, gateStatus(entry.item.metrics));
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
    artifactKind: "intervention_event_study_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: INTERVENTION_EVENT_STUDY_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
    },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
      selectedForReviewCount: items.filter((item) => item.selectedForReview).length,
      byStratum,
      selectedByStratum,
      emittedByGateStatus: sortedCountRecord(emittedByGateStatus),
      emittedByBoroughPrefix: sortedCountRecord(emittedByBoroughPrefix),
      capSuppressedByBoroughPrefix: sortedCountRecord(capSuppressedByBoroughPrefix),
      skippedByReasonCode: sortedCountRecord(skippedByReasonCode),
    },
    items,
  };
}

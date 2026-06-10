import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  type BunchingHotspotsThresholds,
  DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
} from "@bp/analytics";
import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `bunching_hotspots` detector (ADR-0018 step 2).
//
// Like `headway_reliability_ewt`, this detector scores stop-direction-hour cells and emits only the
// top `candidateLimit` (default 100) by score. The 2026-03 no-write inventory found 3,048 cells above
// the emission threshold, so the production cap suppresses ~96.7% of qualifying cells and skews the
// emitted top-100 toward a few borough prefixes (Staten Island is ~48% of the sample). This queue is
// therefore built from a HIGH-LIMIT run so the cap-suppressed population carries its computed
// bunching/gap-share evidence; cap suppression is detected from score rank vs the production cap
// because non-emitted coverage rows do not carry the computed shares.
//
// The detector emits two reason classes -- `bunching_hotspot` (short headways) and
// `headway_gap_hotspot` (long gaps). Both must be reviewed, so the queue stratifies the gap-dominant
// class explicitly rather than letting the (usually higher-scoring) bunching class crowd it out.

export type BunchingHotspotsReviewStratum =
  | "top_score"
  | "near_threshold"
  | "thin_pair_support"
  | "gap_dominant"
  | "extreme_share"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type BunchingHotspotsReviewCandidateLike = {
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

export type BunchingHotspotsReviewEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type BunchingHotspotsReviewCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type BunchingHotspotsReviewMetrics = {
  readonly stopId: string | null;
  readonly stopName: string | null;
  readonly direction: string | null;
  readonly localHour: number | null;
  readonly pairCount: number | null;
  readonly bunchingShare: number | null;
  readonly gapShare: number | null;
  readonly dominantShare: number | null;
  readonly scheduledHeadwayMinutes: number | null;
};

export type BunchingHotspotsReviewItem = {
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
  readonly metrics: BunchingHotspotsReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  readonly thinPairSupport: boolean;
  readonly gapDominant: boolean;
  readonly extremeShare: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: BunchingHotspotsReviewStratum;
  readonly selectedForReview: boolean;
};

export type BunchingHotspotsReviewQueueArtifact = {
  readonly artifactKind: "bunching_hotspots_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: typeof BUNCHING_HOTSPOTS_DETECTOR_ID;
  readonly thresholds: BunchingHotspotsThresholds & {
    readonly productionCandidateLimit: number;
    readonly thinPairCount: number;
    readonly extremeShareFloor: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<BunchingHotspotsReviewStratum, number>;
    readonly selectedByStratum: Record<BunchingHotspotsReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly emittedByReasonCode: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
    readonly skippedByReasonCode: Record<string, number>;
  };
  readonly items: readonly BunchingHotspotsReviewItem[];
};

export type BunchingHotspotsReviewStratumQuota = Partial<
  Record<BunchingHotspotsReviewStratum, number>
>;

export type BuildBunchingHotspotsReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly BunchingHotspotsReviewCandidateLike[];
  readonly evidence: readonly BunchingHotspotsReviewEvidenceLike[];
  readonly coverage: readonly BunchingHotspotsReviewCoverageLike[];
  readonly thresholds?: Partial<BunchingHotspotsThresholds>;
  readonly productionCandidateLimit?: number;
  readonly thinPairCount?: number;
  readonly extremeShareFloor?: number;
  readonly quota?: BunchingHotspotsReviewStratumQuota;
};

const DEFAULT_EXTREME_SHARE_FLOOR = 0.75;
const NEAR_THRESHOLD_SCORE = 68;
const TOP_SCORE_RANK = 20;

const DEFAULT_QUOTA: Record<BunchingHotspotsReviewStratum, number> = {
  top_score: 12,
  near_threshold: 10,
  thin_pair_support: 10,
  gap_dominant: 12,
  extreme_share: 10,
  borough_spread: 12,
  cap_suppressed_control: 16,
  clean_control: 8,
  skipped_control: 8,
};

type Enriched = {
  readonly item: Omit<BunchingHotspotsReviewItem, "stratum" | "selectedForReview">;
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

function emptyStratumCounts(): Record<BunchingHotspotsReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    thin_pair_support: 0,
    gap_dominant: 0,
    extreme_share: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

function reviewMetricsFrom(ref: Record<string, unknown> | null): BunchingHotspotsReviewMetrics {
  const bunchingShare = num(field(ref, "bunchingShare"));
  const gapShare = num(field(ref, "gapShare"));
  const dominantShare =
    bunchingShare === null && gapShare === null
      ? null
      : Math.max(bunchingShare ?? 0, gapShare ?? 0);
  return {
    stopId: text(field(ref, "stopId")),
    stopName: text(field(ref, "stopName")),
    direction: text(field(ref, "direction")),
    localHour: num(field(ref, "localHour")),
    pairCount: num(field(ref, "pairCount")) ?? num(field(ref, "observedHeadwayPairCount")),
    bunchingShare,
    gapShare,
    dominantShare,
    scheduledHeadwayMinutes: num(field(ref, "scheduledHeadwayMinutes")),
  };
}

function priorityScore(
  item: Omit<BunchingHotspotsReviewItem, "stratum" | "selectedForReview">,
): number {
  if (item.detectorScore !== null) return item.detectorScore;
  return item.metrics.dominantShare ?? 0;
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

export function buildBunchingHotspotsReviewQueue(
  input: BuildBunchingHotspotsReviewQueueInput,
): BunchingHotspotsReviewQueueArtifact {
  const detectorThresholds: BunchingHotspotsThresholds = {
    ...DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const productionCandidateLimit =
    input.productionCandidateLimit ?? DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS.candidateLimit;
  const thinPairCount = input.thinPairCount ?? detectorThresholds.highConfidencePairs;
  const extremeShareFloor = input.extremeShareFloor ?? DEFAULT_EXTREME_SHARE_FLOOR;
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

  const emittedByKey = new Map<string, BunchingHotspotsReviewCandidateLike>();
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
    const routeId = text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const metrics = reviewMetricsFrom(ref);
    const reasonCode = text(candidate?.reasonCode);
    const rank = rankByKey.get(identityKey) ?? null;
    const capSuppressed = emitted && rank !== null && rank > productionCandidateLimit;
    const thinPairSupport =
      emitted && metrics.pairCount !== null && metrics.pairCount < thinPairCount;
    const gapDominant = emitted && reasonCode === "headway_gap_hotspot";
    const extremeShare =
      emitted && metrics.dominantShare !== null && metrics.dominantShare >= extremeShareFloor;
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
          reasonCode,
          claimText: text(candidate?.claimText),
          metrics,
          coverageOutcome: outcome,
          skipReasonCode: text(coverage.reasonCode),
          skipReason: text(coverage.reason),
          thinPairSupport,
          gapDominant,
          extremeShare,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): BunchingHotspotsReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      return it.coverageOutcome === "clean_no_hit" ? "clean_control" : "skipped_control";
    }
    if (it.capSuppressed) return "cap_suppressed_control";
    if (it.extremeShare) return "extreme_share";
    if (it.thinPairSupport) return "thin_pair_support";
    if (it.gapDominant) return "gap_dominant";
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  const selectedKeys = new Set<string>();
  const groups = new Map<
    BunchingHotspotsReviewStratum,
    { entry: Enriched; stratum: BunchingHotspotsReviewStratum }[]
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
  const emittedByReasonCode = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  const skippedByReasonCode = new Map<string, number>();
  let capSuppressedCount = 0;
  const items: BunchingHotspotsReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) {
      increment(emittedByBoroughPrefix, entry.boroughPrefix);
      if (entry.item.reasonCode !== null) increment(emittedByReasonCode, entry.item.reasonCode);
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
    artifactKind: "bunching_hotspots_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: BUNCHING_HOTSPOTS_DETECTOR_ID,
    thresholds: {
      ...detectorThresholds,
      productionCandidateLimit,
      thinPairCount,
      extremeShareFloor,
    },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
      selectedForReviewCount: items.filter((item) => item.selectedForReview).length,
      byStratum,
      selectedByStratum,
      emittedByBoroughPrefix: sortedCountRecord(emittedByBoroughPrefix),
      emittedByReasonCode: sortedCountRecord(emittedByReasonCode),
      capSuppressedByBoroughPrefix: sortedCountRecord(capSuppressedByBoroughPrefix),
      skippedByReasonCode: sortedCountRecord(skippedByReasonCode),
    },
    items,
  };
}

function roundRobinByBorough(
  sorted: { entry: Enriched; stratum: BunchingHotspotsReviewStratum }[],
  limit: number,
): { entry: Enriched; stratum: BunchingHotspotsReviewStratum }[] {
  if (limit <= 0) return [];
  const byBorough = new Map<
    string,
    { entry: Enriched; stratum: BunchingHotspotsReviewStratum }[]
  >();
  for (const row of sorted) {
    const list = byBorough.get(row.entry.boroughPrefix) ?? [];
    list.push(row);
    byBorough.set(row.entry.boroughPrefix, list);
  }
  const boroughs = [...byBorough.keys()].sort((left, right) => left.localeCompare(right));
  const picked: { entry: Enriched; stratum: BunchingHotspotsReviewStratum }[] = [];
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

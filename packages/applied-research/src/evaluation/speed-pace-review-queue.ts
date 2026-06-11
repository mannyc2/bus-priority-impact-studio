import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Review queue construction for the `speed_pace_hotspot` detector family (ADR-0018 step 2).
//
// The queue is built from a no-write detector run (candidates + evidence + coverage) so a reviewer
// can label without rerunning the detector. It enriches each emitted candidate with the metrics a
// reviewer needs, derives speed-pace-specific false-positive signals (terminal position, duplicate
// physical scope, low observations, cap suppression), and selects a stratified review batch rather
// than a flat score-ordered pass.

export const SPEED_PACE_HOTSPOT_DETECTOR_ID = "speed_pace_hotspot";

export type SpeedPaceReviewStratum =
  | "top_score"
  | "near_threshold"
  | "low_observation"
  | "terminal_segment"
  | "duplicate_physical"
  | "geometry_watch"
  | "borough_spread"
  | "cap_suppressed_control"
  | "clean_control"
  | "skipped_control";

export type SpeedPaceCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly physicalId?: unknown;
  readonly detectorScore?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly claimText?: unknown;
};

export type SpeedPaceEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
  readonly evidenceRef?: unknown;
};

export type SpeedPaceCoverageLike = {
  readonly detectorId?: unknown;
  readonly scopeId?: unknown;
  readonly routeId?: unknown;
  readonly outcome?: unknown;
  readonly reasonCode?: unknown;
  readonly reason?: unknown;
  readonly inputsSeenJson?: unknown;
};

export type SpeedPaceReviewMetrics = {
  readonly slownessIndex: number | null;
  readonly medianSpeedMph: number | null;
  readonly medianPaceMinutesPerMile: number | null;
  readonly freeFlowPaceMinutesPerMile: number | null;
  readonly systematicDelayMinutesPerMile: number | null;
  readonly stochasticDelayMinutesPerMile: number | null;
  readonly traversalCount: number | null;
  readonly segmentLengthFeet: number | null;
  readonly spatialConfidence: number | null;
};

export type SpeedPaceReviewItem = {
  readonly detectorId: string;
  readonly scopeId: string;
  readonly identityKey: string;
  readonly candidateId: string | null;
  readonly routeId: string | null;
  readonly segmentId: string | null;
  readonly physicalNodePairId: string | null;
  readonly direction: string | null;
  readonly daypart: string | null;
  readonly month: string | null;
  readonly emitted: boolean;
  readonly rank: number | null;
  readonly detectorScore: number | null;
  readonly severity: string | null;
  readonly confidence: string | null;
  readonly claimText: string | null;
  readonly metrics: SpeedPaceReviewMetrics;
  readonly coverageOutcome: string | null;
  readonly skipReasonCode: string | null;
  readonly skipReason: string | null;
  // Derived false-positive signals.
  readonly terminalPosition: "first" | "last" | "mid" | "unknown";
  readonly duplicatePhysicalCount: number;
  readonly lowObservation: boolean;
  readonly capSuppressed: boolean;
  readonly counterEvidence: readonly string[];
  readonly stratum: SpeedPaceReviewStratum;
  readonly selectedForReview: boolean;
};

export type SpeedPaceReviewQueueArtifact = {
  readonly artifactKind: "speed_pace_review_queue";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly detectorId: string;
  readonly thresholds: {
    readonly minSlownessIndex: number;
    readonly lowObservationTraversals: number;
  };
  readonly summary: {
    readonly emittedCount: number;
    readonly coverageCount: number;
    readonly capSuppressedCount: number;
    readonly selectedForReviewCount: number;
    readonly byStratum: Record<SpeedPaceReviewStratum, number>;
    readonly selectedByStratum: Record<SpeedPaceReviewStratum, number>;
    readonly emittedByBoroughPrefix: Record<string, number>;
    readonly capSuppressedByBoroughPrefix: Record<string, number>;
  };
  readonly items: readonly SpeedPaceReviewItem[];
};

export type SpeedPaceReviewStratumQuota = Partial<Record<SpeedPaceReviewStratum, number>>;

export type BuildSpeedPaceReviewQueueInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly candidates: readonly SpeedPaceCandidateLike[];
  readonly evidence: readonly SpeedPaceEvidenceLike[];
  readonly coverage: readonly SpeedPaceCoverageLike[];
  readonly minSlownessIndex?: number;
  readonly lowObservationTraversals?: number;
  readonly quota?: SpeedPaceReviewStratumQuota;
};

const DEFAULT_MIN_SLOWNESS_INDEX = 1.5;
const DEFAULT_LOW_OBSERVATION_TRAVERSALS = 30;
// Stratum boundaries (independent of selection quota): the lowest-scoring emitted band sits near the
// cap's implicit threshold; the highest ranks are the most extreme; very long segments concentrate
// geometry/dwell ambiguity.
const NEAR_THRESHOLD_SCORE = 86;
const TOP_SCORE_RANK = 25;
const GEOMETRY_WATCH_SEGMENT_LENGTH_FEET = 5000;

const DEFAULT_QUOTA: Record<SpeedPaceReviewStratum, number> = {
  top_score: 10,
  near_threshold: 10,
  low_observation: 6,
  terminal_segment: 8,
  duplicate_physical: 10,
  geometry_watch: 6,
  borough_spread: 10,
  cap_suppressed_control: 16,
  clean_control: 6,
  skipped_control: 6,
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

function boroughPrefix(routeId: string | null): string {
  if (routeId === null) return "unknown";
  const match = routeId.match(/^[A-Za-z]+/);
  return match === null ? "unknown" : match[0].toUpperCase();
}

function sequenceIndex(segmentId: string | null): number | null {
  if (segmentId === null) return null;
  const parts = segmentId.split(":");
  if (parts.length < 3) return null;
  const idx = Number(parts[2]);
  return Number.isFinite(idx) ? idx : null;
}

// Physical identity of a segment = the directed stop pair `fromStop:toStop` (the last two segmentId
// components). This is route-, direction-, and order-independent, so the SAME street block traversed
// by multiple routes (e.g. M101 and M102 both running `403777:401946`) collapses to one physical
// scope for dedupe — unlike `segmentId`, which embeds route/direction/order.
function physicalNodePairId(segmentId: string | null): string | null {
  if (segmentId === null) return null;
  const parts = segmentId.split(":");
  if (parts.length < 2) return null;
  return parts.slice(-2).join(":");
}

function slownessFrom(median: number | null, freeFlow: number | null): number | null {
  if (median === null || freeFlow === null || freeFlow <= 0) return null;
  return median / freeFlow;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function emptyStratumCounts(): Record<SpeedPaceReviewStratum, number> {
  return {
    top_score: 0,
    near_threshold: 0,
    low_observation: 0,
    terminal_segment: 0,
    duplicate_physical: 0,
    geometry_watch: 0,
    borough_spread: 0,
    cap_suppressed_control: 0,
    clean_control: 0,
    skipped_control: 0,
  };
}

type Enriched = {
  item: Omit<SpeedPaceReviewItem, "stratum" | "selectedForReview">;
  boroughPrefix: string;
  physicalId: string | null;
};

export function buildSpeedPaceReviewQueue(
  input: BuildSpeedPaceReviewQueueInput,
): SpeedPaceReviewQueueArtifact {
  const minSlownessIndex = input.minSlownessIndex ?? DEFAULT_MIN_SLOWNESS_INDEX;
  const lowObservationTraversals =
    input.lowObservationTraversals ?? DEFAULT_LOW_OBSERVATION_TRAVERSALS;
  const quota = { ...DEFAULT_QUOTA, ...input.quota };

  // Primary-evidence metrics + counter-evidence by candidate id.
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
      const counter = field(ref, "counterEvidence");
      const list = Array.isArray(counter)
        ? counter.flatMap((entry) => {
            const parsed = text(entry);
            return parsed === null ? [] : [parsed];
          })
        : [];
      counterByCandidate.set(candidateId, list);
    }
  }

  // Per route+direction sequence extents (for terminal detection) from all coverage rows.
  const extents = new Map<string, { min: number; max: number }>();
  for (const coverage of input.coverage) {
    const inputs = asRecord(coverage.inputsSeenJson);
    const segmentId = text(field(inputs, "segmentId"));
    const direction = text(field(inputs, "direction"));
    const routeId = text(field(inputs, "routeId"));
    const idx = sequenceIndex(segmentId);
    if (routeId === null || direction === null || idx === null) continue;
    const key = `${routeId}:${direction}`;
    const current = extents.get(key);
    if (current === undefined) extents.set(key, { min: idx, max: idx });
    else extents.set(key, { min: Math.min(current.min, idx), max: Math.max(current.max, idx) });
  }
  function terminalPosition(
    routeId: string | null,
    direction: string | null,
    segmentId: string | null,
  ): "first" | "last" | "mid" | "unknown" {
    const idx = sequenceIndex(segmentId);
    if (routeId === null || direction === null || idx === null) return "unknown";
    const extent = extents.get(`${routeId}:${direction}`);
    if (extent === undefined) return "unknown";
    if (idx === extent.min) return "first";
    if (idx === extent.max) return "last";
    return "mid";
  }

  // Emitted candidates indexed by identity + rank by descending score.
  const emittedByKey = new Map<string, SpeedPaceCandidateLike>();
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

  // Duplicate physical scope counts among emitted candidates, keyed by the directed stop pair so the
  // same street block emitted under multiple routes/dayparts/directions counts as one physical scope.
  const emittedNodePairCounts = new Map<string, number>();
  for (const candidate of input.candidates) {
    const inputs = primaryRefByCandidate.get(text(candidate.candidateId) ?? "");
    const segmentId = text(candidate.physicalId) ?? text(field(inputs, "segmentId"));
    const nodePairId = physicalNodePairId(segmentId);
    if (nodePairId !== null) increment(emittedNodePairCounts, nodePairId);
  }

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
    const ref = evidenceRef ?? inputs;

    const routeId =
      text(candidate?.routeId) ?? text(coverage.routeId) ?? text(field(ref, "routeId"));
    const segmentId = text(candidate?.physicalId) ?? text(field(ref, "segmentId"));
    const direction = text(field(ref, "direction"));
    const daypart = text(field(ref, "daypart"));
    const month = text(field(ref, "month"));
    const median = num(field(ref, "medianPaceMinutesPerMile"));
    const freeFlow = num(field(ref, "freeFlowPaceMinutesPerMile"));
    const slownessIndex = num(field(ref, "slownessIndex")) ?? slownessFrom(median, freeFlow);
    const traversalCount = num(field(ref, "traversalCount"));
    const outcome = text(coverage.outcome);
    const capSuppressed =
      !emitted &&
      outcome === "clean_no_hit" &&
      slownessIndex !== null &&
      slownessIndex >= minSlownessIndex;

    const terminal = terminalPosition(routeId, direction, segmentId);
    const nodePairId = physicalNodePairId(segmentId);
    const duplicatePhysicalCount =
      nodePairId === null ? 0 : (emittedNodePairCounts.get(nodePairId) ?? 0);
    const lowObservation = traversalCount !== null && traversalCount < lowObservationTraversals;

    return [
      {
        boroughPrefix: boroughPrefix(routeId),
        physicalId: segmentId,
        item: {
          detectorId,
          scopeId,
          identityKey,
          candidateId,
          routeId,
          segmentId,
          physicalNodePairId: nodePairId,
          direction,
          daypart,
          month,
          emitted,
          rank: rankByKey.get(identityKey) ?? null,
          detectorScore: num(candidate?.detectorScore),
          severity: text(candidate?.severity),
          confidence: text(candidate?.confidence),
          claimText: text(candidate?.claimText),
          metrics: {
            slownessIndex,
            medianSpeedMph: num(field(ref, "medianSpeedMph")),
            medianPaceMinutesPerMile: median,
            freeFlowPaceMinutesPerMile: freeFlow,
            systematicDelayMinutesPerMile: num(field(ref, "systematicDelayMinutesPerMile")),
            stochasticDelayMinutesPerMile: num(field(ref, "stochasticDelayMinutesPerMile")),
            traversalCount,
            segmentLengthFeet: num(field(ref, "segmentLengthFeet")),
            spatialConfidence: num(field(ref, "spatialConfidence")),
          },
          coverageOutcome: outcome,
          skipReasonCode: text(coverage.reasonCode),
          skipReason: text(coverage.reason),
          terminalPosition: terminal,
          duplicatePhysicalCount,
          lowObservation,
          capSuppressed,
          counterEvidence: candidateId === null ? [] : (counterByCandidate.get(candidateId) ?? []),
        },
      },
    ];
  });

  const stratumOf = (entry: Enriched): SpeedPaceReviewStratum => {
    const it = entry.item;
    if (!it.emitted) {
      if (it.coverageOutcome !== "clean_no_hit") return "skipped_control";
      return it.capSuppressed ? "cap_suppressed_control" : "clean_control";
    }
    if (it.terminalPosition === "first" || it.terminalPosition === "last")
      return "terminal_segment";
    if (it.lowObservation) return "low_observation";
    if (it.duplicatePhysicalCount > 1) return "duplicate_physical";
    if (
      it.metrics.segmentLengthFeet !== null &&
      it.metrics.segmentLengthFeet >= GEOMETRY_WATCH_SEGMENT_LENGTH_FEET
    ) {
      // Long segments concentrate map-matching / dwell-vs-running ambiguity.
      return "geometry_watch";
    }
    const score = it.detectorScore ?? 0;
    if (score <= NEAR_THRESHOLD_SCORE) return "near_threshold";
    const rank = it.rank ?? Number.MAX_SAFE_INTEGER;
    if (rank <= TOP_SCORE_RANK) return "top_score";
    return "borough_spread";
  };

  const withStratum = enriched.map((entry) => ({ entry, stratum: stratumOf(entry) }));

  // Deterministic stratified selection. Controls spread across borough prefixes so outer-borough
  // cap-suppressed segments are represented, not just the densest corridor.
  const selectedKeys = new Set<string>();
  const groups = new Map<
    SpeedPaceReviewStratum,
    { entry: Enriched; stratum: SpeedPaceReviewStratum }[]
  >();
  for (const row of withStratum) {
    const list = groups.get(row.stratum) ?? [];
    list.push(row);
    groups.set(row.stratum, list);
  }
  for (const [stratum, rows] of groups) {
    const limit = quota[stratum] ?? 0;
    const isControl =
      stratum === "cap_suppressed_control" ||
      stratum === "clean_control" ||
      stratum === "skipped_control";
    const sorted = [...rows].sort((left, right) => {
      if (isControl) {
        // Round-robin by borough prefix, then by slowness desc, for geographic spread.
        const boroughCompare = left.entry.boroughPrefix.localeCompare(right.entry.boroughPrefix);
        if (boroughCompare !== 0) return boroughCompare;
        return (
          (right.entry.item.metrics.slownessIndex ?? 0) -
          (left.entry.item.metrics.slownessIndex ?? 0)
        );
      }
      const scoreCompare =
        (right.entry.item.detectorScore ?? 0) - (left.entry.item.detectorScore ?? 0);
      if (scoreCompare !== 0) return scoreCompare;
      return left.entry.item.scopeId.localeCompare(right.entry.item.scopeId);
    });
    const picked = isControl ? roundRobinByBorough(sorted, limit) : sorted.slice(0, limit);
    for (const row of picked) selectedKeys.add(row.entry.item.identityKey);
  }

  const byStratum = emptyStratumCounts();
  const selectedByStratum = emptyStratumCounts();
  const emittedByBoroughPrefix = new Map<string, number>();
  const capSuppressedByBoroughPrefix = new Map<string, number>();
  let capSuppressedCount = 0;
  const items: SpeedPaceReviewItem[] = withStratum.map(({ entry, stratum }) => {
    const selectedForReview = selectedKeys.has(entry.item.identityKey);
    byStratum[stratum] += 1;
    if (selectedForReview) selectedByStratum[stratum] += 1;
    if (entry.item.emitted) increment(emittedByBoroughPrefix, entry.boroughPrefix);
    if (entry.item.capSuppressed) {
      capSuppressedCount += 1;
      increment(capSuppressedByBoroughPrefix, entry.boroughPrefix);
    }
    return { ...entry.item, stratum, selectedForReview };
  });

  // Stable ordering: selected first, then by stratum, then rank/scope.
  items.sort(
    (left, right) =>
      Number(right.selectedForReview) - Number(left.selectedForReview) ||
      left.stratum.localeCompare(right.stratum) ||
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      left.scopeId.localeCompare(right.scopeId),
  );

  return {
    artifactKind: "speed_pace_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    detectorId: SPEED_PACE_HOTSPOT_DETECTOR_ID,
    thresholds: { minSlownessIndex, lowObservationTraversals },
    summary: {
      emittedCount: input.candidates.length,
      coverageCount: input.coverage.length,
      capSuppressedCount,
      selectedForReviewCount: items.filter((item) => item.selectedForReview).length,
      byStratum,
      selectedByStratum,
      emittedByBoroughPrefix: Object.fromEntries(
        [...emittedByBoroughPrefix.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
      capSuppressedByBoroughPrefix: Object.fromEntries(
        [...capSuppressedByBoroughPrefix.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    items,
  };
}

function roundRobinByBorough(
  sorted: { entry: Enriched; stratum: SpeedPaceReviewStratum }[],
  limit: number,
): { entry: Enriched; stratum: SpeedPaceReviewStratum }[] {
  if (limit <= 0) return [];
  const byBorough = new Map<string, { entry: Enriched; stratum: SpeedPaceReviewStratum }[]>();
  for (const row of sorted) {
    const list = byBorough.get(row.entry.boroughPrefix) ?? [];
    list.push(row);
    byBorough.set(row.entry.boroughPrefix, list);
  }
  const boroughs = [...byBorough.keys()].sort((a, b) => a.localeCompare(b));
  const picked: { entry: Enriched; stratum: SpeedPaceReviewStratum }[] = [];
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

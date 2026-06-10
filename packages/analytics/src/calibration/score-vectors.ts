export type DetectorScoreVectorEntry = {
  scopeId: string;
  score: number;
  flagged: boolean;
};

export type DetectorScoreVectorSummary = {
  scopeCount: number;
  flaggedCount: number;
  flaggedShare: number;
  minScore: number | null;
  maxScore: number | null;
};

export function summarizeScoreVector(
  entries: readonly DetectorScoreVectorEntry[],
): DetectorScoreVectorSummary {
  const scores = entries.map((entry) => entry.score);
  const flaggedCount = entries.filter((entry) => entry.flagged).length;
  return {
    scopeCount: entries.length,
    flaggedCount,
    flaggedShare: entries.length === 0 ? 0 : flaggedCount / entries.length,
    minScore: scores.length === 0 ? null : Math.min(...scores),
    maxScore: scores.length === 0 ? null : Math.max(...scores),
  };
}

export function flaggedSet(entries: readonly DetectorScoreVectorEntry[]): Set<string> {
  return new Set(entries.filter((entry) => entry.flagged).map((entry) => entry.scopeId));
}

export function jaccardOverlap(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / union.size;
}

// Score-vector novelty statistics (S4.4): Spearman rank-correlation + spread, used to tell whether a
// detector's score vector adds new information or merely re-ranks scopes the way an existing detector
// already does. Pure: no IO, deterministic.

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** 1-based average ranks (ties share their mean rank). */
function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = new Array<number>(values.length);
  let start = 0;
  while (start < indexed.length) {
    let end = start;
    while (end + 1 < indexed.length && indexed[end + 1]!.value === indexed[start]!.value) end += 1;
    const averageRank = (start + end) / 2 + 1;
    for (let i = start; i <= end; i += 1) ranks[indexed[i]!.index] = averageRank;
    start = end + 1;
  }
  return ranks;
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  const meanLeft = mean(left);
  const meanRight = mean(right);
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let i = 0; i < left.length; i += 1) {
    const deltaLeft = left[i]! - meanLeft;
    const deltaRight = right[i]! - meanRight;
    covariance += deltaLeft * deltaRight;
    varianceLeft += deltaLeft * deltaLeft;
    varianceRight += deltaRight * deltaRight;
  }
  // No variance on either side -> correlation is undefined (a constant ranking has no order to compare).
  if (varianceLeft === 0 || varianceRight === 0) return null;
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

/**
 * Spearman rank correlation between two equal-length, index-aligned score series. Returns null when
 * fewer than 2 paired points exist or either series has no variance.
 */
export function spearmanRankCorrelation(
  left: readonly number[],
  right: readonly number[],
): number | null {
  if (left.length !== right.length) {
    throw new Error("Spearman rank correlation requires equal-length series.");
  }
  if (left.length < 2) return null;
  const rho = pearson(averageRanks(left), averageRanks(right));
  return rho === null ? null : round4(rho);
}

export type ScoreSpreadStats = {
  count: number;
  min: number | null;
  max: number | null;
  range: number | null;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  p25: number | null;
  p75: number | null;
  iqr: number | null;
};

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const position = fraction * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return sorted[lowerIndex]! * (1 - weight) + sorted[upperIndex]! * weight;
}

export function scoreSpreadStats(scores: readonly number[]): ScoreSpreadStats {
  if (scores.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      range: null,
      mean: null,
      median: null,
      stdDev: null,
      p25: null,
      p75: null,
      iqr: null,
    };
  }
  const sorted = [...scores].sort((left, right) => left - right);
  const average = mean(sorted);
  const variance = mean(sorted.map((value) => (value - average) ** 2));
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  return {
    count: sorted.length,
    min: round4(sorted[0]!),
    max: round4(sorted[sorted.length - 1]!),
    range: round4(sorted[sorted.length - 1]! - sorted[0]!),
    mean: round4(average),
    median: round4(percentile(sorted, 0.5)),
    stdDev: round4(Math.sqrt(variance)),
    p25: round4(p25),
    p75: round4(p75),
    iqr: round4(p75 - p25),
  };
}

export type DetectorScoreVectorRef = {
  detectorId: string;
  entries: readonly DetectorScoreVectorEntry[];
};

export type DetectorScoreNoveltyComparison = {
  peerDetectorId: string;
  sharedScopeCount: number;
  rankCorrelation: number | null;
  flaggedJaccard: number;
};

export type DetectorScoreNovelty = {
  detectorId: string;
  scopeCount: number;
  spread: ScoreSpreadStats;
  comparisons: DetectorScoreNoveltyComparison[];
  maxAbsRankCorrelation: number | null;
  // 1 - max |rank correlation| with any peer; 1.0 when no comparable peer exists (fully novel ranking).
  noveltyScore: number;
};

/**
 * Characterize how novel a detector's score vector is versus a set of peers. For each peer, computes
 * the Spearman rank correlation and flagged-set Jaccard over the scopes the two share. A high absolute
 * rank correlation means the detector re-ranks scopes the way a peer already does (redundant); a low
 * one means it carries new ordering information (novel).
 */
export function detectorScoreNovelty(
  candidate: DetectorScoreVectorRef,
  peers: readonly DetectorScoreVectorRef[],
): DetectorScoreNovelty {
  const candidateByScope = new Map(candidate.entries.map((entry) => [entry.scopeId, entry]));
  const candidateFlagged = flaggedSet(candidate.entries);

  const comparisons: DetectorScoreNoveltyComparison[] = peers
    .filter((peer) => peer.detectorId !== candidate.detectorId)
    .map((peer) => {
      const peerByScope = new Map(peer.entries.map((entry) => [entry.scopeId, entry]));
      const sharedScopeIds = [...candidateByScope.keys()]
        .filter((scopeId) => peerByScope.has(scopeId))
        .sort();
      const candidateScores = sharedScopeIds.map((scopeId) => candidateByScope.get(scopeId)!.score);
      const peerScores = sharedScopeIds.map((scopeId) => peerByScope.get(scopeId)!.score);
      return {
        peerDetectorId: peer.detectorId,
        sharedScopeCount: sharedScopeIds.length,
        rankCorrelation: spearmanRankCorrelation(candidateScores, peerScores),
        flaggedJaccard: round4(jaccardOverlap(candidateFlagged, flaggedSet(peer.entries))),
      };
    })
    .sort((left, right) => left.peerDetectorId.localeCompare(right.peerDetectorId));

  const correlations = comparisons
    .map((comparison) => comparison.rankCorrelation)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value));
  const maxAbsRankCorrelation =
    correlations.length === 0 ? null : round4(Math.max(...correlations));

  return {
    detectorId: candidate.detectorId,
    scopeCount: candidate.entries.length,
    spread: scoreSpreadStats(candidate.entries.map((entry) => entry.score)),
    comparisons,
    maxAbsRankCorrelation,
    noveltyScore: maxAbsRankCorrelation === null ? 1 : round4(1 - maxAbsRankCorrelation),
  };
}

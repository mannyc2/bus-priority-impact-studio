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

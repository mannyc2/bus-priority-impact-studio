export type LabeledRange = {
  id: string;
  start: number;
  end: number;
};

export type RangePrecisionRecall = {
  predictedCount: number;
  expectedCount: number;
  existencePrecision: number | null;
  existenceRecall: number | null;
  overlapPrecision: number | null;
  overlapRecall: number | null;
};

function rangeLength(range: LabeledRange): number {
  return Math.max(0, range.end - range.start);
}

function overlapLength(left: LabeledRange, right: LabeledRange): number {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

function validateRange(range: LabeledRange): void {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new Error(`Range ${range.id} has non-finite bounds.`);
  }
  if (range.end < range.start) {
    throw new Error(`Range ${range.id} ends before it starts.`);
  }
}

function hasOverlap(range: LabeledRange, candidates: readonly LabeledRange[]): boolean {
  return candidates.some((candidate) => overlapLength(range, candidate) > 0);
}

function maxOverlap(range: LabeledRange, candidates: readonly LabeledRange[]): number {
  return candidates.reduce(
    (best, candidate) => Math.max(best, overlapLength(range, candidate)),
    0,
  );
}

export function evaluateRangePrecisionRecall(input: {
  predictedRanges: readonly LabeledRange[];
  expectedRanges: readonly LabeledRange[];
}): RangePrecisionRecall {
  for (const range of [...input.predictedRanges, ...input.expectedRanges]) {
    validateRange(range);
  }

  const predictedHits = input.predictedRanges.filter((range) =>
    hasOverlap(range, input.expectedRanges),
  ).length;
  const expectedHits = input.expectedRanges.filter((range) =>
    hasOverlap(range, input.predictedRanges),
  ).length;
  const predictedLength = input.predictedRanges.reduce((sum, range) => sum + rangeLength(range), 0);
  const expectedLength = input.expectedRanges.reduce((sum, range) => sum + rangeLength(range), 0);
  const predictedOverlap = input.predictedRanges.reduce(
    (sum, range) => sum + maxOverlap(range, input.expectedRanges),
    0,
  );
  const expectedOverlap = input.expectedRanges.reduce(
    (sum, range) => sum + maxOverlap(range, input.predictedRanges),
    0,
  );

  return {
    predictedCount: input.predictedRanges.length,
    expectedCount: input.expectedRanges.length,
    existencePrecision:
      input.predictedRanges.length === 0 ? null : predictedHits / input.predictedRanges.length,
    existenceRecall:
      input.expectedRanges.length === 0 ? null : expectedHits / input.expectedRanges.length,
    overlapPrecision: predictedLength === 0 ? null : predictedOverlap / predictedLength,
    overlapRecall: expectedLength === 0 ? null : expectedOverlap / expectedLength,
  };
}

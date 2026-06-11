export type SourceCoverageBaseline = {
  expectedCount: number;
  observedCount: number;
  missingCount: number;
  observedShare: number | null;
};

export function sourceCoverageBaseline(input: {
  expectedCount: number;
  observedCount: number;
}): SourceCoverageBaseline {
  const missingCount = Math.max(0, input.expectedCount - input.observedCount);
  return {
    expectedCount: input.expectedCount,
    observedCount: input.observedCount,
    missingCount,
    observedShare: input.expectedCount === 0 ? null : input.observedCount / input.expectedCount,
  };
}

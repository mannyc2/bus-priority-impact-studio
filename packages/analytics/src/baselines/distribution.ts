import { median, percentile, percentileRank } from "../concentration.js";

export type DistributionBaseline = {
  count: number;
  min: number | null;
  median: number | null;
  max: number | null;
};

export function distributionBaseline(values: readonly number[]): DistributionBaseline {
  if (values.length === 0) {
    return { count: 0, min: null, median: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    median: median(sorted),
    max: sorted[sorted.length - 1] ?? null,
  };
}

export function quantileCutoff(values: readonly number[], quantile: number): number {
  return percentile(values, quantile);
}

export function distributionRank(value: number, values: readonly number[]): number {
  return percentileRank(value, values);
}

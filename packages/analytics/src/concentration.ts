/**
 * Pure concentration / inequality statistics.
 *
 * Numbers in, numbers out — no domain types — so the math stays unit-testable in
 * isolation from the finding contract. Shared by the delay-concentration detector.
 */

import { clamp } from "./core/numbers.js";

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Linear-interpolated percentile (`p` in [0,1]) of an unweighted sample. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0]!;
  const rank = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/** Fraction of the sample `<= value`, i.e. the percentile rank of `value` within `all`. */
export function percentileRank(value: number, all: readonly number[]): number {
  if (all.length === 0) return 0;
  let count = 0;
  for (const candidate of all) {
    if (candidate <= value) count += 1;
  }
  return count / all.length;
}

/**
 * Gini coefficient of a non-negative distribution. 0 = perfectly even, approaching
 * `1 - 1/n` when all mass sits on a single item. An empty or all-zero distribution
 * has no inequality and returns 0.
 */
export function giniCoefficient(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) {
    const value = sorted[i]!;
    if (value < 0) throw new Error("giniCoefficient requires non-negative values.");
    total += value;
    weighted += (i + 1) * value;
  }
  if (total === 0) return 0;
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/**
 * Smallest number of largest items whose cumulative share reaches `targetShare` of the
 * total. Returns 0 when the total is non-positive.
 */
export function minItemsForShare(values: readonly number[], targetShare: number): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  const sorted = [...values].sort((left, right) => right - left);
  const target = clamp(targetShare, 0, 1) * total;
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i]!;
    if (cumulative >= target) return i + 1;
  }
  return sorted.length;
}

/** Cumulative share of the `k` largest items in the total. */
export function topItemsShare(values: readonly number[], k: number): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || k <= 0) return 0;
  const sorted = [...values].sort((left, right) => right - left);
  let cumulative = 0;
  for (let i = 0; i < Math.min(k, sorted.length); i += 1) {
    cumulative += sorted[i]!;
  }
  return cumulative / total;
}

import { describe, expect, test } from "bun:test";
import {
  giniCoefficient,
  median,
  minItemsForShare,
  percentile,
  percentileRank,
  topItemsShare,
} from "../src/concentration.js";

describe("giniCoefficient", () => {
  test("perfectly even distribution has gini 0", () => {
    expect(giniCoefficient([5, 5, 5, 5])).toBe(0);
  });

  test("all mass on one item approaches 1 - 1/n", () => {
    expect(giniCoefficient([0, 0, 0, 10])).toBeCloseTo(0.75, 10);
  });

  test("empty or all-zero distribution has no inequality", () => {
    expect(giniCoefficient([])).toBe(0);
    expect(giniCoefficient([0, 0, 0])).toBe(0);
  });

  test("rejects negative values", () => {
    expect(() => giniCoefficient([1, -1])).toThrow();
  });
});

describe("minItemsForShare / topItemsShare", () => {
  test("counts the largest items needed to reach a cumulative share", () => {
    // total 100; sorted desc [60,20,10,5,5]; 90% = 90 reached at the third item.
    expect(minItemsForShare([5, 20, 60, 5, 10], 0.9)).toBe(3);
  });

  test("cumulative share of the k largest items", () => {
    expect(topItemsShare([5, 20, 60, 5, 10], 1)).toBeCloseTo(0.6, 10);
    expect(topItemsShare([5, 20, 60, 5, 10], 2)).toBeCloseTo(0.8, 10);
  });

  test("non-positive total yields zero", () => {
    expect(minItemsForShare([0, 0], 0.9)).toBe(0);
    expect(topItemsShare([0, 0], 2)).toBe(0);
  });
});

describe("percentile / percentileRank / median", () => {
  test("median of even and odd samples", () => {
    expect(median([3, 1])).toBe(2);
    expect(median([1, 2, 3])).toBe(2);
  });

  test("percentile interpolates linearly", () => {
    expect(percentile([0, 10], 0.5)).toBeCloseTo(5, 10);
    expect(percentile([1, 2, 3, 4, 5], 0.85)).toBeCloseTo(4.4, 10);
  });

  test("percentileRank is the fraction of the sample <= value", () => {
    expect(percentileRank(3, [1, 2, 3, 4])).toBeCloseTo(0.75, 10);
    expect(percentileRank(5, [1, 2, 3, 4])).toBe(1);
  });
});

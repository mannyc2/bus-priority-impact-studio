import { describe, expect, test } from "bun:test";
import { medianAbsoluteDeviation, robustZScore, theilSenSlope } from "@bp/analytics/baselines";

describe("trend baseline helpers", () => {
  test("computes median absolute deviation", () => {
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 100])).toBe(1);
    expect(medianAbsoluteDeviation([])).toBeNull();
  });

  test("computes robust z scores with scaled MAD", () => {
    const score = robustZScore(10, [1, 2, 3, 4, 5]);

    expect(score.median).toBe(3);
    expect(score.mad).toBe(1);
    expect(score.scaledMad).toBeCloseTo(1.4826);
    expect(score.z).toBeCloseTo(4.721435);
  });

  test("does not invent z scores when baseline dispersion is zero", () => {
    expect(robustZScore(5, [2, 2, 2]).z).toBeNull();
  });

  test("computes Theil-Sen slope robustly across all point pairs", () => {
    expect(theilSenSlope([1, 2, 3, 100])).toBeCloseTo(17);
    expect(theilSenSlope([4])).toBeNull();
  });
});

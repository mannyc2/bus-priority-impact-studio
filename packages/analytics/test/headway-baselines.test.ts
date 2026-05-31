import { describe, expect, test } from "bun:test";
import {
  averageWaitTimeMinutes,
  excessWaitTimeMinutes,
  headwayCoefficientOfVariation,
  headwayIrregularityRates,
  headwayLosFromCoefficient,
  scheduledWaitTimeMinutes,
} from "@bp/analytics/baselines";

describe("headway baseline helpers", () => {
  test("computes scheduled, average, and excess wait time from headways", () => {
    expect(scheduledWaitTimeMinutes(6)).toBeCloseTo(5);
    expect(averageWaitTimeMinutes([3, 3, 3, 15, 21])).toBeCloseTo(7.7, 5);

    const result = excessWaitTimeMinutes([3, 3, 3, 15, 21], 6);
    expect(result.averageWaitTimeMinutes).toBeCloseTo(7.7, 5);
    expect(result.scheduledWaitTimeMinutes).toBeCloseTo(5);
    expect(result.excessWaitTimeMinutes).toBeCloseTo(2.7, 5);
  });

  test("returns null when wait inputs are not scoreable", () => {
    expect(scheduledWaitTimeMinutes(0)).toBeNull();
    expect(averageWaitTimeMinutes([])).toBeNull();
    expect(excessWaitTimeMinutes([], 6).excessWaitTimeMinutes).toBeNull();
  });

  test("maps headway coefficient of variation to TCQSM LOS bands", () => {
    expect(headwayLosFromCoefficient(0.21)).toBe("A");
    expect(headwayLosFromCoefficient(0.22)).toBe("B");
    expect(headwayLosFromCoefficient(0.31)).toBe("C");
    expect(headwayLosFromCoefficient(0.4)).toBe("D");
    expect(headwayLosFromCoefficient(0.53)).toBe("E");
    expect(headwayLosFromCoefficient(0.75)).toBe("F");
  });

  test("computes headway coefficient of variation against scheduled headway", () => {
    const coefficient = headwayCoefficientOfVariation([5, 5, 5, 15, 15], 6);
    expect(coefficient).toBeCloseTo(0.816496, 5);
  });

  test("computes bunching and gap shares from headway ratios", () => {
    const rates = headwayIrregularityRates([2, 5, 12, 25], 10);

    expect(rates.pairCount).toBe(4);
    expect(rates.bunchingPairCount).toBe(1);
    expect(rates.gapPairCount).toBe(1);
    expect(rates.bunchingShare).toBeCloseTo(0.25);
    expect(rates.gapShare).toBeCloseTo(0.25);
    expect(rates.ratios).toEqual([0.2, 0.5, 1.2, 2.5]);
  });
});

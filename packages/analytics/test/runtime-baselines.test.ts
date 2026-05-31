import { describe, expect, test } from "bun:test";
import {
  bufferIndex,
  paceSlownessIndex,
  positiveDelayComponent,
  runtimeDeviation,
} from "@bp/analytics/baselines";

describe("runtime and pace baseline helpers", () => {
  test("computes buffer index from P50 and P95 runtime", () => {
    expect(bufferIndex(40, 60)).toBeCloseTo(0.5);
    expect(bufferIndex(0, 60)).toBeNull();
    expect(bufferIndex(60, 40)).toBeNull();
  });

  test("computes signed runtime deviation from schedule", () => {
    expect(runtimeDeviation(55, 50).ratio).toBeCloseTo(1.1);
    expect(runtimeDeviation(55, 50).signedPercent).toBeCloseTo(0.1);
    expect(runtimeDeviation(40, 50).ratio).toBeCloseTo(0.8);
    expect(runtimeDeviation(40, 50).signedPercent).toBeCloseTo(-0.2);
    expect(runtimeDeviation(40, 0)).toEqual({ ratio: null, signedPercent: null });
  });

  test("computes pace slowness index against free-flow pace", () => {
    expect(paceSlownessIndex(12, 8)).toBeCloseTo(1.5);
    expect(paceSlownessIndex(12, 0)).toBeNull();
    expect(paceSlownessIndex(null, 8)).toBeNull();
  });

  test("keeps delay components non-negative", () => {
    expect(positiveDelayComponent(3.2)).toBe(3.2);
    expect(positiveDelayComponent(-1.2)).toBe(0);
    expect(positiveDelayComponent(null)).toBeNull();
  });
});

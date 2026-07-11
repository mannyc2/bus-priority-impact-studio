import { describe, expect, test } from "bun:test";
import {
  contextAssociationCaveats,
  contextAssociationScore,
  contextSupport,
} from "@bp/analytics/baselines";

describe("context association helpers", () => {
  test("scores context association from performance, volume, and join quality signals", () => {
    expect(
      contextAssociationScore({
        performanceSignal: 1,
        contextVolumeSignal: 0.5,
        contextQualitySignal: 0.25,
      }),
    ).toBe(87);
  });

  test("summarizes context support and source caveats", () => {
    const support = contextSupport(
      { touchedEventCount: 40, highConfidenceTouchCount: 2, averageMatchWeight: 0.5 },
      { minTouchedEventCount: 25, minHighConfidenceTouchCount: 5, minAverageMatchWeight: 0.35 },
    );

    expect(support.supported).toBe(true);
    expect(support.qualitySignal).toBe(1);
    expect(contextAssociationCaveats("311").join(" ")).toContain("reporting propensity");
  });
});

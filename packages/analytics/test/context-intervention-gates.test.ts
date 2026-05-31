import { describe, expect, test } from "bun:test";
import {
  contextAssociationCaveats,
  contextAssociationScore,
  contextSupport,
} from "@bp/analytics/baselines";
import { summarizeInterventionGates } from "@bp/analytics/calibration";

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

describe("intervention gate helpers", () => {
  test("marks candidate-causal eligibility only when every gate passes", () => {
    expect(
      summarizeInterventionGates({
        controlEligibilityStatus: "eligible",
        preTrendStatus: "passes",
        placeboInTimeStatus: "passes",
        placeboInSpaceStatus: "passes",
        autocorrelationStatus: "passes",
        methodDivergenceStatus: "passes",
      }).candidateCausalEligible,
    ).toBe(true);
  });

  test("keeps failed or untested gates out of candidate-causal language", () => {
    const summary = summarizeInterventionGates({
      controlEligibilityStatus: "eligible",
      preTrendStatus: "fails",
      placeboInTimeStatus: "not_tested",
      placeboInSpaceStatus: "passes",
      autocorrelationStatus: "passes",
      methodDivergenceStatus: "passes",
    });

    expect(summary.associationallyScoreable).toBe(true);
    expect(summary.candidateCausalEligible).toBe(false);
    expect(summary.blockingReasons).toEqual(["pre_trend_failed"]);
  });
});

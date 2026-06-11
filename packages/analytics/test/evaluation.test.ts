import { describe, expect, test } from "bun:test";
import {
  buildDetectorEvaluationScorecard,
  componentScore,
  goldSetEvaluationFlags,
  negativeOrNearMissHardGate,
  weightedMeanScore,
} from "../src/evaluation/index.js";

describe("detector evaluation scorecards", () => {
  test("flags positive-only gold sets and caps the score", () => {
    const evaluation = {
      truePositive: 10,
      falsePositive: 0,
      trueNegative: 0,
      falseNegative: 0,
    };

    expect(
      goldSetEvaluationFlags({
        evaluation,
        expectationCount: 10,
        nearMissCount: 0,
        missingDataScopeCount: 0,
        holdoutAvailable: false,
      }),
    ).toEqual([
      "holdout_unavailable",
      "missing_data_scope_unavailable",
      "near_miss_set_unavailable",
      "no_confirmed_negative_labels",
      "positive_only_gold_set",
    ]);

    const scorecard = buildDetectorEvaluationScorecard({
      detectorId: "example_detector",
      detectorVersion: "1.0.0",
      detectorName: "Example detector",
      claimTier: "descriptive",
      reviewedLabelCount: 10,
      flags: ["positive_only_gold_set"],
      hardGates: [negativeOrNearMissHardGate({ evaluation, nearMissCount: 0 })],
      components: [
        componentScore({
          componentId: "precision",
          score: 1000,
          reason: "fixture",
        }),
      ],
    });

    expect(scorecard.preGateScore).toBe(1000);
    expect(scorecard.hardGateMultiplier).toBe(0.8);
    expect(scorecard.gatedScore).toBe(800);
    expect(scorecard.recommendation).toBe("watch");
  });

  test("weighted scores ignore null components without treating unknowns as zero", () => {
    expect(
      weightedMeanScore([
        componentScore({
          componentId: "precision",
          score: 900,
          reason: "available",
        }),
        componentScore({
          componentId: "recall",
          score: null,
          reason: "no holdout",
        }),
      ]),
    ).toBe(900);
  });

  test("hard-zero gates block publication", () => {
    const scorecard = buildDetectorEvaluationScorecard({
      detectorId: "example_detector",
      detectorVersion: "1.0.0",
      detectorName: "Example detector",
      claimTier: "descriptive",
      reviewedLabelCount: 40,
      hardGates: [
        {
          gateId: "missing_data_scored_as_clean",
          label: "Missing data discipline",
          passed: false,
          multiplier: 0,
          reason: "fixture",
        },
      ],
      components: [
        componentScore({
          componentId: "precision",
          score: 950,
          reason: "fixture",
        }),
      ],
    });

    expect(scorecard.gatedScore).toBe(0);
    expect(scorecard.recommendation).toBe("block_publication");
  });
});

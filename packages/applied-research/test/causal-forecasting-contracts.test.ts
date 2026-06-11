import { describe, expect, test } from "bun:test";
import { evaluateCausalStudyReadiness } from "../src/causal";
import { scoreForecastCalibration } from "../src/forecasting";

describe("causal and forecasting study contracts", () => {
  test("keeps causal claims associational until all validity gates pass", () => {
    expect(
      evaluateCausalStudyReadiness({
        hasTreatmentInventory: true,
        hasEligibleControlPool: true,
        preTrendCheckPassed: true,
        placeboInTimePassed: false,
        placeboInSpacePassed: true,
        autocorrelationChecked: true,
        controlledAndUncontrolledDivergenceFlagged: true,
        humanMethodologyApproval: false,
      }),
    ).toMatchObject({
      claimTier: "associational",
      eligibleForAutoPublish: false,
      failedGates: ["placeboInTimePassed"],
    });
  });

  test("requires human methodology approval before causal language", () => {
    const gates = {
      hasTreatmentInventory: true,
      hasEligibleControlPool: true,
      preTrendCheckPassed: true,
      placeboInTimePassed: true,
      placeboInSpacePassed: true,
      autocorrelationChecked: true,
      controlledAndUncontrolledDivergenceFlagged: true,
      humanMethodologyApproval: false,
    };

    expect(evaluateCausalStudyReadiness(gates).claimTier).toBe("candidate_causal_needs_review");
    expect(
      evaluateCausalStudyReadiness({ ...gates, humanMethodologyApproval: true }).claimTier,
    ).toBe("approved_causal");
  });

  test("scores forecast calibration with explicit missing metrics", () => {
    expect(
      scoreForecastCalibration({
        pinballLoss: 0.18,
        intervalCoverageError: 0.1,
        sharpnessPenalty: null,
        driftPenalty: 0.25,
      }),
    ).toEqual({
      score: 836,
      missingMetrics: ["sharpnessPenalty"],
    });
  });
});

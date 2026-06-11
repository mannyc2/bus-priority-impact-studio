export type InterventionGateStatus = "passes" | "fails" | "not_tested";

export type InterventionGateSummaryInput = {
  controlEligibilityStatus: "eligible" | "insufficient_controls" | "not_evaluated";
  preTrendStatus: InterventionGateStatus;
  placeboInTimeStatus: InterventionGateStatus;
  placeboInSpaceStatus: InterventionGateStatus;
  autocorrelationStatus: InterventionGateStatus;
  methodDivergenceStatus: InterventionGateStatus;
};

export type InterventionGateSummary = InterventionGateSummaryInput & {
  associationallyScoreable: boolean;
  candidateCausalEligible: boolean;
  blockingReasons: string[];
};

export function summarizeInterventionGates(
  input: InterventionGateSummaryInput,
): InterventionGateSummary {
  const blockingReasons: string[] = [];
  if (input.controlEligibilityStatus !== "eligible") {
    blockingReasons.push("no_counterfactual");
  }
  if (input.preTrendStatus === "fails") blockingReasons.push("pre_trend_failed");
  if (input.placeboInTimeStatus === "fails") blockingReasons.push("placebo_in_time_failed");
  if (input.placeboInSpaceStatus === "fails") blockingReasons.push("placebo_in_space_failed");
  if (input.autocorrelationStatus === "fails") blockingReasons.push("autocorrelation_failed");
  if (input.methodDivergenceStatus === "fails") blockingReasons.push("method_divergence");

  const allCausalGatesTestedAndPassed =
    input.controlEligibilityStatus === "eligible" &&
    input.preTrendStatus === "passes" &&
    input.placeboInTimeStatus === "passes" &&
    input.placeboInSpaceStatus === "passes" &&
    input.autocorrelationStatus === "passes" &&
    input.methodDivergenceStatus === "passes";

  return {
    ...input,
    associationallyScoreable: input.controlEligibilityStatus === "eligible",
    candidateCausalEligible: allCausalGatesTestedAndPassed,
    blockingReasons,
  };
}

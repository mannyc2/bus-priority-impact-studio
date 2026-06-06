import type { ResearchGrain } from "../core/grain";
import type { HistoryWindow, IsoMonthString } from "../core/windows";

export {
  buildInterventionPanelArtifact,
  type InterventionPanelArtifact,
  type InterventionPanelRow,
} from "./intervention-panel";

export type CausalStudyMethod =
  | "event_study"
  | "interrupted_time_series"
  | "difference_in_differences"
  | "synthetic_control";

export type CausalClaimTier = "associational" | "candidate_causal_needs_review" | "approved_causal";

export type CausalValidityGates = {
  readonly hasTreatmentInventory: boolean;
  readonly hasEligibleControlPool: boolean;
  readonly preTrendCheckPassed: boolean;
  readonly placeboInTimePassed: boolean;
  readonly placeboInSpacePassed: boolean;
  readonly autocorrelationChecked: boolean;
  readonly controlledAndUncontrolledDivergenceFlagged: boolean;
  readonly humanMethodologyApproval: boolean;
};

export type CausalPanelDefinition = {
  readonly id: string;
  readonly interventionId: string;
  readonly outcomeMetric: string;
  readonly method: CausalStudyMethod;
  readonly grain: ResearchGrain;
  readonly releaseMonth: IsoMonthString;
  readonly historyWindow: HistoryWindow;
  readonly treatedUnits: readonly string[];
  readonly controlPoolSize: number;
  readonly gates: CausalValidityGates;
};

export type CausalStudyReadiness = {
  readonly claimTier: CausalClaimTier;
  readonly eligibleForAutoPublish: false;
  readonly passedGateCount: number;
  readonly failedGates: readonly (keyof CausalValidityGates)[];
};

const PROMOTION_GATES: readonly (keyof CausalValidityGates)[] = [
  "hasTreatmentInventory",
  "hasEligibleControlPool",
  "preTrendCheckPassed",
  "placeboInTimePassed",
  "placeboInSpacePassed",
  "autocorrelationChecked",
  "controlledAndUncontrolledDivergenceFlagged",
];

export function evaluateCausalStudyReadiness(gates: CausalValidityGates): CausalStudyReadiness {
  const failedGates = PROMOTION_GATES.filter((gate) => !gates[gate]);
  const passedGateCount = PROMOTION_GATES.length - failedGates.length;
  const claimTier =
    failedGates.length === 0 && gates.humanMethodologyApproval
      ? "approved_causal"
      : failedGates.length === 0
        ? "candidate_causal_needs_review"
        : "associational";

  return {
    claimTier,
    eligibleForAutoPublish: false,
    passedGateCount,
    failedGates,
  };
}

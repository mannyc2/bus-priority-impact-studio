import type { ResearchGrain } from "../core/grain";
import type { HistoryWindow, IsoMonthString } from "../core/windows";

export {
  buildInterventionPanelArtifact,
  type InterventionPanelArtifact,
  type InterventionPanelRow,
} from "./intervention-panel";
export {
  buildEventFamilyEffectPanelArtifact,
  buildEventFamilyResponseDriftStudyArtifact,
  buildEventEffectContrastArtifact,
  buildMechanismCorroborationArtifact,
  buildPulseCandidateSetArtifact,
  buildPulseEventOverlapArtifact,
  type EffectDirection,
  type EventFamilyDriftDirection,
  type EventFamilyEffectPanelArtifact,
  type EventFamilyEffectPanelRow,
  type EventFamilyResponseDriftRow,
  type EventFamilyResponseDriftStudyArtifact,
  type EventFamilyTimeRegime,
  type EventEffectContrastArtifact,
  type EventEffectContrastRow,
  type MechanismCorroborationArtifact,
  type MechanismCorroborationRow,
  type MechanismCorroborationStatus,
  type PulseCandidate,
  type PulseCandidateSetArtifact,
  type PulseEventOverlapArtifact,
  type PulseEventOverlapRow,
} from "./research-products";

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

export type CausalValidationGateId =
  | "pre_trend"
  | "placebo_in_time"
  | "placebo_in_space"
  | "autocorrelation"
  | "method_divergence"
  | "event_family_placebos"
  | "temporal_transportability"
  | "regime_sensitivity";

export type CausalValidationGateStatus = "pass" | "warn" | "fail";

export type CausalValidationGate = {
  readonly gateId: CausalValidationGateId;
  readonly status: CausalValidationGateStatus;
  readonly reasons: readonly string[];
  readonly metrics: {
    readonly passCount: number;
    readonly failCount: number;
    readonly notTestedCount: number;
    readonly testedCount: number;
    readonly testedShare: number;
  };
};

export type CausalValidationGatesArtifact = {
  readonly artifactKind: "causal_validation_gates";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly artifactPath: string;
  readonly sourcePanelPath: string;
  readonly sourceEventFamilyEffectPanelPath: string | null;
  readonly sourceEventFamilyResponseDriftStudyPath: string | null;
  readonly sourceModelId: "treatment_event_panel_v1";
  readonly summary: {
    readonly panelRowCount: number;
    readonly supportedRowCount: number;
    readonly candidateCausalEligibleRowCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly passGateCount: number;
    readonly warnGateCount: number;
    readonly failGateCount: number;
  };
  readonly gates: readonly CausalValidationGate[];
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function nestedObject(root: Record<string, unknown> | null, path: readonly string[]) {
  let current: Record<string, unknown> | null = root;
  for (const segment of path) {
    current = objectValue(current?.[segment]);
    if (current === null) return null;
  }
  return current;
}

function gateFromCounts(
  gateId: CausalValidationGateId,
  counts: Record<string, unknown> | null,
): CausalValidationGate {
  const passCount = numberValue(counts?.["passes"]);
  const failCount = numberValue(counts?.["fails"]);
  const notTestedCount = numberValue(counts?.["not_tested"]);
  const testedCount = passCount + failCount;
  const total = testedCount + notTestedCount;
  const testedShare = total === 0 ? 0 : round(testedCount / total);
  const status: CausalValidationGateStatus =
    testedCount === 0 ? "fail" : failCount > 0 || testedShare < 0.5 ? "warn" : "pass";
  const reasons =
    status === "pass"
      ? []
      : testedCount === 0
        ? ["no_rows_tested"]
        : ["some_rows_failed_or_untested"];
  return {
    gateId,
    status,
    reasons,
    metrics: { passCount, failCount, notTestedCount, testedCount, testedShare },
  };
}

function familyGate(input: {
  readonly gateId: CausalValidationGateId;
  readonly passCount: number;
  readonly failCount: number;
  readonly notTestedCount: number;
  readonly reasons: readonly string[];
}): CausalValidationGate {
  const testedCount = input.passCount + input.failCount;
  const total = testedCount + input.notTestedCount;
  const testedShare = total === 0 ? 0 : round(testedCount / total);
  const status: CausalValidationGateStatus =
    total === 0 ? "fail" : input.failCount > 0 || input.reasons.length > 0 ? "warn" : "pass";
  return {
    gateId: input.gateId,
    status,
    reasons: status === "pass" ? [] : input.reasons.length > 0 ? input.reasons : ["no_rows_tested"],
    metrics: {
      passCount: input.passCount,
      failCount: input.failCount,
      notTestedCount: input.notTestedCount,
      testedCount,
      testedShare,
    },
  };
}

function eventFamilyValidationGates(input: {
  readonly eventFamilyEffectPanel: unknown | null;
  readonly eventFamilyResponseDriftStudy: unknown | null;
}): readonly CausalValidationGate[] {
  const panelRoot = objectValue(input.eventFamilyEffectPanel);
  if (panelRoot === null) return [];
  const panelSummary = objectValue(panelRoot["summary"]);
  const driftSummary = objectValue(objectValue(input.eventFamilyResponseDriftStudy)?.["summary"]);
  const panelRowCount = numberValue(panelSummary?.["panelRowCount"]);
  const familyCount = numberValue(panelSummary?.["familyCount"]);
  const comparableFamilyCount = numberValue(panelSummary?.["comparableFamilyCount"]);
  const mixedCount = numberValue(panelSummary?.["mixedContrastCount"]);
  const driftComparableFamilyCount = numberValue(driftSummary?.["comparableFamilyCount"]);
  const driftFamilyCount = numberValue(driftSummary?.["familyCount"]);
  const unresolvedFamilyCount = Math.max(familyCount - comparableFamilyCount, 0);
  return [
    familyGate({
      gateId: "event_family_placebos",
      passCount: mixedCount,
      failCount: 0,
      notTestedCount: Math.max(panelRowCount - mixedCount, 0),
      reasons: [
        "screening_proxy_only",
        ...(mixedCount === 0 ? ["no_mixed_or_placebo_like_family_signals"] : []),
      ],
    }),
    familyGate({
      gateId: "temporal_transportability",
      passCount: comparableFamilyCount,
      failCount: 0,
      notTestedCount: unresolvedFamilyCount,
      reasons: [
        "coarse_time_regime_proxy",
        ...(comparableFamilyCount === 0 ? ["no_family_has_multiple_time_regimes"] : []),
      ],
    }),
    familyGate({
      gateId: "regime_sensitivity",
      passCount: driftComparableFamilyCount,
      failCount: 0,
      notTestedCount: Math.max(driftFamilyCount - driftComparableFamilyCount, 0),
      reasons: [
        "exploratory_response_drift_only",
        ...(driftComparableFamilyCount === 0 ? ["response_drift_has_no_comparable_families"] : []),
      ],
    }),
  ];
}

export function buildCausalValidationGatesArtifact(input: {
  readonly treatmentEventPanel: unknown;
  readonly eventFamilyEffectPanel?: unknown | null;
  readonly eventFamilyResponseDriftStudy?: unknown | null;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly artifactPath: string;
  readonly sourcePanelPath: string;
  readonly sourceEventFamilyEffectPanelPath?: string | null;
  readonly sourceEventFamilyResponseDriftStudyPath?: string | null;
}): CausalValidationGatesArtifact {
  const root = objectValue(input.treatmentEventPanel);
  const summary = objectValue(root?.["summary"]);
  const gateStatusCounts = objectValue(summary?.["gateStatusCounts"]);
  const gates: CausalValidationGate[] = [
    gateFromCounts("pre_trend", objectValue(gateStatusCounts?.["preTrendStatus"])),
    gateFromCounts("placebo_in_time", objectValue(gateStatusCounts?.["placeboInTimeStatus"])),
    gateFromCounts("placebo_in_space", objectValue(gateStatusCounts?.["placeboInSpaceStatus"])),
    gateFromCounts("autocorrelation", objectValue(gateStatusCounts?.["autocorrelationStatus"])),
    gateFromCounts(
      "method_divergence",
      objectValue(gateStatusCounts?.["methodDivergenceStatus"]),
    ),
    ...eventFamilyValidationGates({
      eventFamilyEffectPanel: input.eventFamilyEffectPanel ?? null,
      eventFamilyResponseDriftStudy: input.eventFamilyResponseDriftStudy ?? null,
    }),
  ];
  return {
    artifactKind: "causal_validation_gates",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    historyWindow: {
      startMonth:
        typeof nestedObject(root, ["historyWindow"])?.["startMonth"] === "string"
          ? (nestedObject(root, ["historyWindow"])?.["startMonth"] as string)
          : input.historyStartMonth,
      endMonth:
        typeof nestedObject(root, ["historyWindow"])?.["endMonth"] === "string"
          ? (nestedObject(root, ["historyWindow"])?.["endMonth"] as string)
          : input.releaseMonth,
    },
    artifactPath: input.artifactPath,
    sourcePanelPath: input.sourcePanelPath,
    sourceEventFamilyEffectPanelPath: input.sourceEventFamilyEffectPanelPath ?? null,
    sourceEventFamilyResponseDriftStudyPath:
      input.sourceEventFamilyResponseDriftStudyPath ?? null,
    sourceModelId: "treatment_event_panel_v1",
    summary: {
      panelRowCount: numberValue(summary?.["panelRowCount"]),
      supportedRowCount: numberValue(summary?.["supportedRowCount"]),
      candidateCausalEligibleRowCount: numberValue(summary?.["candidateCausalEligibleRowCount"]),
      routeCount: numberValue(summary?.["routeCount"]),
      eventCount: numberValue(summary?.["eventCount"]),
      passGateCount: gates.filter((gate) => gate.status === "pass").length,
      warnGateCount: gates.filter((gate) => gate.status === "warn").length,
      failGateCount: gates.filter((gate) => gate.status === "fail").length,
    },
    gates,
  };
}

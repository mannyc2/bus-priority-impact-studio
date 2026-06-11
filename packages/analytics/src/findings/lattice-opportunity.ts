import { stableId } from "../core/ids.js";
import { mergeThresholds } from "../core/numbers.js";
import {
  deducePowersetLattice,
  type LatticeSolution,
  type PowersetLatticeState,
} from "../lattice-deduction.js";

export const LATTICE_REVIEW_BUNDLE_METHOD_ID = "lattice_review_bundle";

export type LatticeOpportunityInterventionStatus =
  | "absent"
  | "thin_source_gap"
  | "future_only"
  | "dated_or_evaluated";

export type LatticeOpportunityRouteInput = {
  routeId: string;
  speedPainScore: number | null;
  reliabilityPainScore: number | null;
  interventionEvidenceStatus: LatticeOpportunityInterventionStatus;
  busLaneStatus: "present" | "absent" | "unknown";
  aceStatus: "active" | "inactive" | "unknown";
  permitContextScore?: number | null;
  serviceRequestContextScore?: number | null;
  scheduleMismatchScore?: number | null;
  travelTimeVariabilityScore?: number | null;
  bunchingHotspotScore?: number | null;
  riderWeightedExcessWaitScore?: number | null;
  interventionUnderperformanceScore?: number | null;
  positiveDevianceScore?: number | null;
};

export type LatticeOpportunityThresholds = {
  minPainScore: number;
  minContextScore: number;
  minReliabilityPocketScore: number;
  minScheduleMismatchScore: number;
  minTreatmentSignalScore: number;
  maxSurvivingOpportunityKinds: number;
};

export const DEFAULT_LATTICE_OPPORTUNITY_THRESHOLDS: LatticeOpportunityThresholds = {
  minPainScore: 75,
  minContextScore: 70,
  minReliabilityPocketScore: 70,
  minScheduleMismatchScore: 70,
  minTreatmentSignalScore: 75,
  maxSurvivingOpportunityKinds: 2,
};

export type LatticeOpportunityBundleInput = {
  bundleRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<LatticeOpportunityRouteInput>;
  thresholds?: Partial<LatticeOpportunityThresholds>;
};

export type LatticeOpportunitySourceScores = {
  speedPainScore: number | null;
  reliabilityPainScore: number | null;
  permitContextScore: number | null;
  serviceRequestContextScore: number | null;
  scheduleMismatchScore: number | null;
  travelTimeVariabilityScore: number | null;
  bunchingHotspotScore: number | null;
  riderWeightedExcessWaitScore: number | null;
  interventionUnderperformanceScore: number | null;
  positiveDevianceScore: number | null;
};

export type LatticeOpportunityAssessmentOutcome = "bundle" | "clean_no_bundle" | "abstained";

export type LatticeOpportunityAssessmentReasonCode =
  | "ambiguous_lattice_bundle"
  | "unsupported_lattice_bundle";

export type LatticeOpportunityScoringComponents = {
  overallScore: number;
  rawKindScore: number;
  maxSourceSignalScore: number;
  speedPainScore: number | null;
  reliabilityPainScore: number | null;
  contextScore: number;
  reliabilityShapeScore: number;
  scheduleMismatchScore: number | null;
  treatmentSignalScore: number;
  specificityScore: number;
  ambiguityPenalty: number;
  sourceThinnessPenalty: number;
};

export type LatticeOpportunityBundle = {
  bundleId: string;
  bundleRunId: string;
  methodId: typeof LATTICE_REVIEW_BUNDLE_METHOD_ID;
  routeId: string;
  month: string;
  opportunityKinds: MtaOpportunityKind[];
  labels: string[];
  reviewScore: number;
  confidence: "medium" | "high";
  claimText: string;
  initialState: PowersetLatticeState;
  deducedState: Record<string, string[]>;
  survivingSolutionCount: number;
  eliminatedCandidateCount: number;
  scoringComponents: LatticeOpportunityScoringComponents;
  sourceScores: LatticeOpportunitySourceScores;
  methodLimitations: string[];
  createdAt: string;
};

export type LatticeOpportunityRouteAssessment = {
  assessmentId: string;
  bundleRunId: string;
  methodId: typeof LATTICE_REVIEW_BUNDLE_METHOD_ID;
  routeId: string;
  month: string;
  outcome: LatticeOpportunityAssessmentOutcome;
  reasonCode: LatticeOpportunityAssessmentReasonCode | null;
  reason: string | null;
  initialState: PowersetLatticeState;
  deducedState: Record<string, string[]>;
  survivingKinds: string[];
  survivingOpportunityKinds: MtaOpportunityKind[];
  survivingSolutionCount: number;
  eliminatedCandidateCount: number;
  createdAt: string;
};

export type LatticeOpportunityBundleOutput = {
  bundles: LatticeOpportunityBundle[];
  assessments: LatticeOpportunityRouteAssessment[];
};

const OPPORTUNITY_POSITIONS = [
  "pain_pattern",
  "intervention_posture",
  "curb_enforcement_context",
  "street_context",
  "reliability_shape",
  "schedule_shape",
  "treatment_evidence",
  "opportunity_kind",
] as const;

type OpportunityPosition = (typeof OPPORTUNITY_POSITIONS)[number];

const NO_CLEAR_OPPORTUNITY = "no_clear_opportunity";

export const MTA_OPPORTUNITY_KINDS = [
  "untreated_speed_priority",
  "enforcement_gap_review",
  "context_timed_street_management",
  "reliability_dispatch_review",
  "schedule_runtime_review",
  "underperforming_treatment_review",
  "positive_deviance_transfer",
] as const;

export type MtaOpportunityKind = (typeof MTA_OPPORTUNITY_KINDS)[number];
type OpportunityKind = MtaOpportunityKind | typeof NO_CLEAR_OPPORTUNITY;

const OPPORTUNITY_LABELS: Record<OpportunityKind, string> = {
  untreated_speed_priority: "untreated speed-priority corridor review",
  enforcement_gap_review: "bus-lane or ACE enforcement-gap review",
  context_timed_street_management: "context-timed street-management review",
  reliability_dispatch_review: "stop-hour reliability and dispatch review",
  schedule_runtime_review: "schedule/runtime alignment review",
  underperforming_treatment_review: "underperforming treatment review",
  positive_deviance_transfer: "positive-deviance transfer review",
  no_clear_opportunity: "no clear opportunity",
};

const CANDIDATES_BY_POSITION: Record<OpportunityPosition, readonly string[]> = {
  pain_pattern: ["low", "speed", "reliability", "combined"],
  intervention_posture: ["absent", "thin_source_gap", "future_only", "dated_or_evaluated"],
  curb_enforcement_context: ["bus_lane_without_ace", "bus_lane_or_ace_present", "none_or_unknown"],
  street_context: ["quiet_or_unknown", "permit", "service_request", "mixed_context"],
  reliability_shape: ["none_or_unknown", "ewt_or_bunching", "runtime_variability"],
  schedule_shape: ["none_or_unknown", "mismatch"],
  treatment_evidence: ["none_or_unknown", "negative_or_underperforming", "positive_or_learning"],
  opportunity_kind: [...MTA_OPPORTUNITY_KINDS, NO_CLEAR_OPPORTUNITY],
};

type ArchetypeTemplate = Record<OpportunityPosition, readonly string[]>;

function template(
  opportunityKind: OpportunityKind,
  values: Omit<ArchetypeTemplate, "opportunity_kind">,
): ArchetypeTemplate {
  return { ...values, opportunity_kind: [opportunityKind] };
}

const ARCHETYPE_TEMPLATES: ArchetypeTemplate[] = [
  template("untreated_speed_priority", {
    pain_pattern: ["speed", "combined"],
    intervention_posture: ["absent", "thin_source_gap"],
    curb_enforcement_context: ["none_or_unknown", "bus_lane_or_ace_present"],
    street_context: ["quiet_or_unknown"],
    reliability_shape: ["none_or_unknown", "runtime_variability"],
    schedule_shape: ["none_or_unknown"],
    treatment_evidence: ["none_or_unknown"],
  }),
  template("enforcement_gap_review", {
    pain_pattern: ["speed", "combined"],
    intervention_posture: ["absent", "thin_source_gap", "dated_or_evaluated"],
    curb_enforcement_context: ["bus_lane_without_ace"],
    street_context: ["quiet_or_unknown", "permit", "service_request", "mixed_context"],
    reliability_shape: ["none_or_unknown", "runtime_variability"],
    schedule_shape: ["none_or_unknown"],
    treatment_evidence: ["none_or_unknown"],
  }),
  template("context_timed_street_management", {
    pain_pattern: ["speed", "combined"],
    intervention_posture: ["absent", "thin_source_gap", "future_only", "dated_or_evaluated"],
    curb_enforcement_context: ["none_or_unknown", "bus_lane_or_ace_present"],
    street_context: ["permit", "service_request", "mixed_context"],
    reliability_shape: ["none_or_unknown", "runtime_variability"],
    schedule_shape: ["none_or_unknown"],
    treatment_evidence: ["none_or_unknown"],
  }),
  template("reliability_dispatch_review", {
    pain_pattern: ["reliability", "combined"],
    intervention_posture: ["absent", "thin_source_gap", "future_only", "dated_or_evaluated"],
    curb_enforcement_context: [
      "none_or_unknown",
      "bus_lane_or_ace_present",
      "bus_lane_without_ace",
    ],
    street_context: ["quiet_or_unknown", "mixed_context"],
    reliability_shape: ["ewt_or_bunching"],
    schedule_shape: ["none_or_unknown"],
    treatment_evidence: ["none_or_unknown"],
  }),
  template("schedule_runtime_review", {
    pain_pattern: ["speed", "reliability", "combined"],
    intervention_posture: ["absent", "thin_source_gap", "future_only", "dated_or_evaluated"],
    curb_enforcement_context: [
      "none_or_unknown",
      "bus_lane_or_ace_present",
      "bus_lane_without_ace",
    ],
    street_context: ["quiet_or_unknown", "permit", "service_request", "mixed_context"],
    reliability_shape: ["none_or_unknown", "runtime_variability"],
    schedule_shape: ["mismatch"],
    treatment_evidence: ["none_or_unknown"],
  }),
  template("underperforming_treatment_review", {
    pain_pattern: ["speed", "reliability", "combined"],
    intervention_posture: ["dated_or_evaluated"],
    curb_enforcement_context: [
      "none_or_unknown",
      "bus_lane_or_ace_present",
      "bus_lane_without_ace",
    ],
    street_context: ["quiet_or_unknown", "permit", "service_request", "mixed_context"],
    reliability_shape: ["none_or_unknown", "ewt_or_bunching", "runtime_variability"],
    schedule_shape: ["none_or_unknown", "mismatch"],
    treatment_evidence: ["negative_or_underperforming"],
  }),
  template("positive_deviance_transfer", {
    pain_pattern: ["low"],
    intervention_posture: ["dated_or_evaluated"],
    curb_enforcement_context: ["none_or_unknown", "bus_lane_or_ace_present"],
    street_context: ["quiet_or_unknown", "permit", "service_request", "mixed_context"],
    reliability_shape: ["none_or_unknown"],
    schedule_shape: ["none_or_unknown"],
    treatment_evidence: ["positive_or_learning"],
  }),
  template(NO_CLEAR_OPPORTUNITY, {
    pain_pattern: ["low"],
    intervention_posture: ["absent", "thin_source_gap", "future_only", "dated_or_evaluated"],
    curb_enforcement_context: ["none_or_unknown", "bus_lane_or_ace_present"],
    street_context: ["quiet_or_unknown"],
    reliability_shape: ["none_or_unknown"],
    schedule_shape: ["none_or_unknown"],
    treatment_evidence: ["none_or_unknown"],
  }),
];

function expandTemplate(
  templateValues: ArchetypeTemplate,
  positionIndex = 0,
  partial: Record<string, string> = {},
): LatticeSolution[] {
  const position = OPPORTUNITY_POSITIONS[positionIndex];
  if (position === undefined) return [partial];

  return templateValues[position].flatMap((candidate) =>
    expandTemplate(templateValues, positionIndex + 1, { ...partial, [position]: candidate }),
  );
}

const OPPORTUNITY_SOLUTIONS: readonly LatticeSolution[] = ARCHETYPE_TEMPLATES.flatMap((archetype) =>
  expandTemplate(archetype),
);

function maxScore(values: readonly (number | null | undefined)[]): number {
  return Math.max(
    0,
    ...values.filter((value): value is number => value !== null && value !== undefined),
  );
}

function scoreHit(value: number | null | undefined, threshold: number): boolean {
  return value !== null && value !== undefined && value >= threshold;
}

function painCandidates(
  route: LatticeOpportunityRouteInput,
  thresholds: LatticeOpportunityThresholds,
): string[] {
  const speedHit = scoreHit(route.speedPainScore, thresholds.minPainScore);
  const reliabilityHit = scoreHit(route.reliabilityPainScore, thresholds.minPainScore);
  if (speedHit && reliabilityHit) return ["combined"];
  if (speedHit) return route.reliabilityPainScore === null ? ["speed", "combined"] : ["speed"];
  if (reliabilityHit) {
    return route.speedPainScore === null ? ["reliability", "combined"] : ["reliability"];
  }
  return ["low"];
}

function streetContextCandidates(
  route: LatticeOpportunityRouteInput,
  thresholds: LatticeOpportunityThresholds,
): string[] {
  const permit = scoreHit(route.permitContextScore, thresholds.minContextScore);
  const serviceRequest = scoreHit(route.serviceRequestContextScore, thresholds.minContextScore);
  if (permit && serviceRequest) return ["mixed_context"];
  if (permit) return ["permit"];
  if (serviceRequest) return ["service_request"];
  return ["quiet_or_unknown"];
}

function reliabilityShapeCandidates(
  route: LatticeOpportunityRouteInput,
  thresholds: LatticeOpportunityThresholds,
): string[] {
  const ewtOrBunching =
    scoreHit(route.bunchingHotspotScore, thresholds.minReliabilityPocketScore) ||
    scoreHit(route.riderWeightedExcessWaitScore, thresholds.minReliabilityPocketScore);
  const runtimeVariability = scoreHit(
    route.travelTimeVariabilityScore,
    thresholds.minReliabilityPocketScore,
  );
  if (ewtOrBunching && runtimeVariability) return ["ewt_or_bunching", "runtime_variability"];
  if (ewtOrBunching) return ["ewt_or_bunching"];
  if (runtimeVariability) return ["runtime_variability"];
  return ["none_or_unknown"];
}

function treatmentEvidenceCandidates(
  route: LatticeOpportunityRouteInput,
  thresholds: LatticeOpportunityThresholds,
): string[] {
  const underperforming = scoreHit(
    route.interventionUnderperformanceScore,
    thresholds.minTreatmentSignalScore,
  );
  const positive = scoreHit(route.positiveDevianceScore, thresholds.minTreatmentSignalScore);
  if (underperforming && positive) return ["negative_or_underperforming", "positive_or_learning"];
  if (underperforming) return ["negative_or_underperforming"];
  if (positive) return ["positive_or_learning"];
  return ["none_or_unknown"];
}

function routeState(
  route: LatticeOpportunityRouteInput,
  thresholds: LatticeOpportunityThresholds,
): PowersetLatticeState {
  const curb =
    route.busLaneStatus === "present" && route.aceStatus !== "active"
      ? "bus_lane_without_ace"
      : route.busLaneStatus === "present" || route.aceStatus === "active"
        ? "bus_lane_or_ace_present"
        : "none_or_unknown";
  const schedule = scoreHit(route.scheduleMismatchScore, thresholds.minScheduleMismatchScore)
    ? "mismatch"
    : "none_or_unknown";

  return {
    pain_pattern: painCandidates(route, thresholds),
    intervention_posture: [route.interventionEvidenceStatus],
    curb_enforcement_context: [curb],
    street_context: streetContextCandidates(route, thresholds),
    reliability_shape: reliabilityShapeCandidates(route, thresholds),
    schedule_shape: [schedule],
    treatment_evidence: treatmentEvidenceCandidates(route, thresholds),
    opportunity_kind: CANDIDATES_BY_POSITION.opportunity_kind,
  };
}

function realOpportunityKinds(kinds: readonly string[]): MtaOpportunityKind[] {
  const known = new Set<string>(MTA_OPPORTUNITY_KINDS);
  return kinds.filter((kind): kind is MtaOpportunityKind => known.has(kind));
}

function signalScore(route: LatticeOpportunityRouteInput): number {
  return maxScore([
    route.speedPainScore,
    route.reliabilityPainScore,
    route.permitContextScore,
    route.serviceRequestContextScore,
    route.scheduleMismatchScore,
    route.travelTimeVariabilityScore,
    route.bunchingHotspotScore,
    route.riderWeightedExcessWaitScore,
    route.interventionUnderperformanceScore,
    route.positiveDevianceScore,
  ]);
}

function scoreValue(value: number | null | undefined): number {
  return value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
}

function weightedScore(parts: readonly { score: number; weight: number }[]): number {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;
  return parts.reduce((sum, part) => sum + scoreValue(part.score) * part.weight, 0) / totalWeight;
}

function contextScore(route: LatticeOpportunityRouteInput): number {
  return maxScore([route.permitContextScore, route.serviceRequestContextScore]);
}

function reliabilityShapeScore(route: LatticeOpportunityRouteInput): number {
  return maxScore([
    route.bunchingHotspotScore,
    route.riderWeightedExcessWaitScore,
    route.travelTimeVariabilityScore,
  ]);
}

function painScore(route: LatticeOpportunityRouteInput): number {
  return maxScore([route.speedPainScore, route.reliabilityPainScore]);
}

function interventionPostureScore(route: LatticeOpportunityRouteInput): number {
  if (route.interventionEvidenceStatus === "dated_or_evaluated") return 90;
  if (route.interventionEvidenceStatus === "future_only") return 60;
  if (route.interventionEvidenceStatus === "thin_source_gap") return 50;
  return 45;
}

function curbEvidenceScore(route: LatticeOpportunityRouteInput): number {
  if (route.busLaneStatus !== "present") return 0;
  if (route.aceStatus === "inactive") return 90;
  if (route.aceStatus === "unknown") return 72;
  return 55;
}

function specificityScore(opportunityKinds: readonly string[]): number {
  return Math.max(45, 92 - Math.max(0, opportunityKinds.length - 1) * 16);
}

function kindReviewScore(route: LatticeOpportunityRouteInput, kind: MtaOpportunityKind): number {
  const specificity = specificityScore([kind]);
  const speed = scoreValue(route.speedPainScore);
  const reliability = scoreValue(route.reliabilityPainScore);
  const context = contextScore(route);
  const shape = reliabilityShapeScore(route);

  if (kind === "untreated_speed_priority") {
    return weightedScore([
      { score: speed, weight: 0.45 },
      { score: interventionPostureScore(route), weight: 0.25 },
      { score: Math.max(0, 100 - context), weight: 0.15 },
      { score: specificity, weight: 0.15 },
    ]);
  }
  if (kind === "enforcement_gap_review") {
    return weightedScore([
      { score: speed, weight: 0.35 },
      { score: curbEvidenceScore(route), weight: 0.35 },
      { score: context, weight: 0.1 },
      { score: interventionPostureScore(route), weight: 0.1 },
      { score: specificity, weight: 0.1 },
    ]);
  }
  if (kind === "context_timed_street_management") {
    return weightedScore([
      { score: speed, weight: 0.4 },
      { score: context, weight: 0.35 },
      { score: shape, weight: 0.1 },
      { score: specificity, weight: 0.15 },
    ]);
  }
  if (kind === "reliability_dispatch_review") {
    return weightedScore([
      { score: reliability, weight: 0.35 },
      { score: shape, weight: 0.4 },
      { score: speed, weight: 0.1 },
      { score: specificity, weight: 0.15 },
    ]);
  }
  if (kind === "schedule_runtime_review") {
    return weightedScore([
      { score: route.scheduleMismatchScore ?? 0, weight: 0.5 },
      { score: painScore(route), weight: 0.25 },
      { score: route.travelTimeVariabilityScore ?? 0, weight: 0.1 },
      { score: specificity, weight: 0.15 },
    ]);
  }
  if (kind === "underperforming_treatment_review") {
    return weightedScore([
      { score: route.interventionUnderperformanceScore ?? 0, weight: 0.45 },
      { score: painScore(route), weight: 0.25 },
      { score: interventionPostureScore(route), weight: 0.2 },
      { score: specificity, weight: 0.1 },
    ]);
  }

  return weightedScore([
    { score: route.positiveDevianceScore ?? 0, weight: 0.5 },
    { score: Math.max(0, 100 - painScore(route)), weight: 0.25 },
    { score: interventionPostureScore(route), weight: 0.15 },
    { score: specificity, weight: 0.1 },
  ]);
}

function scoringComponentsFor(
  route: LatticeOpportunityRouteInput,
  opportunityKinds: readonly MtaOpportunityKind[],
): LatticeOpportunityScoringComponents {
  const rawKindScore =
    opportunityKinds.length === 0
      ? 0
      : opportunityKinds.reduce((sum, kind) => sum + kindReviewScore(route, kind), 0) /
        opportunityKinds.length;
  const ambiguityPenalty = Math.max(0, opportunityKinds.length - 1) * 8;
  const sourceThinnessPenalty =
    route.busLaneStatus === "present" && route.aceStatus === "unknown"
      ? 5
      : route.interventionEvidenceStatus === "thin_source_gap"
        ? 4
        : 0;
  const overallScore = Math.round(
    Math.max(0, Math.min(100, rawKindScore - ambiguityPenalty - sourceThinnessPenalty)),
  );

  return {
    overallScore,
    rawKindScore: Math.round(rawKindScore),
    maxSourceSignalScore: signalScore(route),
    speedPainScore: route.speedPainScore,
    reliabilityPainScore: route.reliabilityPainScore,
    contextScore: contextScore(route),
    reliabilityShapeScore: reliabilityShapeScore(route),
    scheduleMismatchScore: route.scheduleMismatchScore ?? null,
    treatmentSignalScore: maxScore([
      route.interventionUnderperformanceScore,
      route.positiveDevianceScore,
    ]),
    specificityScore: specificityScore(opportunityKinds),
    ambiguityPenalty,
    sourceThinnessPenalty,
  };
}

function reviewScoreFor(
  route: LatticeOpportunityRouteInput,
  opportunityKinds: readonly MtaOpportunityKind[],
) {
  return scoringComponentsFor(route, opportunityKinds).overallScore;
}

function confidenceFor(reviewScore: number, opportunityKinds: readonly string[]) {
  return opportunityKinds.length === 1 && reviewScore >= 82 ? "high" : "medium";
}

function claimText(routeId: string, opportunityKinds: readonly MtaOpportunityKind[]): string {
  const labels = opportunityKinds.map((kind) => OPPORTUNITY_LABELS[kind]);
  if (labels.length === 1) {
    return `Route ${routeId} fits a hard-to-surface opportunity: ${labels[0]}.`;
  }
  return `Route ${routeId} fits a narrow opportunity bundle: ${labels.join(" plus ")}.`;
}

function sourceScoresFor(route: LatticeOpportunityRouteInput): LatticeOpportunitySourceScores {
  return {
    speedPainScore: route.speedPainScore ?? null,
    reliabilityPainScore: route.reliabilityPainScore ?? null,
    permitContextScore: route.permitContextScore ?? null,
    serviceRequestContextScore: route.serviceRequestContextScore ?? null,
    scheduleMismatchScore: route.scheduleMismatchScore ?? null,
    travelTimeVariabilityScore: route.travelTimeVariabilityScore ?? null,
    bunchingHotspotScore: route.bunchingHotspotScore ?? null,
    riderWeightedExcessWaitScore: route.riderWeightedExcessWaitScore ?? null,
    interventionUnderperformanceScore: route.interventionUnderperformanceScore ?? null,
    positiveDevianceScore: route.positiveDevianceScore ?? null,
  };
}

const LATTICE_REVIEW_METHOD_LIMITATIONS = [
  "This is a fixed archetype review bundle inspired by Lattice Deduction Transformers, not a trained transformer model.",
  "The bundle is not causal evidence, not a forecast, and not a final intervention recommendation.",
  "Underlying detector packets and source joins must be inspected before any route is promoted.",
  "Novel opportunities outside the hand-authored archetype lattice will not be discovered by this method.",
] as const;

export function buildLatticeOpportunityBundles(
  input: LatticeOpportunityBundleInput,
): LatticeOpportunityBundleOutput {
  const thresholds = mergeThresholds(DEFAULT_LATTICE_OPPORTUNITY_THRESHOLDS, input.thresholds);
  const bundles: LatticeOpportunityBundle[] = [];
  const assessments: LatticeOpportunityRouteAssessment[] = [];

  for (const route of input.routes) {
    const routeId = route.routeId;
    const state = routeState(route, thresholds);
    const deduction = deducePowersetLattice({
      state,
      solutions: OPPORTUNITY_SOLUTIONS,
      positionIds: OPPORTUNITY_POSITIONS,
    });
    const survivingKinds = deduction.deducedState["opportunity_kind"] ?? [];
    const opportunityKinds = realOpportunityKinds(survivingKinds);
    const tooAmbiguous =
      opportunityKinds.length > thresholds.maxSurvivingOpportunityKinds ||
      (opportunityKinds.length > 0 && survivingKinds.includes(NO_CLEAR_OPPORTUNITY));
    const unsupported = deduction.status === "conflict";
    const hit = opportunityKinds.length > 0 && !tooAmbiguous && !unsupported;

    if (hit) {
      const reviewScore = reviewScoreFor(route, opportunityKinds);
      const scoringComponents = scoringComponentsFor(route, opportunityKinds);
      bundles.push({
        bundleId: stableId(input.bundleRunId, "bundle", routeId, opportunityKinds.join(":")),
        bundleRunId: input.bundleRunId,
        methodId: LATTICE_REVIEW_BUNDLE_METHOD_ID,
        routeId,
        month: input.month,
        opportunityKinds: [...opportunityKinds],
        labels: opportunityKinds.map((kind) => OPPORTUNITY_LABELS[kind]),
        reviewScore,
        confidence: confidenceFor(reviewScore, opportunityKinds),
        claimText: claimText(routeId, opportunityKinds),
        initialState: state,
        deducedState: deduction.deducedState,
        survivingSolutionCount: deduction.survivingSolutionCount,
        eliminatedCandidateCount: deduction.eliminatedCandidateCount,
        scoringComponents,
        sourceScores: sourceScoresFor(route),
        methodLimitations: [...LATTICE_REVIEW_METHOD_LIMITATIONS],
        createdAt: input.generatedAt,
      });
    }

    assessments.push({
      assessmentId: stableId(input.bundleRunId, "assessment", routeId),
      bundleRunId: input.bundleRunId,
      methodId: LATTICE_REVIEW_BUNDLE_METHOD_ID,
      routeId,
      month: input.month,
      outcome: unsupported || tooAmbiguous ? "abstained" : hit ? "bundle" : "clean_no_bundle",
      reasonCode: unsupported
        ? "unsupported_lattice_bundle"
        : tooAmbiguous
          ? "ambiguous_lattice_bundle"
          : null,
      reason: unsupported
        ? "The route evidence combination did not match any accepted MTA opportunity archetype."
        : tooAmbiguous
          ? "The route evidence did not narrow to a small enough opportunity set."
          : null,
      initialState: state,
      deducedState: deduction.deducedState,
      survivingKinds,
      survivingOpportunityKinds: opportunityKinds,
      survivingSolutionCount: deduction.survivingSolutionCount,
      eliminatedCandidateCount: deduction.eliminatedCandidateCount,
      createdAt: input.generatedAt,
    });
  }

  return { bundles, assessments };
}

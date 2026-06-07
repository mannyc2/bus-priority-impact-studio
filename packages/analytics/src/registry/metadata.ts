export const DETECTOR_CLAIM_TIERS = [
  "descriptive",
  "associational",
  "candidate_causal_needs_review",
] as const;

export type DetectorClaimTier = (typeof DETECTOR_CLAIM_TIERS)[number];

export const DETECTOR_BASELINE_FAMILIES = [
  "schedule",
  "own_history",
  "free_flow",
  "fleet_distribution",
  "peer",
  "source_coverage",
  "intervention_window",
  "control_routes",
  "synthetic_control",
] as const;

export type DetectorBaselineFamily = (typeof DETECTOR_BASELINE_FAMILIES)[number];

export const DETECTOR_PROMOTION_GATE_KINDS = [
  "sample_support",
  "coverage",
  "baseline_available",
  "source_freshness",
  "spatial_confidence",
  "peer_count",
  "pre_trend",
  "placebo_in_time",
  "placebo_in_space",
  "control_eligibility",
  "autocorrelation",
  "method_divergence",
  "reviewer_approval",
] as const;

export type DetectorPromotionGateKind = (typeof DETECTOR_PROMOTION_GATE_KINDS)[number];

export type DetectorPromotionGate = {
  kind: DetectorPromotionGateKind;
  description: string;
  requiredFor: readonly DetectorClaimTier[];
};

export const DETECTOR_MODEL_ARTIFACT_IDS = [
  "segment_speed_residuals_v1",
  "segment_daypart_residuals_v1",
  "route_peer_residuals_v1",
  "reliability_exposure_panel_v1",
  "intervention_scope_fit_v1",
  "source_gap_model_v1",
  "treatment_event_panel_v1",
  "pulse_fingerprint_v1",
  "decoupling_quadrants_v1",
] as const;

export type DetectorModelArtifactId = (typeof DETECTOR_MODEL_ARTIFACT_IDS)[number];

export const DETECTOR_RETIREMENT_STATUSES = [
  "active",
  "experimental",
  "deprecated",
  "retired",
] as const;

export type DetectorRetirementStatus = (typeof DETECTOR_RETIREMENT_STATUSES)[number];

export type DetectorRegistryMetadata = {
  claimTier: DetectorClaimTier;
  baselineFamilies: readonly DetectorBaselineFamily[];
  requiredDataProducts: readonly string[];
  modelArtifacts?: readonly DetectorModelArtifactId[];
  promotionGates: readonly DetectorPromotionGate[];
  missingDataStates: readonly string[];
  evidenceSchemaVersion: string;
  retirementStatus: DetectorRetirementStatus;
};

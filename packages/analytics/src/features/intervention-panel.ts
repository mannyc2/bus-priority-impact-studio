import type { AnalyticsDetectorScopeKind } from "../core/detector.js";
import type { FeatureQuality } from "./quality.js";

export const INTERVENTION_PANEL_FEATURE_GRAIN = "intervention_panel" as const;

export type InterventionPanelGateStatus = "passes" | "fails" | "not_tested";

export type InterventionPanelFeature = {
  eventId: string;
  interventionType: string;
  treatedScopeKind: AnalyticsDetectorScopeKind;
  treatedScopeId: string;
  interventionDate: string | null;
  preWindowStart: string | null;
  preWindowEnd: string | null;
  postWindowStart: string | null;
  postWindowEnd: string | null;
  controlScopeIds: readonly string[];
  controlEligibilityStatus: "eligible" | "insufficient_controls" | "not_evaluated";
  preTrendStatus: InterventionPanelGateStatus;
  placeboStatus: InterventionPanelGateStatus;
  placeboInTimeStatus?: InterventionPanelGateStatus;
  placeboInSpaceStatus?: InterventionPanelGateStatus;
  autocorrelationStatus?: InterventionPanelGateStatus;
  methodDivergenceStatus?: InterventionPanelGateStatus;
  eventStudyEstimate?: number | null;
  eventStudyConfidenceIntervalLow?: number | null;
  eventStudyConfidenceIntervalHigh?: number | null;
  segmentedRegressionLevelChange?: number | null;
  segmentedRegressionSlopeChange?: number | null;
  matchedPeerDelta?: number | null;
  syntheticControlGap?: number | null;
  quality: FeatureQuality;
};

export function interventionPanelFeatureKey(feature: InterventionPanelFeature): string {
  return [feature.eventId, feature.treatedScopeKind, feature.treatedScopeId].join(":");
}

export type {
  EwtDistributionSummary,
  EwtRouteBaseline,
  EwtRouteMonthReliabilityRow,
  EwtRouteMonthScoreVectorArtifact,
  EwtScoreBasis,
  EwtScoreVectorEntry,
} from "./calibration/ewt-route-month-score-vectors.js";
export {
  buildEwtRouteMonthScoreVectorArtifact,
  summarizeEwtDistribution,
} from "./calibration/ewt-route-month-score-vectors.js";
export type { FeatureContract, FeatureMaterializationKind } from "./features/contracts.js";
export {
  featureContractsForGrains,
  getFeatureContract,
  listFeatureContracts,
} from "./features/contracts.js";
export type {
  BunchingHotspotsDetectorInput,
  BunchingHotspotsDetectorOutput,
  BunchingHotspotsThresholds,
} from "./findings/bunching-hotspots.js";
export {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
  detectBunchingHotspots,
} from "./findings/bunching-hotspots.js";
export type {
  DegradationTrendDetectorInput,
  DegradationTrendDetectorOutput,
  DegradationTrendThresholds,
  TrendMetricDirection,
} from "./findings/degradation-trend.js";
export {
  DEFAULT_DEGRADATION_TREND_METRIC_DIRECTIONS,
  DEFAULT_DEGRADATION_TREND_THRESHOLDS,
  DEGRADATION_TREND_DETECTOR_ID,
  detectDegradationTrends,
} from "./findings/degradation-trend.js";
export type {
  DelayConcentrationDetectorInput,
  DelayConcentrationDetectorOutput,
  DelayConcentrationRouteInput,
  DelayConcentrationSegmentInput,
  DelayConcentrationThresholds,
} from "./findings/delay-concentration.js";
export {
  DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
  DELAY_CONCENTRATION_DETECTOR_ID,
  detectDelayConcentration,
} from "./findings/delay-concentration.js";
export type {
  HeadwayReliabilityEwtDetectorInput,
  HeadwayReliabilityEwtDetectorOutput,
  HeadwayReliabilityEwtThresholds,
} from "./findings/headway-reliability-ewt.js";
export {
  DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS,
  detectHeadwayReliabilityEwt,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
} from "./findings/headway-reliability-ewt.js";
export type {
  InterventionEventStudyDetectorInput,
  InterventionEventStudyDetectorOutput,
  InterventionEventStudyThresholds,
} from "./findings/intervention-event-study.js";
export {
  DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS,
  detectInterventionEventStudies,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
} from "./findings/intervention-event-study.js";
export type {
  InterventionEvidenceStatus,
  InterventionGapDetectorInput,
  InterventionGapDetectorOutput,
  InterventionGapRouteInput,
  InterventionGapThresholds,
} from "./findings/intervention-gap.js";
export {
  DEFAULT_INTERVENTION_GAP_THRESHOLDS,
  detectInterventionGaps,
  INTERVENTION_GAP_DETECTOR_ID,
} from "./findings/intervention-gap.js";
export type {
  InterventionUnderperformanceComparisonInput,
  InterventionUnderperformanceDetectorInput,
  InterventionUnderperformanceDetectorOutput,
  InterventionUnderperformanceRouteInput,
  InterventionUnderperformanceThresholds,
} from "./findings/intervention-underperformance.js";
export {
  DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
  detectInterventionUnderperformance,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
} from "./findings/intervention-underperformance.js";
export type {
  TreatmentScopeGapDetectorInput,
  TreatmentScopeGapDetectorOutput,
  TreatmentScopeGapSegmentInput,
  TreatmentScopeGapThresholds,
} from "./findings/treatment-scope-gap.js";
export {
  DEFAULT_TREATMENT_SCOPE_GAP_THRESHOLDS,
  detectTreatmentScopeGaps,
  TREATMENT_SCOPE_GAP_DETECTOR_ID,
} from "./findings/treatment-scope-gap.js";
export type {
  TreatmentScopeMismatchDetectorInput,
  TreatmentScopeMismatchDetectorOutput,
  TreatmentScopeMismatchSegmentInput,
  TreatmentScopeMismatchThresholds,
} from "./findings/treatment-scope-mismatch.js";
export {
  DEFAULT_TREATMENT_SCOPE_MISMATCH_THRESHOLDS,
  detectTreatmentScopeMismatch,
  TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
} from "./findings/treatment-scope-mismatch.js";
export type {
  LatticeOpportunityAssessmentOutcome,
  LatticeOpportunityAssessmentReasonCode,
  LatticeOpportunityBundle,
  LatticeOpportunityBundleInput,
  LatticeOpportunityBundleOutput,
  LatticeOpportunityInterventionStatus,
  LatticeOpportunityRouteAssessment,
  LatticeOpportunityRouteInput,
  LatticeOpportunityScoringComponents,
  LatticeOpportunitySourceScores,
  LatticeOpportunityThresholds,
  MtaOpportunityKind,
} from "./findings/lattice-opportunity.js";
export {
  buildLatticeOpportunityBundles,
  DEFAULT_LATTICE_OPPORTUNITY_THRESHOLDS,
  LATTICE_REVIEW_BUNDLE_METHOD_ID,
  MTA_OPPORTUNITY_KINDS,
} from "./findings/lattice-opportunity.js";
export type {
  MultiMonthSpeedPeerDetectorInput,
  MultiMonthSpeedPeerDetectorOutput,
  MultiMonthSpeedPeerGroupMethod,
  MultiMonthSpeedPeerObservation,
  MultiMonthSpeedPeerRouteInput,
  MultiMonthSpeedPeerThresholds,
} from "./findings/multi-month-speed-peer.js";
export {
  DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
  detectMultiMonthSpeedPeerDeficits,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
} from "./findings/multi-month-speed-peer.js";
export type {
  ObservedReliabilityDetectorInput,
  ObservedReliabilityDetectorOutput,
  ObservedReliabilityRouteInput,
  ObservedReliabilityThresholds,
} from "./findings/observed-reliability.js";
export {
  DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
  detectObservedReliability,
  OBSERVED_RELIABILITY_DETECTOR_ID,
} from "./findings/observed-reliability.js";
export type {
  PermitCorrelatedSlowdownDetectorInput,
  PermitCorrelatedSlowdownDetectorOutput,
  PermitCorrelatedSlowdownThresholds,
} from "./findings/permit-correlated-slowdown.js";
export {
  DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS,
  detectPermitCorrelatedSlowdowns,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
} from "./findings/permit-correlated-slowdown.js";
export type {
  PersistentSpeedHotspotDetectorInput,
  PersistentSpeedHotspotDetectorOutput,
  PersistentSpeedHotspotInput,
  PersistentSpeedHotspotRouteInput,
  PersistentSpeedHotspotThresholds,
} from "./findings/persistent-speed-hotspot.js";
export {
  DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS,
  detectPersistentSpeedHotspots,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
} from "./findings/persistent-speed-hotspot.js";
export type {
  PositiveDevianceDetectorInput,
  PositiveDevianceDetectorOutput,
  PositiveDevianceThresholds,
} from "./findings/positive-deviance.js";
export {
  DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS,
  detectPositiveDeviance,
  POSITIVE_DEVIANCE_DETECTOR_ID,
} from "./findings/positive-deviance.js";
export type {
  RiderWeightedExcessWaitDetectorInput,
  RiderWeightedExcessWaitDetectorOutput,
  RiderWeightedExcessWaitThresholds,
} from "./findings/rider-weighted-excess-wait.js";
export {
  DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS,
  detectRiderWeightedExcessWait,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
} from "./findings/rider-weighted-excess-wait.js";
export type {
  ScheduleMismatchDetectorInput,
  ScheduleMismatchDetectorOutput,
  ScheduleMismatchThresholds,
} from "./findings/schedule-mismatch.js";
export {
  DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
  detectScheduleMismatch,
  SCHEDULE_MISMATCH_DETECTOR_ID,
} from "./findings/schedule-mismatch.js";
export type {
  ServiceRequestContextDetectorInput,
  ServiceRequestContextDetectorOutput,
  ServiceRequestContextThresholds,
} from "./findings/service-request-context.js";
export {
  DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
  detectServiceRequestContext,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
} from "./findings/service-request-context.js";
export type {
  SourceGapBusLaneDateInput,
  SourceGapContextJoinInput,
  SourceGapDetectorInput,
  SourceGapDetectorOutput,
  SourceGapFreshnessInput,
  SourceGapRouteInput,
  SourceGapThresholds,
} from "./findings/source-gap.js";
export {
  BUS_LANE_DATE_SENTINELS,
  DEFAULT_SOURCE_GAP_THRESHOLDS,
  detectSourceGaps,
  SOURCE_GAP_DETECTOR_ID,
} from "./findings/source-gap.js";
export type {
  SpeedPaceHotspotDetectorInput,
  SpeedPaceHotspotDetectorOutput,
  SpeedPaceHotspotThresholds,
} from "./findings/speed-pace-hotspot.js";
export {
  DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS,
  detectSpeedPaceHotspots,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
} from "./findings/speed-pace-hotspot.js";
export type {
  TravelTimeVariabilityDetectorInput,
  TravelTimeVariabilityDetectorOutput,
  TravelTimeVariabilityThresholds,
} from "./findings/travel-time-variability.js";
export {
  DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
  detectTravelTimeVariability,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
} from "./findings/travel-time-variability.js";
export type {
  HotspotOptions,
  HotspotResult,
  SegmentHotspot,
  SegmentSpeedObservation,
} from "./hotspots.js";
export { detectSegmentHotspots } from "./hotspots.js";
export type {
  LatticeCandidate,
  LatticeDeductionInput,
  LatticeDeductionResult,
  LatticePositionId,
  LatticeSolution,
  PowersetLatticeState,
} from "./lattice-deduction.js";
export { abstractSolutions, deducePowersetLattice } from "./lattice-deduction.js";
export type {
  PublicRouteVisibility,
  PublicRouteVisibilityReason,
} from "./public-route-visibility.js";
export { classifyPublicRouteVisibility } from "./public-route-visibility.js";
export type { RouteScoreInput } from "./route-score.js";
export { calculateRouteScore } from "./route-score.js";

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
  HotspotOptions,
  HotspotResult,
  SegmentHotspot,
  SegmentSpeedObservation,
} from "./hotspots.js";
export { detectSegmentHotspots } from "./hotspots.js";
export type {
  PublicRouteVisibility,
  PublicRouteVisibilityReason,
} from "./public-route-visibility.js";
export { classifyPublicRouteVisibility } from "./public-route-visibility.js";
export type { RouteScoreInput } from "./route-score.js";
export { calculateRouteScore } from "./route-score.js";

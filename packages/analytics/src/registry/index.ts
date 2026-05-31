export type { RegisteredAnalyticsDetector } from "./detectors.js";
export {
  ANALYTICS_DETECTOR_REGISTRY,
  assertDetectorRegistryMatchesSpecs,
  getAnalyticsDetector,
  listAnalyticsDetectors,
} from "./detectors.js";
export type {
  DetectorBaselineFamily,
  DetectorClaimTier,
  DetectorPromotionGate,
  DetectorPromotionGateKind,
  DetectorRegistryMetadata,
  DetectorRetirementStatus,
} from "./metadata.js";
export {
  DETECTOR_BASELINE_FAMILIES,
  DETECTOR_CLAIM_TIERS,
  DETECTOR_PROMOTION_GATE_KINDS,
  DETECTOR_RETIREMENT_STATUSES,
} from "./metadata.js";
export {
  buildFindingDetectorSpecsArtifact,
  DETECTOR_SPEC_TEMPLATE,
  FINDING_DETECTOR_SPECS,
  getFindingDetectorSpec,
} from "./specs.js";

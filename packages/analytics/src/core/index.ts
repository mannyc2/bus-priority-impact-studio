export type {
  AnalyticsDetector,
  AnalyticsDetectorScope,
  AnalyticsDetectorScopeKind,
  DetectorOutput,
} from "./detector.js";
export type {
  AnalyticsDetectorRunContext,
  AnalyticsDetectorRunResult,
  FeatureContractSatisfaction,
  FeatureResolutionStatus,
  FeatureResolver,
  FeatureResolverRequest,
  FeatureResolverResult,
  FeatureResolverScope,
} from "./runner.js";
export { runAnalyticsDetector } from "./runner.js";
export type { BuildCoverageAuditInput, CoveragePayload } from "./coverage.js";
export { buildCoverageAudit } from "./coverage.js";
export type { BuildEvidenceLinkInput, EvidenceRefPayload } from "./evidence.js";
export { buildEvidenceLink } from "./evidence.js";
export { stableId } from "./ids.js";
export { clamp, mergeThresholds, round } from "./numbers.js";
export type { BasicSeverity, SeverityBands } from "./scoring.js";
export { DEFAULT_SEVERITY_BANDS, severityFromScore } from "./scoring.js";

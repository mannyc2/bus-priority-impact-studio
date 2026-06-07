export {
  combineResearchQualityScore,
  type ResearchQualityComponentScores,
  type ResearchScoreBreakdown,
} from "../core/score";
export {
  type AnalysisDependency,
  type AnalysisDependencyClosureArtifact,
  type AnalysisDependencyDataProduct,
  type AnalysisDependencyDataProductManifest,
  type AnalysisDependencyKind,
  type AnalysisDependencyStatus,
  type AnalysisKind,
  type AnalysisUnit,
  type AnalysisUnitStatus,
  type BuildAnalysisDependencyClosureInput,
  buildAnalysisDependencyClosure,
  renderAnalysisDependencyClosureMarkdown,
} from "./analysis-dependency-closure";
export {
  type AnalyticsBackfillCoverageAudit,
  type AnalyticsBackfillObservedMonthRow,
  type AnalyticsBackfillSurfaceRows,
  type BackfillSurfaceId,
  type BuildAnalyticsBackfillCoverageAuditInput,
  buildAnalyticsBackfillCoverageAudit,
  type SurfaceCoverageSummary,
  type SurfaceMonthCoverage,
} from "./analytics-backfill-coverage";
export {
  type AnalyticsCorpusProfileArtifact,
  type BuildAnalyticsCorpusProfileInput,
  buildAnalyticsCorpusProfile,
} from "./analytics-corpus-profile";
export {
  type AnalyticsDetectorReadinessAudit,
  type BuildAnalyticsDetectorReadinessAuditInput,
  buildAnalyticsDetectorReadinessAudit,
  DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE,
  type DetectorReadinessStatus,
  type DetectorReadinessSummary,
  type DetectorSurfaceReadiness,
  detectorReadinessRegistryProductId,
  type PolicySurfaceCoverageSummary,
} from "./analytics-detector-readiness";
export {
  type AnalyticsMaterializationCoverageAudit,
  type BuildAnalyticsMaterializationCoverageInput,
  buildAnalyticsMaterializationCoverageAudit,
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE,
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS,
  type MaterializationCoverageRegistryProduct,
  type MaterializationCoverageStatus,
  type MaterializationCoverageSurface,
} from "./analytics-materialization-coverage";
export type {
  DetectorEvaluationArtifact,
  DetectorEvaluationInputArtifacts,
  DetectorEvaluationPacketCoverageStatus,
} from "./detector-artifact";
export {
  type BuildDetectorEvaluationArtifactInput,
  buildDetectorEvaluationArtifact,
  type CandidateFields,
  type CandidateQueueArtifact,
  type DetectorCoverageAuditArtifact,
  type DetectorEvaluationLabelInputArtifact,
  type DetectorGrainAuditArtifact,
  type EwtScoreVectorArtifact,
  type GenericDetectorScoreVectorArtifact,
  type GoldSetEvaluationArtifact,
  type PromotedFindingsArtifact,
  type ReadinessArtifact,
  type ReviewDecisionArtifact,
  type ReviewPacketArtifact,
  type ReviewPacketCoverageArtifact,
} from "./detector-artifact-builder";
export {
  type BuildDetectorCorpusGrainAuditInput,
  buildDetectorCorpusGrainAudit,
  type DetectorCorpusCoverageSummary,
  type DetectorCorpusDataProductManifest,
  type DetectorCorpusFeatureGrainAudit,
  type DetectorCorpusGrainAudit,
  type DetectorCorpusGrainDetectorAudit,
  type DetectorCorpusGrainReleaseChecks,
  type DetectorCorpusProductRef,
  type DetectorGrainPolicyCheck,
  type DetectorGrainReleaseCheck,
  type DetectorRouteMonthPolicyClassification,
  renderDetectorCorpusGrainAuditMarkdown,
} from "./detector-corpus-grain";
export {
  buildDetectorCoverageAuditArtifact,
  type DetectorCoverageAuditCandidateReasonSummaryRow,
  type DetectorCoverageAuditCandidateSummaryRow,
  type DetectorCoverageAuditCoverageSummaryRow,
  type DetectorCoverageAuditEvidenceSummaryRow,
  type DetectorCoverageAuditTopCandidateRow,
  type FindingDetectorCoverageAuditArtifact,
} from "./detector-coverage-audit";
export {
  type BuildDetectorGoldSetEvaluationArtifactInput,
  buildDetectorGoldSetEvaluationArtifact,
  type DetectorGoldSetCandidateQueueArtifact,
  type DetectorGoldSetEvaluationArtifact,
  type DetectorGoldSetEvaluationLabelSetArtifact,
  type DetectorGoldSetPromotedFindingsArtifact,
  type DetectorGoldSetReviewDecisionArtifact,
} from "./detector-gold-set";
export {
  buildDetectorEvaluationLabelSetArtifact,
  type DetectorEvaluationCoverageRow,
  type DetectorEvaluationLabel,
  type DetectorEvaluationLabelGrainSafety,
  type DetectorEvaluationLabelSetArtifact,
  type DetectorEvaluationMissingDataScope,
} from "./detector-labels";
export { detectorEvaluationMarkdownReport } from "./detector-markdown";
export {
  buildModelArtifactServingProjection,
  type ModelArtifactServingProjection,
  type ModelArtifactServingProjectionRow,
} from "./model-serving-projection";
export {
  buildRouteMonthShadowAudit,
  buildSpeedPaceRouteMonthShadowAudit,
  RICHER_GRAIN_DETECTOR_IDS,
  type RicherCandidateRow,
  ROUTE_MONTH_BASELINE_DETECTOR_IDS,
  type RouteMonthCleanNoHitRow,
  type RouteMonthShadowAuditArtifact,
  SPEED_PACE_ROUTE_MONTH_BASELINE_DETECTOR_ID,
  type SpeedPaceRouteCoverageRow,
  type SpeedPaceRouteMonthShadowAuditArtifact,
  type SpeedPaceShadowCandidateRow,
} from "./detector-shadow-audits";
export {
  buildEvaluationArtifactManifest,
  buildEvaluationArtifactPayloads,
  buildEvaluationJsonArtifact,
  buildEvaluationJsonArtifacts,
  type EvaluationArtifactEntry,
  type EvaluationArtifactExpectedRowCounts,
  type EvaluationArtifactIssue,
  type EvaluationArtifactKind,
  type EvaluationArtifactManifest,
  type EvaluationArtifactRows,
  type EvaluationArtifactsResult,
  type EvaluationArtifactVerification,
  type EvaluationInterventionComparisonRow,
  type EvaluationInterventionEventRow,
  type EvaluationJsonArtifact,
  type EvaluationObservedReliabilityRow,
  isEvaluationArtifactManifest,
  readEvaluationArtifactManifest,
  referencedEvaluationInterventionEvents,
  verifyEvaluationArtifactManifest,
} from "./evaluation-artifacts";
export {
  type BuildEvidenceCorpusAuditInput,
  buildEvidenceCorpusAudit,
  type EvidenceCorpusAudit,
  type EvidenceCorpusAuditStatus,
} from "./evidence-corpus";
export {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  isMapArtifactManifest,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
  MAP_ARTIFACT_SCHEMA_VERSION,
  type MapArtifactEntry,
  type MapArtifactIssue,
  type MapArtifactKind,
  type MapArtifactManifest,
  type MapArtifactVerification,
  type MapJsonArtifact,
  mapArtifactSha256,
  readMapArtifactManifest,
  verifyMapArtifactManifest,
} from "./map-artifacts";
export {
  buildPersistentSpeedSegmentCoverageRepairs,
  type MissingPersistentSpeedSegmentCoverageRow,
  PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID,
} from "./persistent-speed-coverage-repair";
export {
  evaluateReviewPacketCoverageGate,
  type ReviewPacketCoverageGate,
  type ReviewPacketCoverageGateArtifact,
} from "./review-packet-coverage-gate";
export {
  type BuildRouteSpeedAvailabilityInput,
  buildRouteSpeedAvailabilityResult,
  type RequestedRouteSpeedAvailability,
  ROUTE_SPEED_AVAILABILITY_SOURCE_ID,
  type RouteSpeedAvailabilityMonth,
  type RouteSpeedAvailabilityReleaseDecision,
  type RouteSpeedAvailabilityResult,
  type RouteSpeedAvailabilitySourceId,
  requestedRouteSpeedAvailability,
  routeSpeedAvailabilityReleaseDecision,
  summarizeRouteSpeedAvailabilityMonths,
} from "./route-speed-availability";
export {
  auditProjectionSegmentHourBins,
  auditRouteBriefInputHourlyBins,
  hasDotRouteLaneCoverage,
  hasValidRidershipProfile,
  hasValidTrendMonthLabels,
  type ProjectionSegmentHourBins,
  type RouteBriefInputHourlyBins,
} from "./studio-coverage";
export {
  buildTier2StructuredDataInventoryFromArtifacts,
  classifyTier2StructuredArtifact,
  renderTier2StructuredDataInventoryMarkdown,
  summarizeTier2StructuredArtifactValue,
  summarizeTier2StructuredCounts,
  type Tier2StructuredArtifactClassification,
  type Tier2StructuredArtifactSummary,
  type Tier2StructuredArtifactValueSummary,
  type Tier2StructuredCounts,
  type Tier2StructuredDataInventory,
  type Tier2StructuredLayer,
  type Tier2StructuredTrustTier,
} from "./tier2-structured-data";

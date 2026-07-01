export type { D1ServingDb, D1ServingSchema } from "./client.js";
export { createD1ServingDb } from "./client.js";
export type { CorridorArtifactRow, RouteArtifactRow } from "./queries/brief-artifacts.js";
export {
  listCorridorArtifacts,
  listRouteArtifacts,
} from "./queries/brief-artifacts.js";
export type {
  CorridorHotspotRow,
  CorridorInterventionContextRow,
  CorridorMonthSummaryRow,
  CorridorRouteMemberRow,
  CorridorRow,
  CorridorSummary,
} from "./queries/corridor-summaries.js";
export { listCorridorSummaries } from "./queries/corridor-summaries.js";
export {
  consumeMagicLinkRequest,
  createMagicLinkRequest,
  createSession,
  getIdentityById,
  getIdentityBySessionTokenHash,
  getOperatorRoleForIdentity,
  recordSessionUse,
  revokeSession,
} from "./queries/identity.js";
export type {
  AlertKind,
  AlertRecord,
  PublicCommentRecord,
  SavedSearchRecord,
} from "./queries/identity-surfaces.js";
export {
  deactivateAlert,
  deleteSavedSearch,
  insertAlert,
  insertPublicComment,
  insertSavedSearch,
  listAlertsForIdentity,
  listPublicCommentsForBrief,
  listSavedSearchesForIdentity,
  softDeletePublicComment,
} from "./queries/identity-surfaces.js";
export type { RouteBatchStatus, RouteBatchStatusRow } from "./queries/route-batch-status.js";
export { getRouteBatchStatus } from "./queries/route-batch-status.js";
export type {
  RouteBriefSummary,
  RouteBriefSummaryRow,
} from "./queries/route-brief-summaries.js";
export {
  getRouteBriefSummary,
  listRouteBriefSummaries,
} from "./queries/route-brief-summaries.js";
export type {
  RouteBuildPlanEntry,
  RouteBuildPlanRow,
} from "./queries/route-build-plan.js";
export {
  listRouteBuildPlan,
  listSelectedRouteBuildCandidates,
} from "./queries/route-build-plan.js";
export type {
  RouteComparisonRank,
  RouteComparisonRankRow,
} from "./queries/route-comparison-ranks.js";
export { listRouteComparisonRanks } from "./queries/route-comparison-ranks.js";
export type {
  RouteEquityContext,
  RouteEquityContextRow,
} from "./queries/route-equity-contexts.js";
export {
  findRouteEquityContext,
  listRouteEquityContexts,
} from "./queries/route-equity-contexts.js";
export type {
  InterventionEventRow,
  RouteInterventionComparison,
  RouteInterventionComparisonRow,
} from "./queries/route-intervention-comparisons.js";
export { listRouteInterventionComparisons } from "./queries/route-intervention-comparisons.js";
export type { RouteMonthTrend, RouteMonthTrendRow } from "./queries/route-month-trends.js";
export { listRouteMonthTrends } from "./queries/route-month-trends.js";
export type {
  RouteObservedReliabilitySummary,
  RouteObservedReliabilitySummaryRow,
} from "./queries/route-observed-reliability.js";
export {
  findLatestNonBaselineObservedMonth,
  listRouteObservedReliabilitySummaries,
} from "./queries/route-observed-reliability.js";
export type { RouteReadiness, RouteReadinessRow } from "./queries/route-readiness.js";
export { listBuildEligibleRoutes, listRouteReadiness } from "./queries/route-readiness.js";
export type {
  RouteReliabilityBaseline,
  RouteReliabilityBaselineRow,
} from "./queries/route-reliability-baselines.js";
export { listRouteReliabilityBaselines } from "./queries/route-reliability-baselines.js";
export type { RouteScorecardCitationRow, RouteScorecardRow } from "./queries/route-scorecard.js";
export {
  deserializeRouteScorecard,
  getRouteScorecard,
  serializeRouteScorecard,
  serializeRouteScorecardCitations,
} from "./queries/route-scorecard.js";
export type {
  RouteTimelineIndex,
  RouteTimelineIndexRow,
  RouteTimelineSupportLevel,
} from "./queries/route-timelines.js";
export { getRouteTimelineIndex, listRouteTimelineIndex } from "./queries/route-timelines.js";
export type {
  RouteSpeedHistoryCoverage,
  RouteSpeedHistoryCoverageRow,
  SourceMonthCoverage,
  SourceMonthCoverageRow,
} from "./queries/snapshot-coverage.js";
export {
  listRouteSpeedHistoryCoverage,
  listSourceMonthCoverage,
} from "./queries/snapshot-coverage.js";
export type { StudioActorAuth } from "./queries/studio-auth.js";
export { getStudioActorAuthByTokenHash, markStudioActorTokenUsed } from "./queries/studio-auth.js";
export type {
  StudioBriefAgentProposalRow,
  StudioBriefAgentProposalStatus,
  StudioBriefAgentRunIntent,
  StudioBriefAgentRunRow,
  StudioBriefAgentRunStatus,
  StudioBriefDraftVersionActorType,
  StudioBriefDraftVersionReason,
  StudioBriefDraftVersionRow,
  StudioBriefDraftVersionSnapshotRow,
  StudioBriefDraftVersionSnapshotStorage,
} from "./queries/studio-brief-agents.js";
export {
  getStudioBriefAgentProposal,
  getStudioBriefAgentRun,
  getStudioBriefDraftVersion,
  getStudioBriefDraftVersionSnapshot,
  insertStudioBriefAgentProposal,
  insertStudioBriefAgentRun,
  insertStudioBriefDraftVersion,
  insertStudioBriefDraftVersionSnapshot,
  listStudioBriefAgentProposals,
  listStudioBriefDraftVersions,
  updateStudioBriefAgentProposalStatus,
  updateStudioBriefAgentRunStatus,
} from "./queries/studio-brief-agents.js";
export type {
  StudioBriefDraftBlockRow,
  StudioBriefDraftClaimRow,
  StudioBriefDraftOwnerKind,
  StudioBriefDraftRecord,
  StudioBriefDraftRefRow,
  StudioBriefDraftRow,
  StudioBriefDraftStatus,
  StudioBriefGenerationJobStatus,
  StudioBriefGenerationMode,
  StudioBriefHistoryEventRow,
  StudioBriefLlmGenerationStatus,
  StudioBriefReviewCommentKind,
  StudioBriefReviewCommentRow,
  StudioBriefReviewCommentStatus,
  StudioBriefWriteIdempotencyRow,
} from "./queries/studio-brief-drafts.js";
export {
  claimStudioBriefGuestDraft,
  deleteStudioBriefDraftBlock,
  deleteStudioBriefDraftClaim,
  deleteStudioBriefDraftClaims,
  deleteStudioBriefDraftRefsForBlock,
  getStudioBriefDraftRecord,
  getStudioBriefDraftRecordByJobId,
  getStudioBriefReviewComment,
  getStudioBriefWriteIdempotency,
  insertStudioBriefDraft,
  insertStudioBriefDraftBlock,
  insertStudioBriefDraftClaim,
  insertStudioBriefHistoryEvent,
  insertStudioBriefReviewComment,
  insertStudioBriefReviewReply,
  insertStudioBriefReviewThread,
  listStudioBriefHistoryEvents,
  markStudioBriefDraftPublishCandidate,
  markStudioBriefDraftRetracted,
  parseDraftNumberArray,
  parseDraftStringArray,
  recordStudioBriefPromotionReceipt,
  recordStudioBriefWriteIdempotency,
  replaceStudioBriefDraftBlocks,
  replaceStudioBriefDraftClaims,
  replaceStudioBriefDraftRefs,
  updateStudioBriefDraftBlock,
  updateStudioBriefDraftClaim,
  updateStudioBriefDraftGeneration,
  updateStudioBriefDraftJobStatus,
  updateStudioBriefDraftMetadata,
  updateStudioBriefDraftValidation,
  updateStudioBriefReviewComment,
} from "./queries/studio-brief-drafts.js";
export type { StudioRouteIndexSourceRow } from "./queries/studio-route-index.js";
export {
  findLatestSpeedTrendMonth,
  findLatestStudioServingMonth,
  listStudioRouteIndexSourceRows,
} from "./queries/studio-route-index.js";

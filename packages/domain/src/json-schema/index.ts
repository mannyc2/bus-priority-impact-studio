import { MapManifestResponseSchema } from "../maps/index.js";
import {
  HealthResponseSchema,
  HotspotListResponseSchema,
  ReleaseStatusResponseSchema,
  RouteCompareResponseSchema,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
} from "../routes/index.js";
import { toProjectJsonSchema } from "../schema-registry.js";
import {
  StudioBriefAgentProposalApplyRequestSchema,
  StudioBriefAgentProposalApplyResponseSchema,
  StudioBriefAgentProposalRejectRequestSchema,
  StudioBriefAgentProposalRejectResponseSchema,
  StudioBriefAgentProposalResponseSchema,
  StudioBriefAgentProposeEditRequestSchema,
  StudioBriefAgentProposeEditResultSchema,
  StudioBriefAgentRunCreateRequestSchema,
  StudioBriefAgentRunResponseSchema,
  StudioBriefCreateRequestSchema,
  StudioBriefCreateResponseSchema,
  StudioBriefDraftAttachRequestSchema,
  StudioBriefDraftAttachResponseSchema,
  StudioBriefDraftBlockCreateRequestSchema,
  StudioBriefDraftBlockPatchRequestSchema,
  StudioBriefDraftBlockResponseSchema,
  StudioBriefDraftClaimCreateRequestSchema,
  StudioBriefDraftClaimPatchRequestSchema,
  StudioBriefDraftClaimResponseSchema,
  StudioBriefDraftCommentCreateRequestSchema,
  StudioBriefDraftCommentPatchRequestSchema,
  StudioBriefDraftCommentReplyRequestSchema,
  StudioBriefDraftCommentResponseSchema,
  StudioBriefDraftCommentsResponseSchema,
  StudioBriefDraftGenerateRequestSchema,
  StudioBriefDraftPatchRequestSchema,
  StudioBriefDraftPromotionReceiptRequestSchema,
  StudioBriefDraftPromotionReceiptResponseSchema,
  StudioBriefDraftPublishRequestSchema,
  StudioBriefDraftRefsReplaceRequestSchema,
  StudioBriefDraftRefsResolveRequestSchema,
  StudioBriefDraftRefsResolveResponseSchema,
  StudioBriefDraftRefsResponseSchema,
  StudioBriefDraftRetractRequestSchema,
  StudioBriefDraftReviewRequestSchema,
  StudioBriefDraftSchema,
  StudioBriefDraftValidationResponseSchema,
  StudioBriefDraftVerdictRequestSchema,
  StudioBriefDraftVersionRestoreRequestSchema,
  StudioBriefDraftVersionRestoreResponseSchema,
  StudioBriefDraftVersionsResponseSchema,
  StudioBriefGenerationJobResponseSchema,
} from "../studio/briefs/draft-api.js";
import {
  StudioBriefEvidenceResponseSchema,
  StudioBriefHistoryResponseSchema,
  StudioBriefPublishCandidateExportResponseSchema,
  StudioBriefResponseSchema,
  StudioBriefsResponseSchema,
} from "../studio/briefs/read-model.js";
import { StudioDocsResponseSchema, StudioMethodsResponseSchema } from "../studio/docs/index.js";
import {
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
} from "../studio/findings/index.js";
import {
  StudioCompareResponseSchema,
  StudioReleasePayloadSchema,
  StudioSearchResponseSchema,
} from "../studio/release.js";
import { StudioRouteEvidenceArtifactSchema } from "../studio/route-evidence.js";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteSectionsResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
  StudioRoutesResponseSchema,
} from "../studio/routes/index.js";
import {
  StudioRouteIndex2ResponseSchema,
  StudioSnapshotResponseSchema,
} from "../studio/snapshots.js";

export { toProjectJsonSchema } from "../schema-registry.js";

export const routeScorecardJsonSchema = toProjectJsonSchema(RouteScorecardSchema);
export const healthResponseJsonSchema = toProjectJsonSchema(HealthResponseSchema);
export const releaseStatusResponseJsonSchema = toProjectJsonSchema(ReleaseStatusResponseSchema);
export const routeListResponseJsonSchema = toProjectJsonSchema(RouteListResponseSchema);
export const routeProfileResponseJsonSchema = toProjectJsonSchema(RouteProfileResponseSchema);
export const mapManifestResponseJsonSchema = toProjectJsonSchema(MapManifestResponseSchema);
export const hotspotListResponseJsonSchema = toProjectJsonSchema(HotspotListResponseSchema);
export const routeCompareResponseJsonSchema = toProjectJsonSchema(RouteCompareResponseSchema);

export const studioBriefDraftJsonSchema = toProjectJsonSchema(StudioBriefDraftSchema);
export const studioBriefDraftValidationResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftValidationResponseSchema,
);
export const studioBriefDraftGenerateRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftGenerateRequestSchema,
);
export const studioBriefGenerationJobResponseJsonSchema = toProjectJsonSchema(
  StudioBriefGenerationJobResponseSchema,
);
export const studioBriefCreateRequestJsonSchema = toProjectJsonSchema(
  StudioBriefCreateRequestSchema,
);
export const studioBriefCreateResponseJsonSchema = toProjectJsonSchema(
  StudioBriefCreateResponseSchema,
);
export const studioBriefDraftPatchRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftPatchRequestSchema,
);
export const studioBriefDraftClaimCreateRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftClaimCreateRequestSchema,
);
export const studioBriefDraftClaimPatchRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftClaimPatchRequestSchema,
);
export const studioBriefDraftClaimResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftClaimResponseSchema,
);
export const studioBriefDraftBlockCreateRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftBlockCreateRequestSchema,
);
export const studioBriefDraftBlockPatchRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftBlockPatchRequestSchema,
);
export const studioBriefDraftBlockResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftBlockResponseSchema,
);
export const studioBriefDraftRefsResolveRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftRefsResolveRequestSchema,
);
export const studioBriefDraftRefsResolveResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftRefsResolveResponseSchema,
);
export const studioBriefDraftRefsReplaceRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftRefsReplaceRequestSchema,
);
export const studioBriefDraftRefsResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftRefsResponseSchema,
);
export const studioBriefDraftAttachRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftAttachRequestSchema,
);
export const studioBriefDraftAttachResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftAttachResponseSchema,
);
export const studioBriefDraftCommentsResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftCommentsResponseSchema,
);
export const studioBriefDraftCommentCreateRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftCommentCreateRequestSchema,
);
export const studioBriefDraftCommentReplyRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftCommentReplyRequestSchema,
);
export const studioBriefDraftCommentPatchRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftCommentPatchRequestSchema,
);
export const studioBriefDraftCommentResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftCommentResponseSchema,
);
export const studioBriefDraftReviewRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftReviewRequestSchema,
);
export const studioBriefDraftVerdictRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftVerdictRequestSchema,
);
export const studioBriefDraftPublishRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftPublishRequestSchema,
);
export const studioBriefDraftRetractRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftRetractRequestSchema,
);
export const studioBriefDraftPromotionReceiptRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftPromotionReceiptRequestSchema,
);
export const studioBriefDraftPromotionReceiptResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftPromotionReceiptResponseSchema,
);
export const studioBriefAgentRunCreateRequestJsonSchema = toProjectJsonSchema(
  StudioBriefAgentRunCreateRequestSchema,
);
export const studioBriefAgentRunResponseJsonSchema = toProjectJsonSchema(
  StudioBriefAgentRunResponseSchema,
);
export const studioBriefAgentProposeEditRequestJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposeEditRequestSchema,
);
export const studioBriefAgentProposeEditResultJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposeEditResultSchema,
);
export const studioBriefAgentProposalResponseJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposalResponseSchema,
);
export const studioBriefAgentProposalApplyRequestJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposalApplyRequestSchema,
);
export const studioBriefAgentProposalApplyResponseJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposalApplyResponseSchema,
);
export const studioBriefAgentProposalRejectRequestJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposalRejectRequestSchema,
);
export const studioBriefAgentProposalRejectResponseJsonSchema = toProjectJsonSchema(
  StudioBriefAgentProposalRejectResponseSchema,
);
export const studioBriefDraftVersionsResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftVersionsResponseSchema,
);
export const studioBriefDraftVersionRestoreRequestJsonSchema = toProjectJsonSchema(
  StudioBriefDraftVersionRestoreRequestSchema,
);
export const studioBriefDraftVersionRestoreResponseJsonSchema = toProjectJsonSchema(
  StudioBriefDraftVersionRestoreResponseSchema,
);

export const studioRoutesResponseJsonSchema = toProjectJsonSchema(StudioRoutesResponseSchema);
export const studioSearchResponseJsonSchema = toProjectJsonSchema(StudioSearchResponseSchema);
export const studioRouteIndex2ResponseJsonSchema = toProjectJsonSchema(
  StudioRouteIndex2ResponseSchema,
);
export const studioRouteSectionsResponseJsonSchema = toProjectJsonSchema(
  StudioRouteSectionsResponseSchema,
);
export const studioRouteDetailResponseJsonSchema = toProjectJsonSchema(
  StudioRouteDetailResponseSchema,
);
export const studioRouteHistoryResponseJsonSchema = toProjectJsonSchema(
  StudioRouteHistoryResponseSchema,
);
export const studioRouteSpeedHistoryResponseJsonSchema = toProjectJsonSchema(
  StudioRouteSpeedHistoryResponseSchema,
);
export const studioRouteEvidenceArtifactJsonSchema = toProjectJsonSchema(
  StudioRouteEvidenceArtifactSchema,
);
export const studioCompareResponseJsonSchema = toProjectJsonSchema(StudioCompareResponseSchema);
export const studioFindingsResponseJsonSchema = toProjectJsonSchema(StudioFindingsResponseSchema);
export const studioFindingResponseJsonSchema = toProjectJsonSchema(StudioFindingResponseSchema);
export const studioBriefsResponseJsonSchema = toProjectJsonSchema(StudioBriefsResponseSchema);
export const studioBriefResponseJsonSchema = toProjectJsonSchema(StudioBriefResponseSchema);
export const studioBriefEvidenceResponseJsonSchema = toProjectJsonSchema(
  StudioBriefEvidenceResponseSchema,
);
export const studioBriefHistoryResponseJsonSchema = toProjectJsonSchema(
  StudioBriefHistoryResponseSchema,
);
export const studioMethodsResponseJsonSchema = toProjectJsonSchema(StudioMethodsResponseSchema);
export const studioDocsResponseJsonSchema = toProjectJsonSchema(StudioDocsResponseSchema);
export const studioSnapshotResponseJsonSchema = toProjectJsonSchema(StudioSnapshotResponseSchema);
export const studioReleasePayloadJsonSchema = toProjectJsonSchema(StudioReleasePayloadSchema);
export const studioBriefPublishCandidateExportResponseJsonSchema = toProjectJsonSchema(
  StudioBriefPublishCandidateExportResponseSchema,
);

import { MapManifestResponseSchema, MapRouteSegmentFeatureCollectionSchema } from "@bp/domain/maps";
import {
  createStudioApiClient,
  type PathBuildInput,
  type StudioApiRouteId,
} from "@bp/studio-api/client";
import type * as z from "zod";
import type {
  StudioBriefAgentProposalApplyRequest,
  StudioBriefAgentProposalRejectRequest,
  StudioBriefAgentProposeEditRequest,
  StudioBriefAgentRunCreateRequest,
  StudioBriefCreateRequest,
  StudioBriefDraftAttachRequest,
  StudioBriefDraftBlockCreateRequest,
  StudioBriefDraftBlockPatchRequest,
  StudioBriefDraftClaimCreateRequest,
  StudioBriefDraftClaimPatchRequest,
  StudioBriefDraftCommentCreateRequest,
  StudioBriefDraftCommentPatchRequest,
  StudioBriefDraftCommentReplyRequest,
  StudioBriefDraftGenerateRequest,
  StudioBriefDraftPatchRequest,
  StudioBriefDraftPromotionReceiptRequest,
  StudioBriefDraftPublishRequest,
  StudioBriefDraftRefsReplaceRequest,
  StudioBriefDraftRefsResolveRequest,
  StudioBriefDraftRetractRequest,
  StudioBriefDraftReviewRequest,
  StudioBriefDraftVerdictRequest,
  StudioBriefDraftVersionRestoreRequest,
} from "./api-contract.js";
import {
  StudioBriefAgentProposalApplyResponseSchema,
  StudioBriefAgentProposalRejectResponseSchema,
  StudioBriefAgentProposalResponseSchema,
  StudioBriefAgentProposeEditResultSchema,
  StudioBriefAgentRunResponseSchema,
  StudioBriefCreateResponseSchema,
  StudioBriefDraftAttachResponseSchema,
  StudioBriefDraftBlockResponseSchema,
  StudioBriefDraftClaimResponseSchema,
  StudioBriefDraftCommentResponseSchema,
  StudioBriefDraftCommentsResponseSchema,
  StudioBriefDraftPromotionReceiptResponseSchema,
  StudioBriefDraftRefsResolveResponseSchema,
  StudioBriefDraftRefsResponseSchema,
  StudioBriefDraftValidationResponseSchema,
  StudioBriefDraftVersionRestoreResponseSchema,
  StudioBriefDraftVersionsResponseSchema,
  StudioBriefEvidenceResponseSchema,
  StudioBriefGenerationJobResponseSchema,
  StudioBriefHistoryResponseSchema,
  StudioBriefPublishCandidateExportResponseSchema,
  StudioBriefResponseSchema,
  StudioBriefsResponseSchema,
  StudioCompareResponseSchema,
  StudioDocsResponseSchema,
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteIndex2ResponseSchema,
  StudioRouteSectionsResponseSchema,
  StudioRoutesResponseSchema,
  StudioSearchResponseSchema,
} from "./api-contract.js";

type StudioApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

type StudioMutationOptions = {
  idempotencyKey?: string;
};

export type StudioQueryOptions = {
  signal?: AbortSignal;
};

export const staticStudioLoaderStaleTimeMs = 5 * 60 * 1000;
export const editorialStudioLoaderStaleTimeMs = 60 * 1000;
export const mutableStudioLoaderStaleTimeMs = 30 * 1000;

const studioApiClient = createStudioApiClient();

function studioPath(routeId: StudioApiRouteId, input: PathBuildInput = {}): string {
  return studioApiClient.path(routeId, input);
}

export class StudioApiError extends Error {
  override readonly name = "StudioApiError";
  readonly status: number;
  readonly path: string;
  readonly code: string;

  constructor({
    status,
    path,
    code,
    message,
  }: {
    status: number;
    path: string;
    code?: string;
    message?: string;
  }) {
    super(message ?? `Studio API request failed: ${status} ${path}`);
    this.status = status;
    this.path = path;
    this.code = code ?? `HTTP_${status}`;
  }
}

export class StudioApiContractError extends Error {
  override readonly name = "StudioApiContractError";
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Studio API response failed contract validation: ${path}`);
    this.path = path;
    this.cause = cause;
  }
}

async function readErrorBody(response: Response): Promise<StudioApiErrorBody | null> {
  try {
    return (await response.json()) as StudioApiErrorBody;
  } catch {
    return null;
  }
}

async function apiError(response: Response, path: string): Promise<StudioApiError> {
  const body = await readErrorBody(response);
  return new StudioApiError({
    status: response.status,
    path,
    ...(body?.error?.code ? { code: body.error.code } : {}),
    ...(body?.error?.message ? { message: body.error.message } : {}),
  });
}

async function loadStudioJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: StudioQueryOptions = {},
): Promise<z.output<TSchema>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw await apiError(response, path);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

async function loadNullableStudioJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: StudioQueryOptions = {},
): Promise<z.output<TSchema> | null> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await apiError(response, path);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

function studioMutationIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function fetchStudioRoutes(options?: StudioQueryOptions) {
  return loadStudioJson(studioPath("studio.routes"), StudioRoutesResponseSchema, options);
}

export function fetchStudioRouteIndex2(options?: StudioQueryOptions) {
  return loadStudioJson(
    studioPath("studio.routes", { query: { schema: 2 } }),
    StudioRouteIndex2ResponseSchema,
    options,
  );
}

export function fetchStudioRouteSections(options?: StudioQueryOptions) {
  return loadStudioJson(
    studioPath("studio.routeSections"),
    StudioRouteSectionsResponseSchema,
    options,
  );
}

export function fetchStudioSearch(query: string, options?: StudioQueryOptions) {
  return loadStudioJson(
    studioPath("studio.search", { query: { q: query } }),
    StudioSearchResponseSchema,
    options,
  );
}

export function fetchStudioRoute(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.route", { params: { routeId } }),
    StudioRouteDetailResponseSchema,
    options,
  );
}

export function fetchStudioRouteHistory(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.routeHistory", { params: { routeId } }),
    StudioRouteHistoryResponseSchema,
    options,
  );
}

export function fetchStudioCompare(a: string, b: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.compare", { query: { a, b } }),
    StudioCompareResponseSchema,
    options,
  );
}

export function fetchStudioFindings(options?: StudioQueryOptions) {
  return loadStudioJson(studioPath("studio.findings"), StudioFindingsResponseSchema, options);
}

export function fetchMapManifest(options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("public.mapManifest"),
    MapManifestResponseSchema,
    options,
  );
}

/** Fetch the precomputed route-segment GeoJSON for one route, via the map manifest. */
export async function fetchRouteSegmentsGeo(routeId: string, options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const entry = manifest.artifacts.find(
    (artifact) =>
      artifact.artifactKind === "map_route_segments_geojson" && artifact.routeId === routeId,
  );
  if (entry === undefined) return null;
  return loadNullableStudioJson(entry.apiPath, MapRouteSegmentFeatureCollectionSchema, options);
}

export function fetchStudioFinding(findingId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.finding", { params: { findingId } }),
    StudioFindingResponseSchema,
    options,
  );
}

export function fetchStudioBriefs(options?: StudioQueryOptions) {
  return loadStudioJson(studioPath("studio.briefs"), StudioBriefsResponseSchema, options);
}

export function fetchStudioBrief(briefId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.brief", { params: { briefId } }),
    StudioBriefResponseSchema,
    options,
  );
}

export function fetchStudioBriefEvidence(briefId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.briefEvidence", { params: { briefId } }),
    StudioBriefEvidenceResponseSchema,
    options,
  );
}

export function fetchStudioBriefHistory(briefId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.briefHistory", { params: { briefId } }),
    StudioBriefHistoryResponseSchema,
    options,
  );
}

export function fetchStudioDocs(options?: StudioQueryOptions) {
  return loadStudioJson(studioPath("studio.docs"), StudioDocsResponseSchema, options);
}

async function sendStudioJson(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  options: StudioMutationOptions = {},
): Promise<Response> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Idempotency-Key": options.idempotencyKey ?? studioMutationIdempotencyKey(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    throw await apiError(response, path);
  }

  return response;
}

async function mutateStudioJson<TSchema extends z.ZodType>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  schema: TSchema,
  options?: StudioMutationOptions,
): Promise<z.output<TSchema>> {
  const response = await sendStudioJson(path, method, body, options);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

async function mutateStudioVoid(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  options?: StudioMutationOptions,
): Promise<void> {
  await sendStudioJson(path, method, body, options);
}

export function createStudioBriefDraft(
  input: StudioBriefCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefs.create"),
    "POST",
    input,
    StudioBriefCreateResponseSchema,
    options,
  );
}

export function updateStudioBriefDraft(
  briefId: string,
  input: StudioBriefDraftPatchRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraft", { params: { briefId } }),
    "PATCH",
    input,
    options,
  );
}

export function generateStudioBriefDraft(
  briefId: string,
  input: StudioBriefDraftGenerateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraft.generate", { params: { briefId } }),
    "POST",
    input,
    StudioBriefGenerationJobResponseSchema,
    options,
  );
}

export function createStudioBriefAgentRun(
  briefId: string,
  input: StudioBriefAgentRunCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefAgentRuns.create", { params: { briefId } }),
    "POST",
    input,
    StudioBriefAgentRunResponseSchema,
    options,
  );
}

export function fetchStudioBriefAgentRun(
  briefId: string,
  runId: string,
  options?: StudioQueryOptions,
) {
  return loadStudioJson(
    studioPath("studio.briefAgentRun", { params: { briefId, runId } }),
    StudioBriefAgentRunResponseSchema,
    options,
  );
}

export function proposeStudioBriefAgentEdit(
  briefId: string,
  runId: string,
  input: StudioBriefAgentProposeEditRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefAgentRun.proposeEdit", { params: { briefId, runId } }),
    "POST",
    input,
    StudioBriefAgentProposeEditResultSchema,
    options,
  );
}

export function fetchStudioBriefAgentProposal(
  briefId: string,
  proposalId: string,
  options?: StudioQueryOptions,
) {
  return loadStudioJson(
    studioPath("studio.briefAgentProposal", { params: { briefId, proposalId } }),
    StudioBriefAgentProposalResponseSchema,
    options,
  );
}

export function applyStudioBriefAgentProposal(
  briefId: string,
  proposalId: string,
  input: StudioBriefAgentProposalApplyRequest = {},
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefAgentProposal.apply", { params: { briefId, proposalId } }),
    "POST",
    input,
    StudioBriefAgentProposalApplyResponseSchema,
    options,
  );
}

export function rejectStudioBriefAgentProposal(
  briefId: string,
  proposalId: string,
  input: StudioBriefAgentProposalRejectRequest = {},
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefAgentProposal.reject", { params: { briefId, proposalId } }),
    "POST",
    input,
    StudioBriefAgentProposalRejectResponseSchema,
    options,
  );
}

export function listStudioBriefDraftVersions(briefId: string, options?: StudioQueryOptions) {
  return loadStudioJson(
    studioPath("studio.briefDraftVersions", { params: { briefId } }),
    StudioBriefDraftVersionsResponseSchema,
    options,
  );
}

export function restoreStudioBriefDraftVersion(
  briefId: string,
  versionId: string,
  input: StudioBriefDraftVersionRestoreRequest = {},
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftVersion.restore", { params: { briefId, versionId } }),
    "POST",
    input,
    StudioBriefDraftVersionRestoreResponseSchema,
    options,
  );
}

export function addStudioBriefDraftClaim(
  briefId: string,
  input: StudioBriefDraftClaimCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftClaims.create", { params: { briefId } }),
    "POST",
    input,
    StudioBriefDraftClaimResponseSchema,
    options,
  );
}

export function addStudioBriefDraftBlock(
  briefId: string,
  input: StudioBriefDraftBlockCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftBlocks.create", { params: { briefId } }),
    "POST",
    input,
    StudioBriefDraftBlockResponseSchema,
    options,
  );
}

export function updateStudioBriefDraftBlock(
  briefId: string,
  blockId: string,
  input: StudioBriefDraftBlockPatchRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraftBlock.patch", { params: { briefId, blockId } }),
    "PATCH",
    input,
    options,
  );
}

export function deleteStudioBriefDraftBlock(
  briefId: string,
  blockId: string,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraftBlock.delete", { params: { briefId, blockId } }),
    "DELETE",
    undefined,
    options,
  );
}

export function resolveStudioBriefDraftRefs(
  briefId: string,
  input: StudioBriefDraftRefsResolveRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftRefs.resolve", { params: { briefId } }),
    "POST",
    input,
    StudioBriefDraftRefsResolveResponseSchema,
    options,
  );
}

export function fetchStudioBriefDraftRefs(briefId: string, options?: StudioQueryOptions) {
  return loadStudioJson(
    studioPath("studio.briefDraftRefs", { params: { briefId } }),
    StudioBriefDraftRefsResponseSchema,
    options,
  );
}

export function replaceStudioBriefDraftRefs(
  briefId: string,
  input: StudioBriefDraftRefsReplaceRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftRefs.replace", { params: { briefId } }),
    "PUT",
    input,
    StudioBriefDraftRefsResponseSchema,
    options,
  );
}

export function attachStudioBriefDraftBlock(
  briefId: string,
  input: StudioBriefDraftAttachRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraft.attach", { params: { briefId } }),
    "POST",
    input,
    StudioBriefDraftAttachResponseSchema,
    options,
  );
}

export function recordStudioBriefPromotionReceipt(
  briefId: string,
  input: StudioBriefDraftPromotionReceiptRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraft.promotionReceipt", { params: { briefId } }),
    "POST",
    input,
    StudioBriefDraftPromotionReceiptResponseSchema,
    options,
  );
}

export function listStudioBriefDraftComments(briefId: string, options?: StudioQueryOptions) {
  return loadStudioJson(
    studioPath("studio.briefDraftComments", { params: { briefId } }),
    StudioBriefDraftCommentsResponseSchema,
    options,
  );
}

export function createStudioBriefDraftComment(
  briefId: string,
  input: StudioBriefDraftCommentCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftComments.create", { params: { briefId } }),
    "POST",
    input,
    StudioBriefDraftCommentResponseSchema,
    options,
  );
}

export function replyStudioBriefDraftComment(
  briefId: string,
  commentId: string,
  input: StudioBriefDraftCommentReplyRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftComment.reply", { params: { briefId, commentId } }),
    "POST",
    input,
    StudioBriefDraftCommentResponseSchema,
    options,
  );
}

export function updateStudioBriefDraftComment(
  briefId: string,
  commentId: string,
  input: StudioBriefDraftCommentPatchRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    studioPath("studio.briefDraftComment.patch", { params: { briefId, commentId } }),
    "PATCH",
    input,
    StudioBriefDraftCommentResponseSchema,
    options,
  );
}

export function acceptStudioBriefDraftSuggestion(
  briefId: string,
  commentId: string,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraftComment.acceptSuggestion", { params: { briefId, commentId } }),
    "POST",
    {},
    options,
  );
}

export function updateStudioBriefDraftClaim(
  briefId: string,
  claimN: number,
  input: StudioBriefDraftClaimPatchRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraftClaim.patch", { params: { briefId, claimN } }),
    "PATCH",
    input,
    options,
  );
}

export function deleteStudioBriefDraftClaim(
  briefId: string,
  claimN: number,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraftClaim.delete", { params: { briefId, claimN } }),
    "DELETE",
    undefined,
    options,
  );
}

export function validateStudioBriefDraft(briefId: string, options?: StudioMutationOptions) {
  return mutateStudioJson(
    studioPath("studio.briefDraft.validate", { params: { briefId } }),
    "POST",
    {},
    StudioBriefDraftValidationResponseSchema,
    options,
  );
}

export function requestStudioBriefDraftReview(
  briefId: string,
  input: StudioBriefDraftReviewRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraft.review", { params: { briefId } }),
    "POST",
    input,
    options,
  );
}

export function submitStudioBriefDraftVerdict(
  briefId: string,
  input: StudioBriefDraftVerdictRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraft.verdict", { params: { briefId } }),
    "POST",
    input,
    options,
  );
}

export function publishStudioBriefDraftCandidate(
  briefId: string,
  input: StudioBriefDraftPublishRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraft.publish", { params: { briefId } }),
    "POST",
    input,
    options,
  );
}

export function retractStudioBriefDraftCandidate(
  briefId: string,
  input: StudioBriefDraftRetractRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(
    studioPath("studio.briefDraft.retract", { params: { briefId } }),
    "POST",
    input,
    options,
  );
}

export function fetchStudioBriefPublishCandidateExport(
  briefId: string,
  options?: StudioQueryOptions,
) {
  return loadStudioJson(
    studioPath("studio.briefDraft.publishCandidateExport", { params: { briefId } }),
    StudioBriefPublishCandidateExportResponseSchema,
    options,
  );
}

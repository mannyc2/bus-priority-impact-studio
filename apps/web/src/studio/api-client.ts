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
  StudioBriefAgentProposalResponseSchema,
  StudioBriefAgentProposalRejectResponseSchema,
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
  StudioBriefDraftVersionsResponseSchema,
  StudioBriefDraftVersionRestoreResponseSchema,
  StudioBriefDraftValidationResponseSchema,
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
  StudioRouteLadderResponseSchema,
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
): Promise<z.output<TSchema>> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
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
): Promise<z.output<TSchema> | null> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
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

export function fetchStudioRoutes() {
  return loadStudioJson("/api/v1/studio/routes", StudioRoutesResponseSchema);
}

export function fetchStudioSearch(query: string) {
  const params = new URLSearchParams({ q: query });
  return loadStudioJson(`/api/v1/studio/search?${params.toString()}`, StudioSearchResponseSchema);
}

export function fetchStudioRoute(routeId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/routes/${encodeURIComponent(routeId)}`,
    StudioRouteDetailResponseSchema,
  );
}

export function fetchStudioRouteLadder(routeId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/routes/${encodeURIComponent(routeId)}/ladder`,
    StudioRouteLadderResponseSchema,
  );
}

export function fetchStudioCompare(a: string, b: string) {
  const params = new URLSearchParams({ a, b });
  return loadNullableStudioJson(
    `/api/v1/studio/compare?${params.toString()}`,
    StudioCompareResponseSchema,
  );
}

export function fetchStudioFindings() {
  return loadStudioJson("/api/v1/studio/findings", StudioFindingsResponseSchema);
}

export function fetchStudioFinding(findingId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/findings/${encodeURIComponent(findingId)}`,
    StudioFindingResponseSchema,
  );
}

export function fetchStudioBriefs() {
  return loadStudioJson("/api/v1/studio/briefs", StudioBriefsResponseSchema);
}

export function fetchStudioBrief(briefId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/briefs/${encodeURIComponent(briefId)}`,
    StudioBriefResponseSchema,
  );
}

export function fetchStudioBriefEvidence(briefId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/briefs/${encodeURIComponent(briefId)}/evidence`,
    StudioBriefEvidenceResponseSchema,
  );
}

export function fetchStudioBriefHistory(briefId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/briefs/${encodeURIComponent(briefId)}/history`,
    StudioBriefHistoryResponseSchema,
  );
}

export function fetchStudioDocs() {
  return loadStudioJson("/api/v1/studio/docs", StudioDocsResponseSchema);
}

async function sendStudioJson(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  options: StudioMutationOptions = {},
): Promise<Response> {
  const response = await fetch(path, {
    method,
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

function draftBase(briefId: string): string {
  return `/api/v1/studio/briefs/${encodeURIComponent(briefId)}/draft`;
}

export function createStudioBriefDraft(
  input: StudioBriefCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    "/api/v1/studio/briefs",
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
  return mutateStudioVoid(draftBase(briefId), "PATCH", input, options);
}

export function generateStudioBriefDraft(
  briefId: string,
  input: StudioBriefDraftGenerateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    `${draftBase(briefId)}/generate`,
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
    `${draftBase(briefId)}/agent-runs`,
    "POST",
    input,
    StudioBriefAgentRunResponseSchema,
    options,
  );
}

export function fetchStudioBriefAgentRun(briefId: string, runId: string) {
  return loadStudioJson(
    `${draftBase(briefId)}/agent-runs/${encodeURIComponent(runId)}`,
    StudioBriefAgentRunResponseSchema,
  );
}

export function proposeStudioBriefAgentEdit(
  briefId: string,
  runId: string,
  input: StudioBriefAgentProposeEditRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    `${draftBase(briefId)}/agent-runs/${encodeURIComponent(runId)}/propose-edit`,
    "POST",
    input,
    StudioBriefAgentProposeEditResultSchema,
    options,
  );
}

export function fetchStudioBriefAgentProposal(briefId: string, proposalId: string) {
  return loadStudioJson(
    `${draftBase(briefId)}/proposals/${encodeURIComponent(proposalId)}`,
    StudioBriefAgentProposalResponseSchema,
  );
}

export function applyStudioBriefAgentProposal(
  briefId: string,
  proposalId: string,
  input: StudioBriefAgentProposalApplyRequest = {},
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    `${draftBase(briefId)}/proposals/${encodeURIComponent(proposalId)}/apply`,
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
    `${draftBase(briefId)}/proposals/${encodeURIComponent(proposalId)}/reject`,
    "POST",
    input,
    StudioBriefAgentProposalRejectResponseSchema,
    options,
  );
}

export function listStudioBriefDraftVersions(briefId: string) {
  return loadStudioJson(
    `${draftBase(briefId)}/versions`,
    StudioBriefDraftVersionsResponseSchema,
  );
}

export function restoreStudioBriefDraftVersion(
  briefId: string,
  versionId: string,
  input: StudioBriefDraftVersionRestoreRequest = {},
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    `${draftBase(briefId)}/versions/${encodeURIComponent(versionId)}/restore`,
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
    `${draftBase(briefId)}/claims`,
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
    `${draftBase(briefId)}/blocks`,
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
    `${draftBase(briefId)}/blocks/${encodeURIComponent(blockId)}`,
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
    `${draftBase(briefId)}/blocks/${encodeURIComponent(blockId)}`,
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
    `${draftBase(briefId)}/refs/resolve`,
    "POST",
    input,
    StudioBriefDraftRefsResolveResponseSchema,
    options,
  );
}

export function fetchStudioBriefDraftRefs(briefId: string) {
  return loadStudioJson(`${draftBase(briefId)}/refs`, StudioBriefDraftRefsResponseSchema);
}

export function replaceStudioBriefDraftRefs(
  briefId: string,
  input: StudioBriefDraftRefsReplaceRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    `${draftBase(briefId)}/refs`,
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
    `${draftBase(briefId)}/attach`,
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
    `${draftBase(briefId)}/promotion-receipt`,
    "POST",
    input,
    StudioBriefDraftPromotionReceiptResponseSchema,
    options,
  );
}

export function listStudioBriefDraftComments(briefId: string) {
  return loadStudioJson(`${draftBase(briefId)}/comments`, StudioBriefDraftCommentsResponseSchema);
}

export function createStudioBriefDraftComment(
  briefId: string,
  input: StudioBriefDraftCommentCreateRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioJson(
    `${draftBase(briefId)}/comments`,
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
    `${draftBase(briefId)}/comments/${encodeURIComponent(commentId)}/replies`,
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
    `${draftBase(briefId)}/comments/${encodeURIComponent(commentId)}`,
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
    `${draftBase(briefId)}/comments/${encodeURIComponent(commentId)}/accept-suggestion`,
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
  return mutateStudioVoid(`${draftBase(briefId)}/claims/${claimN}`, "PATCH", input, options);
}

export function deleteStudioBriefDraftClaim(
  briefId: string,
  claimN: number,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(`${draftBase(briefId)}/claims/${claimN}`, "DELETE", undefined, options);
}

export function validateStudioBriefDraft(briefId: string, options?: StudioMutationOptions) {
  return mutateStudioJson(
    `${draftBase(briefId)}/validate`,
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
  return mutateStudioVoid(`${draftBase(briefId)}/review`, "POST", input, options);
}

export function submitStudioBriefDraftVerdict(
  briefId: string,
  input: StudioBriefDraftVerdictRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(`${draftBase(briefId)}/verdict`, "POST", input, options);
}

export function publishStudioBriefDraftCandidate(
  briefId: string,
  input: StudioBriefDraftPublishRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(`${draftBase(briefId)}/publish`, "POST", input, options);
}

export function retractStudioBriefDraftCandidate(
  briefId: string,
  input: StudioBriefDraftRetractRequest,
  options?: StudioMutationOptions,
) {
  return mutateStudioVoid(`${draftBase(briefId)}/retract`, "POST", input, options);
}

export function fetchStudioBriefPublishCandidateExport(briefId: string) {
  return loadStudioJson(
    `${draftBase(briefId)}/publish-candidate-export`,
    StudioBriefPublishCandidateExportResponseSchema,
  );
}

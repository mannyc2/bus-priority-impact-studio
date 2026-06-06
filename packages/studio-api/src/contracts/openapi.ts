import {
  studioBriefAgentProposalApplyRequestJsonSchema,
  studioBriefAgentProposalApplyResponseJsonSchema,
  studioBriefAgentProposalRejectRequestJsonSchema,
  studioBriefAgentProposalRejectResponseJsonSchema,
  studioBriefAgentProposalResponseJsonSchema,
  studioBriefAgentProposeEditRequestJsonSchema,
  studioBriefAgentProposeEditResultJsonSchema,
  studioBriefAgentRunCreateRequestJsonSchema,
  studioBriefAgentRunResponseJsonSchema,
  studioBriefCreateRequestJsonSchema,
  studioBriefCreateResponseJsonSchema,
  studioBriefDraftAttachRequestJsonSchema,
  studioBriefDraftAttachResponseJsonSchema,
  studioBriefDraftBlockCreateRequestJsonSchema,
  studioBriefDraftBlockPatchRequestJsonSchema,
  studioBriefDraftBlockResponseJsonSchema,
  studioBriefDraftClaimCreateRequestJsonSchema,
  studioBriefDraftClaimPatchRequestJsonSchema,
  studioBriefDraftClaimResponseJsonSchema,
  studioBriefDraftCommentCreateRequestJsonSchema,
  studioBriefDraftCommentPatchRequestJsonSchema,
  studioBriefDraftCommentReplyRequestJsonSchema,
  studioBriefDraftCommentResponseJsonSchema,
  studioBriefDraftCommentsResponseJsonSchema,
  studioBriefDraftGenerateRequestJsonSchema,
  studioBriefDraftPatchRequestJsonSchema,
  studioBriefDraftPromotionReceiptRequestJsonSchema,
  studioBriefDraftPromotionReceiptResponseJsonSchema,
  studioBriefDraftPublishRequestJsonSchema,
  studioBriefDraftRefsReplaceRequestJsonSchema,
  studioBriefDraftRefsResolveRequestJsonSchema,
  studioBriefDraftRefsResolveResponseJsonSchema,
  studioBriefDraftRefsResponseJsonSchema,
  studioBriefDraftRetractRequestJsonSchema,
  studioBriefDraftReviewRequestJsonSchema,
  studioBriefDraftValidationResponseJsonSchema,
  studioBriefDraftVerdictRequestJsonSchema,
  studioBriefDraftVersionRestoreRequestJsonSchema,
  studioBriefDraftVersionRestoreResponseJsonSchema,
  studioBriefDraftVersionsResponseJsonSchema,
  studioBriefEvidenceResponseJsonSchema,
  studioBriefGenerationJobResponseJsonSchema,
  studioBriefHistoryResponseJsonSchema,
  studioBriefPublishCandidateExportResponseJsonSchema,
  studioBriefResponseJsonSchema,
  studioBriefsResponseJsonSchema,
  studioCompareResponseJsonSchema,
  studioDocsResponseJsonSchema,
  studioFindingResponseJsonSchema,
  studioFindingsResponseJsonSchema,
  studioMethodsResponseJsonSchema,
  studioRouteDetailResponseJsonSchema,
  studioRouteHistoryResponseJsonSchema,
  studioRouteLadderResponseJsonSchema,
  studioRouteSectionsResponseJsonSchema,
  studioRouteSpeedHistoryResponseJsonSchema,
  studioRoutesResponseJsonSchema,
  studioSearchResponseJsonSchema,
  studioSnapshotResponseJsonSchema,
} from "@bp/domain/json-schema";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type Operation = {
  operationId: string;
  summary: string;
  tags: string[];
  parameters?: Array<{
    name: string;
    in: "path" | "query" | "header";
    required: boolean;
    schema: Record<string, unknown>;
    description?: string;
  }>;
  requestBody?: {
    required: boolean;
    content: {
      "application/json": {
        schema: unknown;
      };
    };
  };
  security?: Array<Record<string, string[]>>;
  responses: Record<
    string,
    {
      description: string;
      content?: {
        "application/json": {
          schema: unknown;
        };
      };
    }
  >;
};

function jsonResponse(description: string, schema: unknown) {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function jsonRequest(schema: unknown): NonNullable<Operation["requestBody"]> {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function voidResponse(description: string) {
  return { description };
}

function errorResponse(description: string) {
  return jsonResponse(description, {
    type: "object",
    additionalProperties: false,
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
    required: ["error"],
  });
}

const routeSlugParameter = {
  name: "routeId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Canonical Studio route slug, such as m15-sbs.",
};

const studioRouteTimelineBundleJsonSchema = {
  type: "object",
  additionalProperties: true,
  required: ["artifactKind", "schemaVersion", "routeId", "events"],
  properties: {
    artifactKind: { const: "bp.tier2_route_timeline_bundle.v1", type: "string" },
    schemaVersion: { const: 1, type: "number" },
    routeId: { type: "string" },
    events: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

const findingIdParameter = {
  name: "findingId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
};

const briefIdParameter = {
  name: "briefId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
};

const claimNParameter = {
  name: "claimN",
  in: "path" as const,
  required: true,
  schema: { type: "integer", minimum: 1 },
  description: "One-based Studio brief draft claim number.",
};

const blockIdParameter = {
  name: "blockId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Studio brief draft typed block id.",
};

const commentIdParameter = {
  name: "commentId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Studio brief draft review thread id.",
};

const agentRunIdParameter = {
  name: "runId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Studio brief authoring agent run id.",
};

const proposalIdParameter = {
  name: "proposalId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Studio brief authoring agent proposal id.",
};

const draftVersionIdParameter = {
  name: "versionId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Studio brief draft version milestone id.",
};

const idempotencyKeyParameter = {
  name: "Idempotency-Key",
  in: "header" as const,
  required: true,
  schema: { type: "string", minLength: 1 },
  description: "Stable retry key required for Studio brief draft mutations.",
};

function getOperation(
  operationId: string,
  summary: string,
  responseSchema: unknown,
  parameters: Operation["parameters"] = [],
): Operation {
  return {
    operationId,
    summary,
    tags: ["Studio"],
    parameters,
    responses: {
      "200": jsonResponse("Studio response", responseSchema),
      "404": errorResponse("Requested Studio entity was not found."),
      "503": errorResponse("Studio projection artifact or serving binding is unavailable."),
    },
  };
}

function draftOperation(input: {
  operationId: string;
  summary: string;
  scope: "read:briefs" | "write:briefs" | "review:briefs" | "publish:briefs";
  parameters?: Operation["parameters"];
  idempotencyKey?: boolean;
  requestSchema?: unknown;
  responseSchema?: unknown;
  successStatus?: "200" | "204";
}): Operation {
  const successStatus = input.successStatus ?? (input.responseSchema === undefined ? "204" : "200");
  const parameters = [
    ...(input.parameters ?? [briefIdParameter]),
    ...(input.idempotencyKey === false ? [] : [idempotencyKeyParameter]),
  ];
  return {
    operationId: input.operationId,
    summary: input.summary,
    tags: ["Studio Draft Authoring"],
    parameters,
    ...(input.requestSchema === undefined ? {} : { requestBody: jsonRequest(input.requestSchema) }),
    security: [{ studioSession: [input.scope] }],
    responses: {
      [successStatus]:
        input.responseSchema === undefined
          ? voidResponse("Draft mutation accepted.")
          : jsonResponse("Studio draft response", input.responseSchema),
      "400": errorResponse("Request body or path parameter failed validation."),
      "401": errorResponse("Studio sign-in is required."),
      "403": errorResponse("The signed-in identity lacks the required operator scope."),
      "404": errorResponse("Requested Studio brief or draft entity was not found."),
      "409": errorResponse("The draft is not in a state that supports this operation."),
      "503": errorResponse("Studio D1/R2 serving binding is unavailable."),
    },
  };
}

const paths: Record<string, Partial<Record<HttpMethod, Operation>>> = {
  "/api/v1/studio/routes": {
    get: getOperation(
      "listStudioRoutes",
      "List Studio route cards.",
      studioRoutesResponseJsonSchema,
    ),
  },
  "/api/v1/studio/search": {
    get: getOperation(
      "searchStudio",
      "Search routes, findings, and briefs.",
      studioSearchResponseJsonSchema,
      [
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Free-text Studio query.",
        },
      ],
    ),
  },
  "/api/v1/studio/snapshot": {
    get: getOperation(
      "getStudioSnapshot",
      "Fetch the active Studio release/projection manifest.",
      studioSnapshotResponseJsonSchema,
    ),
  },
  "/api/v1/studio/routes/sections": {
    get: getOperation(
      "listStudioRouteSections",
      "Fetch Snapshot 2.0 route discovery sections.",
      studioRouteSectionsResponseJsonSchema,
    ),
  },
  "/api/v1/studio/routes/{routeId}": {
    get: getOperation(
      "getStudioRoute",
      "Fetch route detail, KPIs, diagnosis, and segment evidence.",
      studioRouteDetailResponseJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/routes/{routeId}/history": {
    get: getOperation(
      "getStudioRouteHistory",
      "Fetch route-month speed and ridership history.",
      studioRouteHistoryResponseJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/routes/{routeId}/speed-history": {
    get: getOperation(
      "getStudioRouteSpeedHistory",
      "Fetch route-segment speed history by month and daypart.",
      studioRouteSpeedHistoryResponseJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/routes/{routeId}/timeline": {
    get: getOperation(
      "getStudioRouteTimeline",
      "Fetch a source-backed Tier 2 route timeline bundle.",
      studioRouteTimelineBundleJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/routes/{routeId}/ladder": {
    get: getOperation(
      "getStudioRouteLadder",
      "Fetch the ordered route ladder and segment severity.",
      studioRouteLadderResponseJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/compare": {
    get: getOperation(
      "compareStudioRoutes",
      "Compare two Studio routes.",
      studioCompareResponseJsonSchema,
      [
        {
          name: "a",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Left route slug.",
        },
        {
          name: "b",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Right route slug.",
        },
      ],
    ),
  },
  "/api/v1/studio/findings": {
    get: getOperation(
      "listStudioFindings",
      "List source-backed Studio findings.",
      studioFindingsResponseJsonSchema,
    ),
  },
  "/api/v1/studio/findings/{findingId}": {
    get: getOperation(
      "getStudioFinding",
      "Fetch one finding and its reasoning trail.",
      studioFindingResponseJsonSchema,
      [findingIdParameter],
    ),
  },
  "/api/v1/studio/briefs": {
    get: getOperation("listStudioBriefs", "List Studio briefs.", studioBriefsResponseJsonSchema),
    post: draftOperation({
      operationId: "createStudioBriefDraft",
      summary: "Create a new Studio brief draft from a route, finding, or source brief seed.",
      scope: "write:briefs",
      parameters: [],
      requestSchema: studioBriefCreateRequestJsonSchema,
      responseSchema: studioBriefCreateResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}": {
    get: getOperation("getStudioBrief", "Fetch one Studio brief.", studioBriefResponseJsonSchema, [
      briefIdParameter,
    ]),
  },
  "/api/v1/studio/briefs/{briefId}/evidence": {
    get: getOperation(
      "getStudioBriefEvidence",
      "Fetch evidence-focused data for a Studio brief (claims, evidence, caveats).",
      studioBriefEvidenceResponseJsonSchema,
      [briefIdParameter],
    ),
  },
  "/api/v1/studio/briefs/{briefId}/history": {
    get: getOperation(
      "getStudioBriefHistory",
      "Fetch version history and review context for a Studio brief.",
      studioBriefHistoryResponseJsonSchema,
      [briefIdParameter],
    ),
  },
  "/api/v1/studio/briefs/{briefId}/draft": {
    patch: draftOperation({
      operationId: "updateStudioBriefDraft",
      summary: "Update Studio brief draft metadata.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftPatchRequestJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/generate": {
    post: draftOperation({
      operationId: "generateStudioBriefDraft",
      summary: "Queue a Studio brief draft AI-generation run.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftGenerateRequestJsonSchema,
      responseSchema: studioBriefGenerationJobResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/agent-runs": {
    post: draftOperation({
      operationId: "createStudioBriefAgentRun",
      summary: "Start a Studio brief authoring agent run against the current draft version.",
      scope: "write:briefs",
      requestSchema: studioBriefAgentRunCreateRequestJsonSchema,
      responseSchema: studioBriefAgentRunResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/agent-runs/{runId}": {
    get: draftOperation({
      operationId: "getStudioBriefAgentRun",
      summary: "Fetch one Studio brief authoring agent run.",
      scope: "read:briefs",
      parameters: [briefIdParameter, agentRunIdParameter],
      idempotencyKey: false,
      responseSchema: studioBriefAgentRunResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/agent-runs/{runId}/propose-edit": {
    post: draftOperation({
      operationId: "proposeStudioBriefAgentEdit",
      summary:
        "Submit structured agent edit operations and receive repair feedback or a stored proposal.",
      scope: "write:briefs",
      parameters: [briefIdParameter, agentRunIdParameter],
      requestSchema: studioBriefAgentProposeEditRequestJsonSchema,
      responseSchema: studioBriefAgentProposeEditResultJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/proposals/{proposalId}": {
    get: draftOperation({
      operationId: "getStudioBriefAgentProposal",
      summary: "Fetch one stored Studio brief agent proposal for preview and approval.",
      scope: "read:briefs",
      parameters: [briefIdParameter, proposalIdParameter],
      idempotencyKey: false,
      responseSchema: studioBriefAgentProposalResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/proposals/{proposalId}/apply": {
    post: draftOperation({
      operationId: "applyStudioBriefAgentProposal",
      summary: "Apply all or selected operations from an approved Studio brief agent proposal.",
      scope: "write:briefs",
      parameters: [briefIdParameter, proposalIdParameter],
      requestSchema: studioBriefAgentProposalApplyRequestJsonSchema,
      responseSchema: studioBriefAgentProposalApplyResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/proposals/{proposalId}/reject": {
    post: draftOperation({
      operationId: "rejectStudioBriefAgentProposal",
      summary: "Reject a Studio brief agent proposal without mutating accepted draft content.",
      scope: "write:briefs",
      parameters: [briefIdParameter, proposalIdParameter],
      requestSchema: studioBriefAgentProposalRejectRequestJsonSchema,
      responseSchema: studioBriefAgentProposalRejectResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/versions": {
    get: draftOperation({
      operationId: "listStudioBriefDraftVersions",
      summary: "List restoreable Studio brief draft version milestones.",
      scope: "read:briefs",
      idempotencyKey: false,
      responseSchema: studioBriefDraftVersionsResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/versions/{versionId}/restore": {
    post: draftOperation({
      operationId: "restoreStudioBriefDraftVersion",
      summary: "Create a new Studio brief draft version by restoring an older version snapshot.",
      scope: "write:briefs",
      parameters: [briefIdParameter, draftVersionIdParameter],
      requestSchema: studioBriefDraftVersionRestoreRequestJsonSchema,
      responseSchema: studioBriefDraftVersionRestoreResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/claims": {
    post: draftOperation({
      operationId: "addStudioBriefDraftClaim",
      summary: "Add a claim to a Studio brief draft.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftClaimCreateRequestJsonSchema,
      responseSchema: studioBriefDraftClaimResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/claims/{claimN}": {
    patch: draftOperation({
      operationId: "updateStudioBriefDraftClaim",
      summary: "Update one Studio brief draft claim.",
      scope: "write:briefs",
      parameters: [briefIdParameter, claimNParameter],
      requestSchema: studioBriefDraftClaimPatchRequestJsonSchema,
    }),
    delete: draftOperation({
      operationId: "deleteStudioBriefDraftClaim",
      summary: "Delete one Studio brief draft claim.",
      scope: "write:briefs",
      parameters: [briefIdParameter, claimNParameter],
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/blocks": {
    post: draftOperation({
      operationId: "addStudioBriefDraftBlock",
      summary: "Add a typed primitive block to a Studio brief draft.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftBlockCreateRequestJsonSchema,
      responseSchema: studioBriefDraftBlockResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/blocks/{blockId}": {
    patch: draftOperation({
      operationId: "updateStudioBriefDraftBlock",
      summary: "Update one typed primitive block in a Studio brief draft.",
      scope: "write:briefs",
      parameters: [briefIdParameter, blockIdParameter],
      requestSchema: studioBriefDraftBlockPatchRequestJsonSchema,
    }),
    delete: draftOperation({
      operationId: "deleteStudioBriefDraftBlock",
      summary: "Delete one typed primitive block from a Studio brief draft.",
      scope: "write:briefs",
      parameters: [briefIdParameter, blockIdParameter],
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/refs/resolve": {
    post: draftOperation({
      operationId: "resolveStudioBriefDraftRefs",
      summary: "Validate and normalize refs for a Studio brief draft content graph.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftRefsResolveRequestJsonSchema,
      responseSchema: studioBriefDraftRefsResolveResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/refs": {
    get: draftOperation({
      operationId: "fetchStudioBriefDraftRefs",
      summary: "List persisted refs for a Studio brief draft content graph.",
      scope: "read:briefs",
      idempotencyKey: false,
      responseSchema: studioBriefDraftRefsResponseJsonSchema,
    }),
    put: draftOperation({
      operationId: "replaceStudioBriefDraftRefs",
      summary: "Replace persisted refs for a Studio brief draft content graph.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftRefsReplaceRequestJsonSchema,
      responseSchema: studioBriefDraftRefsResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/attach": {
    post: draftOperation({
      operationId: "attachStudioBriefDraftBlock",
      summary: "Attach a captured Studio object to a draft as a typed block and refs.",
      scope: "write:briefs",
      requestSchema: studioBriefDraftAttachRequestJsonSchema,
      responseSchema: studioBriefDraftAttachResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/comments": {
    get: draftOperation({
      operationId: "listStudioBriefDraftComments",
      summary: "List draft-private review threads for a Studio brief draft.",
      scope: "read:briefs",
      idempotencyKey: false,
      responseSchema: studioBriefDraftCommentsResponseJsonSchema,
    }),
    post: draftOperation({
      operationId: "createStudioBriefDraftComment",
      summary: "Create an anchored review thread or suggested edit on a Studio brief draft.",
      scope: "review:briefs",
      requestSchema: studioBriefDraftCommentCreateRequestJsonSchema,
      responseSchema: studioBriefDraftCommentResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/comments/{commentId}": {
    patch: draftOperation({
      operationId: "updateStudioBriefDraftComment",
      summary: "Resolve, reopen, dismiss, or edit a draft-private review thread.",
      scope: "review:briefs",
      parameters: [briefIdParameter, commentIdParameter],
      requestSchema: studioBriefDraftCommentPatchRequestJsonSchema,
      responseSchema: studioBriefDraftCommentResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/comments/{commentId}/replies": {
    post: draftOperation({
      operationId: "replyStudioBriefDraftComment",
      summary: "Reply to a draft-private review thread.",
      scope: "review:briefs",
      parameters: [briefIdParameter, commentIdParameter],
      requestSchema: studioBriefDraftCommentReplyRequestJsonSchema,
      responseSchema: studioBriefDraftCommentResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/comments/{commentId}/accept-suggestion": {
    post: draftOperation({
      operationId: "acceptStudioBriefDraftSuggestion",
      summary: "Apply an open suggested edit to draft body markdown.",
      scope: "write:briefs",
      parameters: [briefIdParameter, commentIdParameter],
      requestSchema: { type: "object", additionalProperties: false },
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/validate": {
    post: draftOperation({
      operationId: "validateStudioBriefDraft",
      summary: "Refresh deterministic validation checks for a Studio brief draft.",
      scope: "write:briefs",
      requestSchema: { type: "object", additionalProperties: false },
      responseSchema: studioBriefDraftValidationResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/review": {
    post: draftOperation({
      operationId: "requestStudioBriefDraftReview",
      summary: "Request review for a Studio brief draft.",
      scope: "review:briefs",
      requestSchema: studioBriefDraftReviewRequestJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/verdict": {
    post: draftOperation({
      operationId: "submitStudioBriefDraftVerdict",
      summary: "Approve a Studio brief draft or request changes.",
      scope: "review:briefs",
      requestSchema: studioBriefDraftVerdictRequestJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/publish": {
    post: draftOperation({
      operationId: "publishStudioBriefDraftCandidate",
      summary: "Mark a Studio brief draft as a publish candidate.",
      scope: "publish:briefs",
      requestSchema: studioBriefDraftPublishRequestJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/retract": {
    post: draftOperation({
      operationId: "retractStudioBriefDraftCandidate",
      summary: "Retract a Studio brief draft publish candidate.",
      scope: "publish:briefs",
      requestSchema: studioBriefDraftRetractRequestJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/promotion-receipt": {
    post: draftOperation({
      operationId: "recordStudioBriefPromotionReceipt",
      summary: "Record that an offline publish-candidate promotion completed.",
      scope: "publish:briefs",
      requestSchema: studioBriefDraftPromotionReceiptRequestJsonSchema,
      responseSchema: studioBriefDraftPromotionReceiptResponseJsonSchema,
    }),
  },
  "/api/v1/studio/briefs/{briefId}/draft/publish-candidate-export": {
    get: draftOperation({
      operationId: "fetchStudioBriefPublishCandidateExport",
      summary: "Fetch the publish-candidate export payload for a Studio brief draft.",
      scope: "publish:briefs",
      idempotencyKey: false,
      responseSchema: studioBriefPublishCandidateExportResponseJsonSchema,
    }),
  },
  "/api/v1/studio/methods": {
    get: getOperation(
      "getStudioMethods",
      "Fetch dataset and methodology metadata.",
      studioMethodsResponseJsonSchema,
    ),
  },
  "/api/v1/studio/docs": {
    get: getOperation(
      "getStudioDocs",
      "Fetch docs navigation and API metadata.",
      studioDocsResponseJsonSchema,
    ),
  },
};

export const studioOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Bus Priority Impact Studio API",
    version: "1.0.0",
    description:
      "Route-first Studio contracts consumed by the Bus Priority Impact Studio website and future generated agent/CLI surfaces.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  components: {
    securitySchemes: {
      studioSession: {
        type: "apiKey",
        in: "cookie",
        name: "bp_session",
        description:
          "Magic-link Studio session cookie with operator scopes enforced by the Worker.",
      },
    },
  },
  paths,
} as const;

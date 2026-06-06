import * as z from "zod";
import {
  StudioBriefBlockSchema,
  StudioBriefDraftStatusSchema,
  StudioBriefRefSchema,
  StudioClaimSchema,
} from "./read-model.js";

// Brief composer workspace contracts. Shapes mirror the D1 persistence layer in
// @bp/db (studio-brief-drafts.ts) without importing it — the domain package stays
// infra-free. The draft record is the parsed (not raw-JSON) projection consumers read.
// StudioBriefDraftStatus lives in the Studio brief read-model contracts.

const GenerationJobStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
const GenerationModeSchema = z.enum(["deterministic_seed", "llm_assisted"]);
const LlmGenerationStatusSchema = z.enum([
  "not_configured",
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const StudioBriefDraftSchema = z
  .object({
    briefId: z.string(),
    routeSlug: z.string(),
    workspaceId: z.string().nullable(),
    sourceBriefId: z.string().nullable(),
    fromFindingId: z.string().nullable(),
    status: StudioBriefDraftStatusSchema,
    title: z.string(),
    dek: z.string(),
    summary: z.string(),
    bodyMd: z.string().nullable(),
    version: z.string(),
    jobId: z.string(),
    jobStatus: GenerationJobStatusSchema,
    jobGenerationMode: GenerationModeSchema,
    jobLlmStatus: LlmGenerationStatusSchema,
    jobLlmProvider: z.string().nullable(),
    jobLlmModel: z.string().nullable(),
    jobStartedAt: z.string().nullable(),
    jobCompletedAt: z.string().nullable(),
    jobError: z.string().nullable(),
    validationScore: z.number().int().nullable(),
    validationWeakClaims: z.array(z.number().int().positive()),
    validationMissingEvidence: z.array(z.number().int().positive()),
    validationBlockingIssues: z.array(z.string()),
    lastValidatedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullable(),
    promotionCandidateId: z.string().nullable().optional(),
    promotionTargetBriefId: z.string().nullable().optional(),
    promotionArtifactKey: z.string().nullable().optional(),
    promotionArtifactSha256: z.string().nullable().optional(),
    promotionRecordedAt: z.string().nullable().optional(),
    claims: z.array(StudioClaimSchema),
    blocks: z.array(StudioBriefBlockSchema).default([]),
    refs: z.array(StudioBriefRefSchema).default([]),
  })
  .strict();
export type StudioBriefDraft = z.output<typeof StudioBriefDraftSchema>;

// --- Validation ---

export const StudioBriefDraftValidationSchema = z
  .object({
    score: z.number().int(),
    weakClaims: z.array(z.number().int().positive()),
    missingEvidence: z.array(z.number().int().positive()),
    blockingIssues: z.array(z.string()),
    validatedAt: z.string(),
  })
  .strict();
export type StudioBriefDraftValidation = z.output<typeof StudioBriefDraftValidationSchema>;

export const StudioBriefDraftValidationResponseSchema = z
  .object({ validation: StudioBriefDraftValidationSchema })
  .strict();
export type StudioBriefDraftValidationResponse = z.output<
  typeof StudioBriefDraftValidationResponseSchema
>;

// --- Generation ---

export const StudioBriefDraftGenerateRequestSchema = z.object({}).strict();
export type StudioBriefDraftGenerateRequest = z.output<
  typeof StudioBriefDraftGenerateRequestSchema
>;

export const StudioBriefGenerationJobResponseSchema = z
  .object({
    status: GenerationJobStatusSchema,
    error: z.string().nullable(),
    draft: StudioBriefDraftSchema,
  })
  .strict();
export type StudioBriefGenerationJobResponse = z.output<
  typeof StudioBriefGenerationJobResponseSchema
>;

// --- Draft + claim edits ---

export const StudioBriefCreateRequestSchema = z
  .object({
    routeSlug: z.string().optional(),
    sourceBriefId: z.string().nullable().optional(),
    fromFindingId: z.string().nullable().optional(),
    title: z.string().optional(),
    dek: z.string().optional(),
    summary: z.string().optional(),
    bodyMd: z.string().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.routeSlug !== undefined ||
      value.sourceBriefId !== undefined ||
      value.fromFindingId !== undefined,
    {
      message: "A routeSlug, sourceBriefId, or fromFindingId seed is required.",
    },
  );
export type StudioBriefCreateRequest = z.output<typeof StudioBriefCreateRequestSchema>;

export const StudioBriefCreateResponseSchema = z.object({ draft: StudioBriefDraftSchema }).strict();
export type StudioBriefCreateResponse = z.output<typeof StudioBriefCreateResponseSchema>;

export const StudioBriefDraftPatchRequestSchema = z
  .object({
    title: z.string().optional(),
    dek: z.string().optional(),
    summary: z.string().optional(),
    bodyMd: z.string().optional(),
    status: z.enum(["draft", "in_review", "approved", "archived"]).optional(),
  })
  .strict();
export type StudioBriefDraftPatchRequest = z.output<typeof StudioBriefDraftPatchRequestSchema>;

export const StudioBriefDraftClaimCreateRequestSchema = z
  .object({
    title: z.string(),
    body: z.string().nullable().optional(),
    strength: z.number().int(),
    evidenceIds: z.array(z.string()),
    caveatIds: z.array(z.string()),
    state: z.enum(["editing", "weak", "active"]).nullable().optional(),
  })
  .strict();
export type StudioBriefDraftClaimCreateRequest = z.output<
  typeof StudioBriefDraftClaimCreateRequestSchema
>;

export const StudioBriefDraftClaimPatchRequestSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().nullable().optional(),
    strength: z.number().int().optional(),
    evidenceIds: z.array(z.string()).optional(),
    caveatIds: z.array(z.string()).optional(),
    state: z.enum(["editing", "weak", "active"]).optional(),
  })
  .strict();
export type StudioBriefDraftClaimPatchRequest = z.output<
  typeof StudioBriefDraftClaimPatchRequestSchema
>;

export const StudioBriefDraftClaimResponseSchema = z.object({ claim: StudioClaimSchema }).strict();
export type StudioBriefDraftClaimResponse = z.output<typeof StudioBriefDraftClaimResponseSchema>;

// --- Typed primitive blocks / refs ---

export const StudioBriefDraftBlockCreateRequestSchema = z
  .object({ block: StudioBriefBlockSchema })
  .strict();
export type StudioBriefDraftBlockCreateRequest = z.output<
  typeof StudioBriefDraftBlockCreateRequestSchema
>;

export const StudioBriefDraftBlockPatchRequestSchema = z
  .object({ block: StudioBriefBlockSchema })
  .strict();
export type StudioBriefDraftBlockPatchRequest = z.output<
  typeof StudioBriefDraftBlockPatchRequestSchema
>;

export const StudioBriefDraftBlockResponseSchema = z
  .object({ block: StudioBriefBlockSchema })
  .strict();
export type StudioBriefDraftBlockResponse = z.output<typeof StudioBriefDraftBlockResponseSchema>;

export const StudioBriefDraftRefsResolveRequestSchema = z
  .object({ refs: z.array(StudioBriefRefSchema) })
  .strict();
export type StudioBriefDraftRefsResolveRequest = z.output<
  typeof StudioBriefDraftRefsResolveRequestSchema
>;

export const StudioBriefDraftRefsResolveResponseSchema = z
  .object({
    refs: z.array(StudioBriefRefSchema),
    unresolved: z.array(z.string()),
  })
  .strict();
export type StudioBriefDraftRefsResolveResponse = z.output<
  typeof StudioBriefDraftRefsResolveResponseSchema
>;

export const StudioBriefDraftRefsReplaceRequestSchema = z
  .object({ refs: z.array(StudioBriefRefSchema) })
  .strict();
export type StudioBriefDraftRefsReplaceRequest = z.output<
  typeof StudioBriefDraftRefsReplaceRequestSchema
>;

export const StudioBriefDraftRefsResponseSchema = z
  .object({
    refs: z.array(StudioBriefRefSchema),
    unresolved: z.array(z.string()).default([]),
  })
  .strict();
export type StudioBriefDraftRefsResponse = z.output<typeof StudioBriefDraftRefsResponseSchema>;

export const StudioBriefDraftAttachRequestSchema = z
  .object({
    block: StudioBriefBlockSchema,
    refs: z.array(StudioBriefRefSchema).default([]),
    bodyDirective: z.string().min(1).optional(),
    appendToBody: z.boolean().default(true),
  })
  .strict();
export type StudioBriefDraftAttachRequest = z.output<typeof StudioBriefDraftAttachRequestSchema>;

export const StudioBriefDraftAttachResponseSchema = z
  .object({
    draft: StudioBriefDraftSchema,
    block: StudioBriefBlockSchema,
    refs: z.array(StudioBriefRefSchema),
  })
  .strict();
export type StudioBriefDraftAttachResponse = z.output<typeof StudioBriefDraftAttachResponseSchema>;

// --- Review collaboration / retract / publish ---

const StudioBriefDraftReviewThreadKindSchema = z.enum([
  "comment",
  "change-requested",
  "suggested-edit",
]);
const StudioBriefDraftReviewThreadStatusSchema = z.enum(["open", "resolved", "dismissed"]);

export const StudioBriefDraftReviewAnchorSchema = z
  .object({
    target: z.enum(["body", "claim", "block", "draft"]),
    targetId: z.string().nullable(),
    quote: z
      .object({
        exact: z.string().min(1),
        prefix: z.string().optional(),
        suffix: z.string().optional(),
      })
      .strict()
      .nullable(),
    range: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    contentHash: z.string().optional(),
  })
  .strict()
  .refine((value) => value.range === undefined || value.range.end >= value.range.start, {
    message: "Anchor range end must be greater than or equal to start.",
  });
export type StudioBriefDraftReviewAnchor = z.output<typeof StudioBriefDraftReviewAnchorSchema>;

export const StudioBriefDraftReviewSuggestionSchema = z
  .object({
    suggestFrom: z.string().min(1),
    suggestTo: z.string(),
  })
  .strict();
export type StudioBriefDraftReviewSuggestion = z.output<
  typeof StudioBriefDraftReviewSuggestionSchema
>;

export const StudioBriefDraftReviewReplySchema = z
  .object({
    commentId: z.string(),
    parentCommentId: z.string(),
    briefId: z.string(),
    author: z.string(),
    authorDisplayName: z.string().nullable(),
    body: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type StudioBriefDraftReviewReply = z.output<typeof StudioBriefDraftReviewReplySchema>;

export const StudioBriefDraftReviewThreadSchema = z
  .object({
    commentId: z.string(),
    briefId: z.string(),
    kind: StudioBriefDraftReviewThreadKindSchema,
    status: StudioBriefDraftReviewThreadStatusSchema,
    author: z.string(),
    authorDisplayName: z.string().nullable(),
    body: z.string(),
    anchor: StudioBriefDraftReviewAnchorSchema,
    suggestion: StudioBriefDraftReviewSuggestionSchema.nullable(),
    replies: z.array(StudioBriefDraftReviewReplySchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    resolvedAt: z.string().nullable(),
    resolvedBy: z.string().nullable(),
  })
  .strict();
export type StudioBriefDraftReviewThread = z.output<typeof StudioBriefDraftReviewThreadSchema>;

export const StudioBriefDraftCommentsResponseSchema = z
  .object({ comments: z.array(StudioBriefDraftReviewThreadSchema) })
  .strict();
export type StudioBriefDraftCommentsResponse = z.output<
  typeof StudioBriefDraftCommentsResponseSchema
>;

export const StudioBriefDraftCommentCreateRequestSchema = z
  .object({
    kind: StudioBriefDraftReviewThreadKindSchema.default("comment"),
    body: z.string().min(1),
    anchor: StudioBriefDraftReviewAnchorSchema,
    suggestion: StudioBriefDraftReviewSuggestionSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "suggested-edit" && value.suggestion == null) {
      context.addIssue({
        code: "custom",
        message: "suggested-edit comments require a suggestion payload.",
        path: ["suggestion"],
      });
    }
    if (value.kind !== "suggested-edit" && value.suggestion != null) {
      context.addIssue({
        code: "custom",
        message: "Only suggested-edit comments can carry a suggestion payload.",
        path: ["suggestion"],
      });
    }
    if (
      value.kind === "suggested-edit" &&
      value.suggestion != null &&
      value.anchor.quote?.exact !== value.suggestion.suggestFrom
    ) {
      context.addIssue({
        code: "custom",
        message: "suggestFrom must match the anchor quote exact text.",
        path: ["suggestion", "suggestFrom"],
      });
    }
  });
export type StudioBriefDraftCommentCreateRequest = z.output<
  typeof StudioBriefDraftCommentCreateRequestSchema
>;

export const StudioBriefDraftCommentReplyRequestSchema = z
  .object({ body: z.string().min(1) })
  .strict();
export type StudioBriefDraftCommentReplyRequest = z.output<
  typeof StudioBriefDraftCommentReplyRequestSchema
>;

export const StudioBriefDraftCommentPatchRequestSchema = z
  .object({
    status: StudioBriefDraftReviewThreadStatusSchema.optional(),
    body: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.body !== undefined, {
    message: "A status or body update is required.",
  });
export type StudioBriefDraftCommentPatchRequest = z.output<
  typeof StudioBriefDraftCommentPatchRequestSchema
>;

export const StudioBriefDraftCommentResponseSchema = z
  .object({ comment: StudioBriefDraftReviewThreadSchema })
  .strict();
export type StudioBriefDraftCommentResponse = z.output<
  typeof StudioBriefDraftCommentResponseSchema
>;

export const StudioBriefDraftReviewCommentSchema = z
  .object({
    commentId: z.string(),
    briefId: z.string(),
    reviewer: z.string(),
    reviewerDisplayName: z.string().nullable(),
    message: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type StudioBriefDraftReviewComment = z.output<typeof StudioBriefDraftReviewCommentSchema>;

export const StudioBriefDraftReviewRequestSchema = z.object({ message: z.string() }).strict();
export type StudioBriefDraftReviewRequest = z.output<typeof StudioBriefDraftReviewRequestSchema>;

export const StudioBriefDraftReviewResponseSchema = z
  .object({ comment: StudioBriefDraftReviewCommentSchema })
  .strict();
export type StudioBriefDraftReviewResponse = z.output<typeof StudioBriefDraftReviewResponseSchema>;

// --- AI authoring agent runs / proposals ---

export const StudioBriefAgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "needs_approval",
  "failed",
  "cancelled",
  "superseded",
]);
export type StudioBriefAgentRunStatus = z.output<typeof StudioBriefAgentRunStatusSchema>;

export const StudioBriefAgentRunIntentSchema = z.enum([
  "generate_brief",
  "revise_selection",
  "fix_validation_issue",
  "insert_from_corpus",
  "send_to_brief",
  "review_response",
  "freeform_edit",
]);
export type StudioBriefAgentRunIntent = z.output<typeof StudioBriefAgentRunIntentSchema>;

export const StudioBriefAgentProposalStatusSchema = z.enum([
  "drafting",
  "proposed",
  "applying",
  "partially_applied",
  "applied",
  "rejected",
  "stale",
]);
export type StudioBriefAgentProposalStatus = z.output<typeof StudioBriefAgentProposalStatusSchema>;

export const StudioBriefAgentTriggerSchema = z
  .object({
    message: z.string().optional(),
    target: StudioBriefDraftReviewAnchorSchema.optional(),
    source: z.string().optional(),
  })
  .strict();
export type StudioBriefAgentTrigger = z.output<typeof StudioBriefAgentTriggerSchema>;

const StudioBriefAgentOperationBaseSchema = z.object({ opId: z.string().min(1) }).strict();

export const StudioBriefAgentOperationSchema = z.discriminatedUnion("type", [
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("replace_body_md"),
    bodyMd: z.string(),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("replace_body_range"),
    anchor: StudioBriefDraftReviewAnchorSchema,
    replaceWith: z.string(),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("upsert_block"),
    block: z.unknown(),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("delete_block"),
    blockId: z.string().min(1),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("replace_refs"),
    refs: z.array(z.unknown()),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("upsert_claim"),
    claim: z
      .object({
        claimN: z.number().int().positive().optional(),
        title: z.string(),
        body: z.string().nullable().optional(),
        strength: z.number().int(),
        evidenceIds: z.array(z.string()),
        caveatIds: z.array(z.string()),
        state: z.enum(["editing", "weak", "active"]).nullable().optional(),
      })
      .strict(),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("delete_claim"),
    claimN: z.number().int().positive(),
  }).strict(),
  StudioBriefAgentOperationBaseSchema.extend({
    type: z.literal("add_review_reply"),
    commentId: z.string().min(1),
    body: z.string().min(1),
  }).strict(),
]);
export type StudioBriefAgentOperation = z.output<typeof StudioBriefAgentOperationSchema>;

export const StudioBriefAgentProvenanceSchema = z
  .object({
    modelProvider: z.string().nullable(),
    modelId: z.string().nullable(),
    promptHash: z.string().nullable(),
    evidenceRefs: z.array(z.string()).default([]),
  })
  .strict();
export type StudioBriefAgentProvenance = z.output<typeof StudioBriefAgentProvenanceSchema>;

export const StudioBriefAgentProposalErrorSchema = z
  .object({
    code: z.string().min(1),
    path: z.string(),
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();
export type StudioBriefAgentProposalError = z.output<typeof StudioBriefAgentProposalErrorSchema>;

export const StudioBriefAgentRunSchema = z
  .object({
    runId: z.string(),
    briefId: z.string(),
    workspaceId: z.string().nullable(),
    status: StudioBriefAgentRunStatusSchema,
    intent: StudioBriefAgentRunIntentSchema,
    baseVersionId: z.string(),
    baseContentHash: z.string().length(64),
    trigger: StudioBriefAgentTriggerSchema,
    actorId: z.string(),
    actorDisplayName: z.string().nullable(),
    modelProvider: z.string().nullable(),
    modelId: z.string().nullable(),
    promptHash: z.string().nullable(),
    proposalId: z.string().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .strict();
export type StudioBriefAgentRun = z.output<typeof StudioBriefAgentRunSchema>;

export const StudioBriefAgentProposalSchema = z
  .object({
    proposalId: z.string(),
    runId: z.string(),
    briefId: z.string(),
    status: StudioBriefAgentProposalStatusSchema,
    baseVersionId: z.string(),
    baseContentHash: z.string().length(64),
    title: z.string(),
    summary: z.string(),
    operations: z.array(StudioBriefAgentOperationSchema),
    validation: StudioBriefDraftValidationSchema.nullable(),
    previewHash: z.string().length(64),
    provenance: StudioBriefAgentProvenanceSchema,
    acceptedOperationIds: z.array(z.string()).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
    appliedAt: z.string().nullable(),
    rejectedAt: z.string().nullable(),
  })
  .strict();
export type StudioBriefAgentProposal = z.output<typeof StudioBriefAgentProposalSchema>;

export const StudioBriefAgentRunCreateRequestSchema = z
  .object({
    intent: StudioBriefAgentRunIntentSchema.default("generate_brief"),
    trigger: StudioBriefAgentTriggerSchema.default({}),
  })
  .strict();
export type StudioBriefAgentRunCreateRequest = z.output<
  typeof StudioBriefAgentRunCreateRequestSchema
>;

export const StudioBriefAgentRunResponseSchema = z
  .object({ run: StudioBriefAgentRunSchema })
  .strict();
export type StudioBriefAgentRunResponse = z.output<typeof StudioBriefAgentRunResponseSchema>;

export const StudioBriefAgentProposeEditRequestSchema = z
  .object({
    baseVersionId: z.string().optional(),
    baseContentHash: z.string().length(64).optional(),
    title: z.string().min(1),
    summary: z.string().min(1),
    operations: z.array(StudioBriefAgentOperationSchema).min(1).max(50),
    provenance: StudioBriefAgentProvenanceSchema.default({
      modelProvider: null,
      modelId: null,
      promptHash: null,
      evidenceRefs: [],
    }),
  })
  .strict();
export type StudioBriefAgentProposeEditRequest = z.output<
  typeof StudioBriefAgentProposeEditRequestSchema
>;

export const StudioBriefAgentProposeEditResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      proposalId: z.string(),
      status: z.literal("proposed"),
      previewHash: z.string().length(64),
      validation: StudioBriefDraftValidationSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      status: z.enum(["repair_required", "stale_base", "rejected"]),
      errors: z.array(StudioBriefAgentProposalErrorSchema),
    })
    .strict(),
]);
export type StudioBriefAgentProposeEditResult = z.output<
  typeof StudioBriefAgentProposeEditResultSchema
>;

export const StudioBriefAgentProposalResponseSchema = z
  .object({ proposal: StudioBriefAgentProposalSchema })
  .strict();
export type StudioBriefAgentProposalResponse = z.output<
  typeof StudioBriefAgentProposalResponseSchema
>;

export const StudioBriefAgentProposalApplyRequestSchema = z
  .object({
    operationIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export type StudioBriefAgentProposalApplyRequest = z.output<
  typeof StudioBriefAgentProposalApplyRequestSchema
>;

export const StudioBriefAgentProposalRejectRequestSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();
export type StudioBriefAgentProposalRejectRequest = z.output<
  typeof StudioBriefAgentProposalRejectRequestSchema
>;

export const StudioBriefDraftVersionSchema = z
  .object({
    versionId: z.string(),
    briefId: z.string(),
    parentVersionId: z.string().nullable(),
    contentHash: z.string().length(64),
    actorId: z.string(),
    actorType: z.enum(["human", "agent", "system"]),
    reason: z.enum([
      "draft_created",
      "manual_edit",
      "agent_proposal_applied",
      "suggestion_accepted",
      "publish_candidate",
      "promotion_receipt",
      "restored",
    ]),
    sourceRunId: z.string().nullable(),
    sourceProposalId: z.string().nullable(),
    validationScore: z.number().int().nullable(),
    snapshotRef: z
      .object({
        storage: z.enum(["d1", "r2"]),
        key: z.string().min(1),
        sha256: z.string().length(64),
      })
      .strict(),
    createdAt: z.string(),
  })
  .strict();
export type StudioBriefDraftVersion = z.output<typeof StudioBriefDraftVersionSchema>;

export const StudioBriefDraftVersionsResponseSchema = z
  .object({ versions: z.array(StudioBriefDraftVersionSchema) })
  .strict();
export type StudioBriefDraftVersionsResponse = z.output<
  typeof StudioBriefDraftVersionsResponseSchema
>;

export const StudioBriefAgentProposalApplyResponseSchema = z
  .object({
    draft: StudioBriefDraftSchema,
    proposal: StudioBriefAgentProposalSchema,
    version: StudioBriefDraftVersionSchema,
  })
  .strict();
export type StudioBriefAgentProposalApplyResponse = z.output<
  typeof StudioBriefAgentProposalApplyResponseSchema
>;

export const StudioBriefAgentProposalRejectResponseSchema = z
  .object({ proposal: StudioBriefAgentProposalSchema })
  .strict();
export type StudioBriefAgentProposalRejectResponse = z.output<
  typeof StudioBriefAgentProposalRejectResponseSchema
>;

export const StudioBriefDraftVersionRestoreRequestSchema = z.object({}).strict();
export type StudioBriefDraftVersionRestoreRequest = z.output<
  typeof StudioBriefDraftVersionRestoreRequestSchema
>;

export const StudioBriefDraftVersionRestoreResponseSchema = z
  .object({
    draft: StudioBriefDraftSchema,
    version: StudioBriefDraftVersionSchema,
  })
  .strict();
export type StudioBriefDraftVersionRestoreResponse = z.output<
  typeof StudioBriefDraftVersionRestoreResponseSchema
>;

export const StudioBriefDraftVerdictRequestSchema = z
  .object({
    verdict: z.enum(["approve", "request_changes"]),
    message: z.string().optional(),
  })
  .strict();
export type StudioBriefDraftVerdictRequest = z.output<typeof StudioBriefDraftVerdictRequestSchema>;

export const StudioBriefDraftRetractRequestSchema = z.object({}).strict();
export type StudioBriefDraftRetractRequest = z.output<typeof StudioBriefDraftRetractRequestSchema>;

export const StudioBriefDraftRetractResponseSchema = z
  .object({ draft: StudioBriefDraftSchema })
  .strict();
export type StudioBriefDraftRetractResponse = z.output<
  typeof StudioBriefDraftRetractResponseSchema
>;

export const StudioBriefDraftPublishRequestSchema = z.object({}).strict();
export type StudioBriefDraftPublishRequest = z.output<typeof StudioBriefDraftPublishRequestSchema>;

export const StudioBriefDraftPublishResponseSchema = z
  .object({ draft: StudioBriefDraftSchema })
  .strict();
export type StudioBriefDraftPublishResponse = z.output<
  typeof StudioBriefDraftPublishResponseSchema
>;

export const StudioBriefDraftPromotionReceiptRequestSchema = z
  .object({
    candidateId: z.string().min(1),
    targetBriefId: z.string().min(1),
    artifactKey: z.string().min(1),
    artifactSha256: z.string().length(64),
    promotedAt: z.string().optional(),
  })
  .strict();
export type StudioBriefDraftPromotionReceiptRequest = z.output<
  typeof StudioBriefDraftPromotionReceiptRequestSchema
>;

export const StudioBriefDraftPromotionReceiptResponseSchema = z
  .object({ draft: StudioBriefDraftSchema })
  .strict();
export type StudioBriefDraftPromotionReceiptResponse = z.output<
  typeof StudioBriefDraftPromotionReceiptResponseSchema
>;

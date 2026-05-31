import * as z from "zod";
import { StudioBriefDraftStatusSchema, StudioClaimSchema } from "./studio-schemas.js";

// Brief composer workspace contracts. Shapes mirror the D1 persistence layer in
// @bp/db (studio-brief-drafts.ts) without importing it — the domain package stays
// infra-free. The draft record is the parsed (not raw-JSON) projection consumers read.
// StudioBriefDraftStatus lives in studio-schemas.ts (also used by StudioBriefResponse).

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
    claims: z.array(StudioClaimSchema),
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

export const StudioBriefDraftPatchRequestSchema = z
  .object({
    title: z.string().optional(),
    dek: z.string().optional(),
    summary: z.string().optional(),
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

export const StudioBriefDraftClaimResponseSchema = z
  .object({ claim: StudioClaimSchema })
  .strict();
export type StudioBriefDraftClaimResponse = z.output<typeof StudioBriefDraftClaimResponseSchema>;

// --- Review / retract / publish ---

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

export const StudioBriefDraftReviewRequestSchema = z
  .object({ message: z.string() })
  .strict();
export type StudioBriefDraftReviewRequest = z.output<typeof StudioBriefDraftReviewRequestSchema>;

export const StudioBriefDraftReviewResponseSchema = z
  .object({ comment: StudioBriefDraftReviewCommentSchema })
  .strict();
export type StudioBriefDraftReviewResponse = z.output<
  typeof StudioBriefDraftReviewResponseSchema
>;

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

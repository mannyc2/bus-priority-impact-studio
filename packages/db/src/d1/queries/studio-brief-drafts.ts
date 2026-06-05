import { and, eq, type SQL, sql } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import {
  studioBriefDraft,
  studioBriefDraftBlock,
  studioBriefDraftClaim,
  studioBriefDraftRef,
  studioBriefHistoryEvent,
  studioBriefReviewComment,
  studioBriefWriteIdempotency,
} from "../schema.js";

const DraftStatusSchema = z.enum([
  "drafting",
  "draft",
  "in_review",
  "approved",
  "publish_candidate",
  "published",
  "archived",
  "retracted",
]);

const ClaimStateSchema = z.enum(["editing", "weak", "active"]);
const ReviewCommentKindSchema = z.enum(["comment", "change-requested", "suggested-edit"]);
const ReviewCommentStatusSchema = z.enum(["open", "resolved", "dismissed"]);
const GenerationJobStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
const GenerationModeSchema = z.enum(["deterministic_seed", "llm_assisted"]);
const LlmGenerationStatusSchema = z.enum([
  "not_configured",
  "pending",
  "running",
  "succeeded",
  "failed",
]);
const StringArrayJsonSchema = z.array(z.string());
const NumberArrayJsonSchema = z.array(z.number().int().positive());

const StudioBriefDraftRowSchema = z
  .object({
    brief_id: z.string(),
    route_slug: z.string(),
    workspace_id: z.string().nullable(),
    source_brief_id: z.string().nullable(),
    from_finding_id: z.string().nullable(),
    status: DraftStatusSchema,
    title: z.string(),
    dek: z.string(),
    summary: z.string(),
    body_md: z.string().nullable(),
    version: z.string(),
    job_id: z.string(),
    job_status: GenerationJobStatusSchema,
    job_generation_mode: GenerationModeSchema,
    job_llm_status: LlmGenerationStatusSchema,
    job_llm_provider: z.string().nullable(),
    job_llm_model: z.string().nullable(),
    job_started_at: z.string().nullable(),
    job_completed_at: z.string().nullable(),
    job_error: z.string().nullable(),
    validation_score: z.number().int().nullable(),
    validation_weak_claims_json: z.string().nullable(),
    validation_missing_evidence_json: z.string().nullable(),
    validation_blocking_issues_json: z.string().nullable(),
    last_validated_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    published_at: z.string().nullable(),
    promotion_candidate_id: z.string().nullable(),
    promotion_target_brief_id: z.string().nullable(),
    promotion_artifact_key: z.string().nullable(),
    promotion_artifact_sha256: z.string().nullable(),
    promotion_recorded_at: z.string().nullable(),
  })
  .strict();

const StudioBriefDraftClaimRowSchema = z
  .object({
    brief_id: z.string(),
    claim_n: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable(),
    strength: z.number().int(),
    evidence_ids_json: z.string(),
    caveat_ids_json: z.string(),
    state: ClaimStateSchema.nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

const StudioBriefDraftBlockRowSchema = z
  .object({
    brief_id: z.string(),
    block_id: z.string(),
    block_type: z.string(),
    block_json: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

const StudioBriefDraftRefRowSchema = z
  .object({
    brief_id: z.string(),
    ref_id: z.string(),
    ref_kind: z.string(),
    ref_json: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

const StudioBriefReviewCommentRowSchema = z
  .object({
    comment_id: z.string(),
    brief_id: z.string(),
    parent_comment_id: z.string().nullable(),
    reviewer: z.string(),
    reviewer_display_name: z.string().nullable(),
    message: z.string(),
    kind: ReviewCommentKindSchema,
    status: ReviewCommentStatusSchema,
    anchor_json: z.string().nullable(),
    suggestion_json: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    resolved_at: z.string().nullable(),
    resolved_by: z.string().nullable(),
  })
  .strict();

const StudioBriefHistoryEventRowSchema = z
  .object({
    event_id: z.string(),
    brief_id: z.string(),
    event_seq: z.number().int().positive(),
    action: z.string(),
    actor: z.string(),
    summary: z.string(),
    draft_version: z.string(),
    snapshot_json: z.string(),
    created_at: z.string(),
  })
  .strict();

const StudioBriefWriteIdempotencyRowSchema = z
  .object({
    idempotency_key: z.string(),
    method: z.string(),
    path: z.string(),
    status_code: z.number().int(),
    response_json: z.string(),
    created_at: z.string(),
  })
  .strict();

export type StudioBriefDraftStatus = z.output<typeof DraftStatusSchema>;
export type StudioBriefReviewCommentKind = z.output<typeof ReviewCommentKindSchema>;
export type StudioBriefReviewCommentStatus = z.output<typeof ReviewCommentStatusSchema>;
export type StudioBriefGenerationJobStatus = z.output<typeof GenerationJobStatusSchema>;
export type StudioBriefGenerationMode = z.output<typeof GenerationModeSchema>;
export type StudioBriefLlmGenerationStatus = z.output<typeof LlmGenerationStatusSchema>;
export type StudioBriefDraftRow = z.output<typeof StudioBriefDraftRowSchema>;
export type StudioBriefDraftClaimRow = z.output<typeof StudioBriefDraftClaimRowSchema>;
export type StudioBriefDraftBlockRow = z.output<typeof StudioBriefDraftBlockRowSchema>;
export type StudioBriefDraftRefRow = z.output<typeof StudioBriefDraftRefRowSchema>;
export type StudioBriefReviewCommentRow = z.output<typeof StudioBriefReviewCommentRowSchema>;
export type StudioBriefHistoryEventRow = z.output<typeof StudioBriefHistoryEventRowSchema>;
export type StudioBriefWriteIdempotencyRow = z.output<typeof StudioBriefWriteIdempotencyRowSchema>;

export type StudioBriefDraftRecord = {
  draft: StudioBriefDraftRow;
  claims: StudioBriefDraftClaimRow[];
  blocks: StudioBriefDraftBlockRow[];
  refs: StudioBriefDraftRefRow[];
  reviewComments: StudioBriefReviewCommentRow[];
};

type D1Value = string | number | boolean | null;

// Drizzle-parameterized legacy SQL for the few statements that are clearer as SQL fragments.
function legacySqlStatement(query: string, values: D1Value[]): SQL {
  const parts = query.split("?");
  if (parts.length !== values.length + 1) {
    throw new Error("SQL placeholder count does not match bound value count.");
  }
  let statement = sql.raw(parts[0] ?? "");
  for (let index = 0; index < values.length; index += 1) {
    statement = sql`${statement}${values[index]}${sql.raw(parts[index + 1] ?? "")}`;
  }
  return statement;
}

function parseJson<T>(value: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (value === null) return fallback;
  try {
    return schema.parse(JSON.parse(value));
  } catch {
    return fallback;
  }
}

export function parseDraftStringArray(value: string): string[] {
  return parseJson(value, StringArrayJsonSchema, []);
}

export function parseDraftNumberArray(value: string | null): number[] {
  return parseJson(value, NumberArrayJsonSchema, []);
}

async function first<TSchema extends z.ZodType>(
  db: D1ServingDb,
  query: string,
  schema: TSchema,
  values: D1Value[] = [],
): Promise<z.output<TSchema> | null> {
  const row = await db.get(legacySqlStatement(query, values));
  return row == null ? null : schema.parse(row);
}

async function run(db: D1ServingDb, query: string, values: D1Value[] = []): Promise<void> {
  await db.run(legacySqlStatement(query, values));
}

const draftSelection = {
  brief_id: studioBriefDraft.briefId,
  route_slug: studioBriefDraft.routeSlug,
  workspace_id: studioBriefDraft.workspaceId,
  source_brief_id: studioBriefDraft.sourceBriefId,
  from_finding_id: studioBriefDraft.fromFindingId,
  status: studioBriefDraft.status,
  title: studioBriefDraft.title,
  dek: studioBriefDraft.dek,
  summary: studioBriefDraft.summary,
  body_md: studioBriefDraft.bodyMd,
  version: studioBriefDraft.version,
  job_id: studioBriefDraft.jobId,
  job_status: studioBriefDraft.jobStatus,
  job_generation_mode: studioBriefDraft.jobGenerationMode,
  job_llm_status: studioBriefDraft.jobLlmStatus,
  job_llm_provider: studioBriefDraft.jobLlmProvider,
  job_llm_model: studioBriefDraft.jobLlmModel,
  job_started_at: studioBriefDraft.jobStartedAt,
  job_completed_at: studioBriefDraft.jobCompletedAt,
  job_error: studioBriefDraft.jobError,
  validation_score: studioBriefDraft.validationScore,
  validation_weak_claims_json: studioBriefDraft.validationWeakClaimsJson,
  validation_missing_evidence_json: studioBriefDraft.validationMissingEvidenceJson,
  validation_blocking_issues_json: studioBriefDraft.validationBlockingIssuesJson,
  last_validated_at: studioBriefDraft.lastValidatedAt,
  created_at: studioBriefDraft.createdAt,
  updated_at: studioBriefDraft.updatedAt,
  published_at: studioBriefDraft.publishedAt,
  promotion_candidate_id: studioBriefDraft.promotionCandidateId,
  promotion_target_brief_id: studioBriefDraft.promotionTargetBriefId,
  promotion_artifact_key: studioBriefDraft.promotionArtifactKey,
  promotion_artifact_sha256: studioBriefDraft.promotionArtifactSha256,
  promotion_recorded_at: studioBriefDraft.promotionRecordedAt,
};

const claimSelection = {
  brief_id: studioBriefDraftClaim.briefId,
  claim_n: studioBriefDraftClaim.claimN,
  title: studioBriefDraftClaim.title,
  body: studioBriefDraftClaim.body,
  strength: studioBriefDraftClaim.strength,
  evidence_ids_json: studioBriefDraftClaim.evidenceIdsJson,
  caveat_ids_json: studioBriefDraftClaim.caveatIdsJson,
  state: studioBriefDraftClaim.state,
  created_at: studioBriefDraftClaim.createdAt,
  updated_at: studioBriefDraftClaim.updatedAt,
};

const blockSelection = {
  brief_id: studioBriefDraftBlock.briefId,
  block_id: studioBriefDraftBlock.blockId,
  block_type: studioBriefDraftBlock.blockType,
  block_json: studioBriefDraftBlock.blockJson,
  created_at: studioBriefDraftBlock.createdAt,
  updated_at: studioBriefDraftBlock.updatedAt,
};

const refSelection = {
  brief_id: studioBriefDraftRef.briefId,
  ref_id: studioBriefDraftRef.refId,
  ref_kind: studioBriefDraftRef.refKind,
  ref_json: studioBriefDraftRef.refJson,
  created_at: studioBriefDraftRef.createdAt,
  updated_at: studioBriefDraftRef.updatedAt,
};

const reviewCommentSelection = {
  comment_id: studioBriefReviewComment.commentId,
  brief_id: studioBriefReviewComment.briefId,
  parent_comment_id: studioBriefReviewComment.parentCommentId,
  reviewer: studioBriefReviewComment.reviewer,
  reviewer_display_name: studioBriefReviewComment.reviewerDisplayName,
  message: studioBriefReviewComment.message,
  kind: studioBriefReviewComment.kind,
  status: studioBriefReviewComment.status,
  anchor_json: studioBriefReviewComment.anchorJson,
  suggestion_json: studioBriefReviewComment.suggestionJson,
  created_at: studioBriefReviewComment.createdAt,
  updated_at: sql<string>`coalesce(${studioBriefReviewComment.updatedAt}, ${studioBriefReviewComment.createdAt})`,
  resolved_at: studioBriefReviewComment.resolvedAt,
  resolved_by: studioBriefReviewComment.resolvedBy,
};

const idempotencySelection = {
  idempotency_key: studioBriefWriteIdempotency.idempotencyKey,
  method: studioBriefWriteIdempotency.method,
  path: studioBriefWriteIdempotency.path,
  status_code: studioBriefWriteIdempotency.statusCode,
  response_json: studioBriefWriteIdempotency.responseJson,
  created_at: studioBriefWriteIdempotency.createdAt,
};

export async function getStudioBriefWriteIdempotency(
  database: D1ServingDb,
  input: { idempotencyKey: string; method: string; path: string },
): Promise<StudioBriefWriteIdempotencyRow | null> {
  const [row] = await database
    .select(idempotencySelection)
    .from(studioBriefWriteIdempotency)
    .where(
      and(
        eq(studioBriefWriteIdempotency.idempotencyKey, input.idempotencyKey),
        eq(studioBriefWriteIdempotency.method, input.method),
        eq(studioBriefWriteIdempotency.path, input.path),
      ),
    )
    .limit(1);
  return row === undefined ? null : StudioBriefWriteIdempotencyRowSchema.parse(row);
}

export async function recordStudioBriefWriteIdempotency(
  database: D1ServingDb,
  input: {
    idempotencyKey: string;
    method: string;
    path: string;
    statusCode: number;
    responseJson: string;
    createdAt: string;
  },
): Promise<void> {
  await database
    .insert(studioBriefWriteIdempotency)
    .values({
      idempotencyKey: input.idempotencyKey,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      responseJson: input.responseJson,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing();
}

export async function getStudioBriefDraftRecord(
  database: D1ServingDb,
  briefId: string,
): Promise<StudioBriefDraftRecord | null> {
  const [draftRows, claimsRows, blocksRows, refsRows, reviewCommentRows] = await database.batch([
    database
      .select(draftSelection)
      .from(studioBriefDraft)
      .where(eq(studioBriefDraft.briefId, briefId))
      .limit(1),
    database
      .select(claimSelection)
      .from(studioBriefDraftClaim)
      .where(eq(studioBriefDraftClaim.briefId, briefId))
      .orderBy(studioBriefDraftClaim.claimN),
    database
      .select(blockSelection)
      .from(studioBriefDraftBlock)
      .where(eq(studioBriefDraftBlock.briefId, briefId))
      .orderBy(studioBriefDraftBlock.createdAt, studioBriefDraftBlock.blockId),
    database
      .select(refSelection)
      .from(studioBriefDraftRef)
      .where(eq(studioBriefDraftRef.briefId, briefId))
      .orderBy(studioBriefDraftRef.createdAt, studioBriefDraftRef.refId),
    database
      .select(reviewCommentSelection)
      .from(studioBriefReviewComment)
      .where(eq(studioBriefReviewComment.briefId, briefId))
      .orderBy(studioBriefReviewComment.createdAt),
  ]);
  const draft = draftRows[0] === undefined ? null : StudioBriefDraftRowSchema.parse(draftRows[0]);
  if (draft === null) return null;

  return {
    draft,
    claims: claimsRows.map((row) => StudioBriefDraftClaimRowSchema.parse(row)),
    blocks: blocksRows.map((row) => StudioBriefDraftBlockRowSchema.parse(row)),
    refs: refsRows.map((row) => StudioBriefDraftRefRowSchema.parse(row)),
    reviewComments: reviewCommentRows.map((row) => StudioBriefReviewCommentRowSchema.parse(row)),
  };
}

export async function getStudioBriefReviewComment(
  database: D1ServingDb,
  input: { briefId: string; commentId: string },
): Promise<StudioBriefReviewCommentRow | null> {
  const [row] = await database
    .select(reviewCommentSelection)
    .from(studioBriefReviewComment)
    .where(
      and(
        eq(studioBriefReviewComment.briefId, input.briefId),
        eq(studioBriefReviewComment.commentId, input.commentId),
      ),
    )
    .limit(1);
  return row === undefined ? null : StudioBriefReviewCommentRowSchema.parse(row);
}

export async function getStudioBriefDraftRecordByJobId(
  database: D1ServingDb,
  jobId: string,
): Promise<StudioBriefDraftRecord | null> {
  const [row] = await database
    .select({ brief_id: studioBriefDraft.briefId })
    .from(studioBriefDraft)
    .where(eq(studioBriefDraft.jobId, jobId))
    .limit(1);
  return row === undefined ? null : getStudioBriefDraftRecord(database, row.brief_id);
}

export async function listStudioBriefHistoryEvents(
  database: D1ServingDb,
  briefId: string,
): Promise<StudioBriefHistoryEventRow[]> {
  const rows = await database
    .select({
      event_id: studioBriefHistoryEvent.eventId,
      brief_id: studioBriefHistoryEvent.briefId,
      event_seq: studioBriefHistoryEvent.eventSeq,
      action: studioBriefHistoryEvent.action,
      actor: studioBriefHistoryEvent.actor,
      summary: studioBriefHistoryEvent.summary,
      draft_version: studioBriefHistoryEvent.draftVersion,
      snapshot_json: studioBriefHistoryEvent.snapshotJson,
      created_at: studioBriefHistoryEvent.createdAt,
    })
    .from(studioBriefHistoryEvent)
    .where(eq(studioBriefHistoryEvent.briefId, briefId))
    .orderBy(studioBriefHistoryEvent.eventSeq);
  return rows.map((row) => StudioBriefHistoryEventRowSchema.parse(row));
}

export async function insertStudioBriefHistoryEvent(
  database: D1ServingDb,
  input: {
    eventId: string;
    briefId: string;
    action: string;
    actor: string;
    summary: string;
    draftVersion: string;
    snapshotJson: string;
    createdAt: string;
  },
): Promise<void> {
  const nextSeq = await first(
    database,
    `select coalesce(max(event_seq), 0) + 1 as event_seq
       from studio_brief_history_event
      where brief_id = ?`,
    z.object({ event_seq: z.number().int().positive() }).strict(),
    [input.briefId],
  );
  await database.insert(studioBriefHistoryEvent).values({
    eventId: input.eventId,
    briefId: input.briefId,
    eventSeq: nextSeq?.event_seq ?? 1,
    action: input.action,
    actor: input.actor,
    summary: input.summary,
    draftVersion: input.draftVersion,
    snapshotJson: input.snapshotJson,
    createdAt: input.createdAt,
  });
}

export async function insertStudioBriefDraft(
  database: D1ServingDb,
  input: {
    briefId: string;
    routeSlug: string;
    sourceBriefId: string | null;
    workspaceId?: string | null;
    fromFindingId: string | null;
    status: StudioBriefDraftStatus;
    title: string;
    dek: string;
    summary: string;
    bodyMd?: string | null;
    version: string;
    jobId: string;
    jobStatus?: StudioBriefGenerationJobStatus;
    jobGenerationMode?: StudioBriefGenerationMode;
    jobLlmStatus?: StudioBriefLlmGenerationStatus;
    jobLlmProvider?: string | null;
    jobLlmModel?: string | null;
    jobStartedAt?: string | null;
    jobCompletedAt?: string | null;
    jobError?: string | null;
    createdAt: string;
    updatedAt: string;
  },
): Promise<void> {
  await database.insert(studioBriefDraft).values({
    briefId: input.briefId,
    routeSlug: input.routeSlug,
    workspaceId: input.workspaceId ?? null,
    sourceBriefId: input.sourceBriefId,
    fromFindingId: input.fromFindingId,
    status: input.status,
    title: input.title,
    dek: input.dek,
    summary: input.summary,
    bodyMd: input.bodyMd ?? null,
    version: input.version,
    jobId: input.jobId,
    jobStatus: input.jobStatus ?? "succeeded",
    jobGenerationMode: input.jobGenerationMode ?? "deterministic_seed",
    jobLlmStatus: input.jobLlmStatus ?? "not_configured",
    jobLlmProvider: input.jobLlmProvider ?? null,
    jobLlmModel: input.jobLlmModel ?? null,
    jobStartedAt: input.jobStartedAt ?? input.createdAt,
    jobCompletedAt: input.jobCompletedAt ?? input.updatedAt,
    jobError: input.jobError ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export async function updateStudioBriefDraftMetadata(
  database: D1ServingDb,
  input: {
    briefId: string;
    updatedAt: string;
    title?: string;
    dek?: string;
    summary?: string;
    bodyMd?: string | null;
    status?: "draft" | "in_review" | "approved" | "archived";
    version?: string;
  },
): Promise<void> {
  const values: Partial<typeof studioBriefDraft.$inferInsert> = { updatedAt: input.updatedAt };
  if (input.title !== undefined) {
    values.title = input.title;
  }
  if (input.dek !== undefined) {
    values.dek = input.dek;
  }
  if (input.summary !== undefined) {
    values.summary = input.summary;
  }
  if (input.bodyMd !== undefined) {
    values.bodyMd = input.bodyMd;
  }
  if (input.status !== undefined) {
    values.status = input.status;
  }
  if (input.version !== undefined) {
    values.version = input.version;
  }
  await database
    .update(studioBriefDraft)
    .set(values)
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

export async function updateStudioBriefDraftGeneration(
  database: D1ServingDb,
  input: {
    briefId: string;
    jobId: string;
    jobStatus: StudioBriefGenerationJobStatus;
    jobGenerationMode: StudioBriefGenerationMode;
    jobLlmStatus: StudioBriefLlmGenerationStatus;
    jobLlmProvider: string | null;
    jobLlmModel: string | null;
    jobStartedAt: string | null;
    jobCompletedAt: string | null;
    jobError: string | null;
    updatedAt: string;
    version: string;
    title: string;
    dek: string;
    summary: string;
  },
): Promise<void> {
  await database
    .update(studioBriefDraft)
    .set({
      status: "draft",
      title: input.title,
      dek: input.dek,
      summary: input.summary,
      version: input.version,
      jobId: input.jobId,
      jobStatus: input.jobStatus,
      jobGenerationMode: input.jobGenerationMode,
      jobLlmStatus: input.jobLlmStatus,
      jobLlmProvider: input.jobLlmProvider,
      jobLlmModel: input.jobLlmModel,
      jobStartedAt: input.jobStartedAt,
      jobCompletedAt: input.jobCompletedAt,
      jobError: input.jobError,
      validationScore: null,
      validationWeakClaimsJson: null,
      validationMissingEvidenceJson: null,
      validationBlockingIssuesJson: null,
      lastValidatedAt: null,
      updatedAt: input.updatedAt,
    })
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

export async function updateStudioBriefDraftJobStatus(
  database: D1ServingDb,
  input: {
    briefId: string;
    jobId: string;
    jobStatus: StudioBriefGenerationJobStatus;
    jobGenerationMode: StudioBriefGenerationMode;
    jobLlmStatus: StudioBriefLlmGenerationStatus;
    jobLlmProvider: string | null;
    jobLlmModel: string | null;
    jobStartedAt: string | null;
    jobCompletedAt: string | null;
    jobError: string | null;
    draftStatus?: StudioBriefDraftStatus;
    updatedAt: string;
  },
): Promise<void> {
  const values: Partial<typeof studioBriefDraft.$inferInsert> = {
    jobId: input.jobId,
    jobStatus: input.jobStatus,
    jobGenerationMode: input.jobGenerationMode,
    jobLlmStatus: input.jobLlmStatus,
    jobLlmProvider: input.jobLlmProvider,
    jobLlmModel: input.jobLlmModel,
    jobStartedAt: input.jobStartedAt,
    jobCompletedAt: input.jobCompletedAt,
    jobError: input.jobError,
    updatedAt: input.updatedAt,
  };
  if (input.draftStatus !== undefined) {
    values.status = input.draftStatus;
  }
  await database
    .update(studioBriefDraft)
    .set(values)
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

export async function insertStudioBriefDraftClaim(
  database: D1ServingDb,
  input: {
    briefId: string;
    claimN: number;
    title: string;
    body: string | null;
    strength: number;
    evidenceIds: string[];
    caveatIds: string[];
    state: "editing" | "weak" | "active" | null;
    createdAt: string;
    updatedAt: string;
  },
): Promise<void> {
  await database.insert(studioBriefDraftClaim).values({
    briefId: input.briefId,
    claimN: input.claimN,
    title: input.title,
    body: input.body,
    strength: input.strength,
    evidenceIdsJson: JSON.stringify(input.evidenceIds),
    caveatIdsJson: JSON.stringify(input.caveatIds),
    state: input.state,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export async function updateStudioBriefDraftClaim(
  database: D1ServingDb,
  input: {
    briefId: string;
    claimN: number;
    updatedAt: string;
    title?: string;
    body?: string | null;
    strength?: number;
    evidenceIds?: string[];
    caveatIds?: string[];
    state?: "editing" | "weak" | "active";
  },
): Promise<void> {
  const values: Partial<typeof studioBriefDraftClaim.$inferInsert> = { updatedAt: input.updatedAt };
  if (input.title !== undefined) {
    values.title = input.title;
  }
  if (input.body !== undefined) {
    values.body = input.body;
  }
  if (input.strength !== undefined) {
    values.strength = input.strength;
  }
  if (input.evidenceIds !== undefined) {
    values.evidenceIdsJson = JSON.stringify(input.evidenceIds);
  }
  if (input.caveatIds !== undefined) {
    values.caveatIdsJson = JSON.stringify(input.caveatIds);
  }
  if (input.state !== undefined) {
    values.state = input.state;
  }
  await database
    .update(studioBriefDraftClaim)
    .set(values)
    .where(
      and(
        eq(studioBriefDraftClaim.briefId, input.briefId),
        eq(studioBriefDraftClaim.claimN, input.claimN),
      ),
    );
}

export async function deleteStudioBriefDraftClaim(
  database: D1ServingDb,
  input: { briefId: string; claimN: number; updatedAt: string },
): Promise<void> {
  await database
    .delete(studioBriefDraftClaim)
    .where(
      and(
        eq(studioBriefDraftClaim.briefId, input.briefId),
        eq(studioBriefDraftClaim.claimN, input.claimN),
      ),
    );
  await run(
    database,
    `update studio_brief_draft_claim
        set claim_n = claim_n - 1, updated_at = ?
      where brief_id = ? and claim_n > ?`,
    [input.updatedAt, input.briefId, input.claimN],
  );
}

export async function deleteStudioBriefDraftClaims(
  database: D1ServingDb,
  input: { briefId: string },
): Promise<void> {
  await database
    .delete(studioBriefDraftClaim)
    .where(eq(studioBriefDraftClaim.briefId, input.briefId));
}

export async function replaceStudioBriefDraftClaims(
  database: D1ServingDb,
  input: {
    briefId: string;
    claims: Array<{
      claimN: number;
      title: string;
      body: string | null;
      strength: number;
      evidenceIds: string[];
      caveatIds: string[];
      state: "editing" | "weak" | "active" | null;
      createdAt: string;
      updatedAt: string;
    }>;
  },
): Promise<void> {
  await database.batch([
    database.delete(studioBriefDraftClaim).where(eq(studioBriefDraftClaim.briefId, input.briefId)),
    ...input.claims.map((claim) =>
      database.insert(studioBriefDraftClaim).values({
        briefId: input.briefId,
        claimN: claim.claimN,
        title: claim.title,
        body: claim.body,
        strength: claim.strength,
        evidenceIdsJson: JSON.stringify(claim.evidenceIds),
        caveatIdsJson: JSON.stringify(claim.caveatIds),
        state: claim.state,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt,
      }),
    ),
  ]);
}

export async function insertStudioBriefDraftBlock(
  database: D1ServingDb,
  input: {
    briefId: string;
    blockId: string;
    blockType: string;
    blockJson: string;
    createdAt: string;
    updatedAt: string;
  },
): Promise<void> {
  await database.insert(studioBriefDraftBlock).values({
    briefId: input.briefId,
    blockId: input.blockId,
    blockType: input.blockType,
    blockJson: input.blockJson,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export async function updateStudioBriefDraftBlock(
  database: D1ServingDb,
  input: {
    briefId: string;
    blockId: string;
    blockType: string;
    blockJson: string;
    updatedAt: string;
  },
): Promise<void> {
  await database
    .update(studioBriefDraftBlock)
    .set({
      blockType: input.blockType,
      blockJson: input.blockJson,
      updatedAt: input.updatedAt,
    })
    .where(
      and(
        eq(studioBriefDraftBlock.briefId, input.briefId),
        eq(studioBriefDraftBlock.blockId, input.blockId),
      ),
    );
}

export async function deleteStudioBriefDraftBlock(
  database: D1ServingDb,
  input: { briefId: string; blockId: string },
): Promise<void> {
  await database
    .delete(studioBriefDraftBlock)
    .where(
      and(
        eq(studioBriefDraftBlock.briefId, input.briefId),
        eq(studioBriefDraftBlock.blockId, input.blockId),
      ),
    );
}

export async function replaceStudioBriefDraftBlocks(
  database: D1ServingDb,
  input: {
    briefId: string;
    blocks: Array<{
      blockId: string;
      blockType: string;
      blockJson: string;
      createdAt: string;
      updatedAt: string;
    }>;
  },
): Promise<void> {
  await database.batch([
    database.delete(studioBriefDraftBlock).where(eq(studioBriefDraftBlock.briefId, input.briefId)),
    ...input.blocks.map((block) =>
      database.insert(studioBriefDraftBlock).values({
        briefId: input.briefId,
        blockId: block.blockId,
        blockType: block.blockType,
        blockJson: block.blockJson,
        createdAt: block.createdAt,
        updatedAt: block.updatedAt,
      }),
    ),
  ]);
}

export async function replaceStudioBriefDraftRefs(
  database: D1ServingDb,
  input: {
    briefId: string;
    refs: Array<{ refId: string; refKind: string; refJson: string }>;
    updatedAt: string;
  },
): Promise<void> {
  await database.batch([
    database.delete(studioBriefDraftRef).where(eq(studioBriefDraftRef.briefId, input.briefId)),
    ...input.refs.map((ref) =>
      database.insert(studioBriefDraftRef).values({
        briefId: input.briefId,
        refId: ref.refId,
        refKind: ref.refKind,
        refJson: ref.refJson,
        createdAt: input.updatedAt,
        updatedAt: input.updatedAt,
      }),
    ),
  ]);
}

export async function deleteStudioBriefDraftRefsForBlock(
  database: D1ServingDb,
  input: { briefId: string; blockId: string },
): Promise<void> {
  await run(
    database,
    `delete from studio_brief_draft_ref
      where brief_id = ?
        and ref_kind = 'block'
        and json_extract(ref_json, '$.blockId') = ?`,
    [input.briefId, input.blockId],
  );
}

export async function updateStudioBriefDraftValidation(
  database: D1ServingDb,
  input: {
    briefId: string;
    score: number;
    weakClaims: number[];
    missingEvidence: number[];
    blockingIssues: string[];
    validatedAt: string;
  },
): Promise<void> {
  await database
    .update(studioBriefDraft)
    .set({
      validationScore: input.score,
      validationWeakClaimsJson: JSON.stringify(input.weakClaims),
      validationMissingEvidenceJson: JSON.stringify(input.missingEvidence),
      validationBlockingIssuesJson: JSON.stringify(input.blockingIssues),
      lastValidatedAt: input.validatedAt,
      updatedAt: input.validatedAt,
    })
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

export async function recordStudioBriefPromotionReceipt(
  database: D1ServingDb,
  input: {
    briefId: string;
    candidateId: string;
    targetBriefId: string;
    artifactKey: string;
    artifactSha256: string;
    recordedAt: string;
  },
): Promise<void> {
  await database
    .update(studioBriefDraft)
    .set({
      status: "published",
      promotionCandidateId: input.candidateId,
      promotionTargetBriefId: input.targetBriefId,
      promotionArtifactKey: input.artifactKey,
      promotionArtifactSha256: input.artifactSha256,
      promotionRecordedAt: input.recordedAt,
      updatedAt: input.recordedAt,
    })
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

export async function insertStudioBriefReviewComment(
  database: D1ServingDb,
  input: {
    commentId: string;
    briefId: string;
    reviewer: string;
    reviewerDisplayName?: string | null;
    message: string;
    createdAt: string;
  },
): Promise<void> {
  await database.batch([
    database.insert(studioBriefReviewComment).values({
      commentId: input.commentId,
      briefId: input.briefId,
      parentCommentId: null,
      reviewer: input.reviewer,
      reviewerDisplayName: input.reviewerDisplayName ?? null,
      message: input.message,
      kind: "comment",
      status: "open",
      anchorJson: null,
      suggestionJson: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      resolvedAt: null,
      resolvedBy: null,
    }),
    database
      .update(studioBriefDraft)
      .set({ status: "in_review", updatedAt: input.createdAt })
      .where(eq(studioBriefDraft.briefId, input.briefId)),
  ]);
}

export async function insertStudioBriefReviewThread(
  database: D1ServingDb,
  input: {
    commentId: string;
    briefId: string;
    reviewer: string;
    reviewerDisplayName?: string | null;
    message: string;
    kind: StudioBriefReviewCommentKind;
    status?: StudioBriefReviewCommentStatus;
    anchorJson?: string | null;
    suggestionJson?: string | null;
    createdAt: string;
  },
): Promise<void> {
  await database.insert(studioBriefReviewComment).values({
    commentId: input.commentId,
    briefId: input.briefId,
    parentCommentId: null,
    reviewer: input.reviewer,
    reviewerDisplayName: input.reviewerDisplayName ?? null,
    message: input.message,
    kind: input.kind,
    status: input.status ?? "open",
    anchorJson: input.anchorJson ?? null,
    suggestionJson: input.suggestionJson ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    resolvedAt: null,
    resolvedBy: null,
  });
}

export async function insertStudioBriefReviewReply(
  database: D1ServingDb,
  input: {
    commentId: string;
    briefId: string;
    parentCommentId: string;
    reviewer: string;
    reviewerDisplayName?: string | null;
    message: string;
    createdAt: string;
  },
): Promise<void> {
  await database.insert(studioBriefReviewComment).values({
    commentId: input.commentId,
    briefId: input.briefId,
    parentCommentId: input.parentCommentId,
    reviewer: input.reviewer,
    reviewerDisplayName: input.reviewerDisplayName ?? null,
    message: input.message,
    kind: "comment",
    status: "open",
    anchorJson: null,
    suggestionJson: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    resolvedAt: null,
    resolvedBy: null,
  });
}

export async function updateStudioBriefReviewComment(
  database: D1ServingDb,
  input: {
    briefId: string;
    commentId: string;
    updatedAt: string;
    message?: string;
    status?: StudioBriefReviewCommentStatus;
    resolvedBy?: string | null;
  },
): Promise<void> {
  const values: Partial<typeof studioBriefReviewComment.$inferInsert> = {
    updatedAt: input.updatedAt,
  };
  if (input.message !== undefined) {
    values.message = input.message;
  }
  if (input.status !== undefined) {
    values.status = input.status;
    values.resolvedAt = input.status === "open" ? null : input.updatedAt;
    values.resolvedBy = input.status === "open" ? null : (input.resolvedBy ?? null);
  }
  await database
    .update(studioBriefReviewComment)
    .set(values)
    .where(
      and(
        eq(studioBriefReviewComment.briefId, input.briefId),
        eq(studioBriefReviewComment.commentId, input.commentId),
      ),
    );
}

export async function markStudioBriefDraftPublishCandidate(
  database: D1ServingDb,
  input: { briefId: string; publishedAt: string },
): Promise<void> {
  await database
    .update(studioBriefDraft)
    .set({
      status: "publish_candidate",
      publishedAt: input.publishedAt,
      updatedAt: input.publishedAt,
    })
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

export async function markStudioBriefDraftRetracted(
  database: D1ServingDb,
  input: { briefId: string; retractedAt: string },
): Promise<void> {
  await database
    .update(studioBriefDraft)
    .set({ status: "retracted", updatedAt: input.retractedAt })
    .where(eq(studioBriefDraft.briefId, input.briefId));
}

import type { D1Database } from "@cloudflare/workers-types";
import * as z from "zod";

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

const StudioBriefReviewCommentRowSchema = z
  .object({
    comment_id: z.string(),
    brief_id: z.string(),
    reviewer: z.string(),
    reviewer_display_name: z.string().nullable(),
    message: z.string(),
    created_at: z.string(),
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
export type StudioBriefGenerationJobStatus = z.output<typeof GenerationJobStatusSchema>;
export type StudioBriefGenerationMode = z.output<typeof GenerationModeSchema>;
export type StudioBriefLlmGenerationStatus = z.output<typeof LlmGenerationStatusSchema>;
export type StudioBriefDraftRow = z.output<typeof StudioBriefDraftRowSchema>;
export type StudioBriefDraftClaimRow = z.output<typeof StudioBriefDraftClaimRowSchema>;
export type StudioBriefReviewCommentRow = z.output<typeof StudioBriefReviewCommentRowSchema>;
export type StudioBriefHistoryEventRow = z.output<typeof StudioBriefHistoryEventRowSchema>;
export type StudioBriefWriteIdempotencyRow = z.output<typeof StudioBriefWriteIdempotencyRowSchema>;

export type StudioBriefDraftRecord = {
  draft: StudioBriefDraftRow;
  claims: StudioBriefDraftClaimRow[];
  reviewComments: StudioBriefReviewCommentRow[];
};

type D1Value = string | number | boolean | null;

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
  database: D1Database,
  query: string,
  schema: TSchema,
  values: D1Value[] = [],
): Promise<z.output<TSchema> | null> {
  const row = await database
    .prepare(query)
    .bind(...values)
    .first();
  return row === null ? null : schema.parse(row);
}

async function all<TSchema extends z.ZodType>(
  database: D1Database,
  query: string,
  schema: TSchema,
  values: D1Value[] = [],
): Promise<z.output<TSchema>[]> {
  const rows = await database
    .prepare(query)
    .bind(...values)
    .all();
  return rows.results.map((row) => schema.parse(row));
}

async function run(database: D1Database, query: string, values: D1Value[] = []): Promise<void> {
  await database
    .prepare(query)
    .bind(...values)
    .run();
}

export async function getStudioBriefWriteIdempotency(
  database: D1Database,
  input: { idempotencyKey: string; method: string; path: string },
): Promise<StudioBriefWriteIdempotencyRow | null> {
  return first(
    database,
    `select idempotency_key, method, path, status_code, response_json, created_at
       from studio_brief_write_idempotency
      where idempotency_key = ? and method = ? and path = ?`,
    StudioBriefWriteIdempotencyRowSchema,
    [input.idempotencyKey, input.method, input.path],
  );
}

export async function recordStudioBriefWriteIdempotency(
  database: D1Database,
  input: {
    idempotencyKey: string;
    method: string;
    path: string;
    statusCode: number;
    responseJson: string;
    createdAt: string;
  },
): Promise<void> {
  await run(
    database,
    `insert or ignore into studio_brief_write_idempotency
      (idempotency_key, method, path, status_code, response_json, created_at)
      values (?, ?, ?, ?, ?, ?)`,
    [
      input.idempotencyKey,
      input.method,
      input.path,
      input.statusCode,
      input.responseJson,
      input.createdAt,
    ],
  );
}

export async function getStudioBriefDraftRecord(
  database: D1Database,
  briefId: string,
): Promise<StudioBriefDraftRecord | null> {
  const draft = await first(
    database,
    `select brief_id, route_slug, workspace_id, source_brief_id, from_finding_id, status, title, dek, summary,
            version, job_id, job_status, job_generation_mode, job_llm_status, job_llm_provider,
            job_llm_model, job_started_at, job_completed_at, job_error,
            validation_score, validation_weak_claims_json,
            validation_missing_evidence_json, validation_blocking_issues_json, last_validated_at,
            created_at, updated_at, published_at
       from studio_brief_draft
      where brief_id = ?`,
    StudioBriefDraftRowSchema,
    [briefId],
  );
  if (draft === null) return null;

  const [claims, reviewComments] = await Promise.all([
    all(
      database,
      `select brief_id, claim_n, title, body, strength, evidence_ids_json, caveat_ids_json,
              state, created_at, updated_at
         from studio_brief_draft_claim
        where brief_id = ?
        order by claim_n asc`,
      StudioBriefDraftClaimRowSchema,
      [briefId],
    ),
    all(
      database,
      `select comment_id, brief_id, reviewer, reviewer_display_name, message, created_at
         from studio_brief_review_comment
        where brief_id = ?
        order by created_at asc`,
      StudioBriefReviewCommentRowSchema,
      [briefId],
    ),
  ]);

  return { draft, claims, reviewComments };
}

export async function getStudioBriefDraftRecordByJobId(
  database: D1Database,
  jobId: string,
): Promise<StudioBriefDraftRecord | null> {
  const row = await first(
    database,
    "select brief_id from studio_brief_draft where job_id = ?",
    z.object({ brief_id: z.string() }).strict(),
    [jobId],
  );
  return row === null ? null : getStudioBriefDraftRecord(database, row.brief_id);
}

export async function listStudioBriefHistoryEvents(
  database: D1Database,
  briefId: string,
): Promise<StudioBriefHistoryEventRow[]> {
  return all(
    database,
    `select event_id, brief_id, event_seq, action, actor, summary, draft_version, snapshot_json,
            created_at
       from studio_brief_history_event
      where brief_id = ?
      order by event_seq asc`,
    StudioBriefHistoryEventRowSchema,
    [briefId],
  );
}

export async function insertStudioBriefHistoryEvent(
  database: D1Database,
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
  await run(
    database,
    `insert into studio_brief_history_event
      (event_id, brief_id, event_seq, action, actor, summary, draft_version, snapshot_json,
       created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.eventId,
      input.briefId,
      nextSeq?.event_seq ?? 1,
      input.action,
      input.actor,
      input.summary,
      input.draftVersion,
      input.snapshotJson,
      input.createdAt,
    ],
  );
}

export async function insertStudioBriefDraft(
  database: D1Database,
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
  await run(
    database,
    `insert into studio_brief_draft
      (brief_id, route_slug, workspace_id, source_brief_id, from_finding_id, status, title, dek, summary,
       version, job_id, job_status, job_generation_mode, job_llm_status, job_llm_provider,
       job_llm_model, job_started_at, job_completed_at, job_error, created_at,
       updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.briefId,
      input.routeSlug,
      input.workspaceId ?? null,
      input.sourceBriefId,
      input.fromFindingId,
      input.status,
      input.title,
      input.dek,
      input.summary,
      input.version,
      input.jobId,
      input.jobStatus ?? "succeeded",
      input.jobGenerationMode ?? "deterministic_seed",
      input.jobLlmStatus ?? "not_configured",
      input.jobLlmProvider ?? null,
      input.jobLlmModel ?? null,
      input.jobStartedAt ?? input.createdAt,
      input.jobCompletedAt ?? input.updatedAt,
      input.jobError ?? null,
      input.createdAt,
      input.updatedAt,
    ],
  );
}

export async function updateStudioBriefDraftMetadata(
  database: D1Database,
  input: {
    briefId: string;
    updatedAt: string;
    title?: string;
    dek?: string;
    summary?: string;
    status?: "draft" | "in_review" | "approved" | "archived";
  },
): Promise<void> {
  const assignments: string[] = ["updated_at = ?"];
  const values: D1Value[] = [input.updatedAt];
  if (input.title !== undefined) {
    assignments.push("title = ?");
    values.push(input.title);
  }
  if (input.dek !== undefined) {
    assignments.push("dek = ?");
    values.push(input.dek);
  }
  if (input.summary !== undefined) {
    assignments.push("summary = ?");
    values.push(input.summary);
  }
  if (input.status !== undefined) {
    assignments.push("status = ?");
    values.push(input.status);
  }
  values.push(input.briefId);
  await run(
    database,
    `update studio_brief_draft set ${assignments.join(", ")} where brief_id = ?`,
    values,
  );
}

export async function updateStudioBriefDraftGeneration(
  database: D1Database,
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
  await run(
    database,
    `update studio_brief_draft
        set status = ?,
            title = ?,
            dek = ?,
            summary = ?,
            version = ?,
            job_id = ?,
            job_status = ?,
            job_generation_mode = ?,
            job_llm_status = ?,
            job_llm_provider = ?,
            job_llm_model = ?,
            job_started_at = ?,
            job_completed_at = ?,
            job_error = ?,
            validation_score = null,
            validation_weak_claims_json = null,
            validation_missing_evidence_json = null,
            validation_blocking_issues_json = null,
            last_validated_at = null,
            updated_at = ?
      where brief_id = ?`,
    [
      "draft",
      input.title,
      input.dek,
      input.summary,
      input.version,
      input.jobId,
      input.jobStatus,
      input.jobGenerationMode,
      input.jobLlmStatus,
      input.jobLlmProvider,
      input.jobLlmModel,
      input.jobStartedAt,
      input.jobCompletedAt,
      input.jobError,
      input.updatedAt,
      input.briefId,
    ],
  );
}

export async function updateStudioBriefDraftJobStatus(
  database: D1Database,
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
  const statusAssignment = input.draftStatus === undefined ? "" : "status = ?,";
  await run(
    database,
    `update studio_brief_draft
        set ${statusAssignment}
            job_id = ?,
            job_status = ?,
            job_generation_mode = ?,
            job_llm_status = ?,
            job_llm_provider = ?,
            job_llm_model = ?,
            job_started_at = ?,
            job_completed_at = ?,
            job_error = ?,
            updated_at = ?
      where brief_id = ?`,
    [
      ...(input.draftStatus === undefined ? [] : [input.draftStatus]),
      input.jobId,
      input.jobStatus,
      input.jobGenerationMode,
      input.jobLlmStatus,
      input.jobLlmProvider,
      input.jobLlmModel,
      input.jobStartedAt,
      input.jobCompletedAt,
      input.jobError,
      input.updatedAt,
      input.briefId,
    ],
  );
}

export async function insertStudioBriefDraftClaim(
  database: D1Database,
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
  await run(
    database,
    `insert into studio_brief_draft_claim
      (brief_id, claim_n, title, body, strength, evidence_ids_json, caveat_ids_json, state,
       created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.briefId,
      input.claimN,
      input.title,
      input.body,
      input.strength,
      JSON.stringify(input.evidenceIds),
      JSON.stringify(input.caveatIds),
      input.state,
      input.createdAt,
      input.updatedAt,
    ],
  );
}

export async function updateStudioBriefDraftClaim(
  database: D1Database,
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
  const assignments: string[] = ["updated_at = ?"];
  const values: D1Value[] = [input.updatedAt];
  if (input.title !== undefined) {
    assignments.push("title = ?");
    values.push(input.title);
  }
  if (input.body !== undefined) {
    assignments.push("body = ?");
    values.push(input.body);
  }
  if (input.strength !== undefined) {
    assignments.push("strength = ?");
    values.push(input.strength);
  }
  if (input.evidenceIds !== undefined) {
    assignments.push("evidence_ids_json = ?");
    values.push(JSON.stringify(input.evidenceIds));
  }
  if (input.caveatIds !== undefined) {
    assignments.push("caveat_ids_json = ?");
    values.push(JSON.stringify(input.caveatIds));
  }
  if (input.state !== undefined) {
    assignments.push("state = ?");
    values.push(input.state);
  }
  values.push(input.briefId, input.claimN);
  await run(
    database,
    `update studio_brief_draft_claim
        set ${assignments.join(", ")}
      where brief_id = ? and claim_n = ?`,
    values,
  );
}

export async function deleteStudioBriefDraftClaim(
  database: D1Database,
  input: { briefId: string; claimN: number; updatedAt: string },
): Promise<void> {
  await run(database, "delete from studio_brief_draft_claim where brief_id = ? and claim_n = ?", [
    input.briefId,
    input.claimN,
  ]);
  await run(
    database,
    `update studio_brief_draft_claim
        set claim_n = claim_n - 1, updated_at = ?
      where brief_id = ? and claim_n > ?`,
    [input.updatedAt, input.briefId, input.claimN],
  );
}

export async function deleteStudioBriefDraftClaims(
  database: D1Database,
  input: { briefId: string },
): Promise<void> {
  await run(database, "delete from studio_brief_draft_claim where brief_id = ?", [input.briefId]);
}

export async function updateStudioBriefDraftValidation(
  database: D1Database,
  input: {
    briefId: string;
    score: number;
    weakClaims: number[];
    missingEvidence: number[];
    blockingIssues: string[];
    validatedAt: string;
  },
): Promise<void> {
  await run(
    database,
    `update studio_brief_draft
        set validation_score = ?,
            validation_weak_claims_json = ?,
            validation_missing_evidence_json = ?,
            validation_blocking_issues_json = ?,
            last_validated_at = ?,
            updated_at = ?
      where brief_id = ?`,
    [
      input.score,
      JSON.stringify(input.weakClaims),
      JSON.stringify(input.missingEvidence),
      JSON.stringify(input.blockingIssues),
      input.validatedAt,
      input.validatedAt,
      input.briefId,
    ],
  );
}

export async function insertStudioBriefReviewComment(
  database: D1Database,
  input: {
    commentId: string;
    briefId: string;
    reviewer: string;
    reviewerDisplayName?: string | null;
    message: string;
    createdAt: string;
  },
): Promise<void> {
  await run(
    database,
    `insert into studio_brief_review_comment
      (comment_id, brief_id, reviewer, reviewer_display_name, message, created_at)
      values (?, ?, ?, ?, ?, ?)`,
    [
      input.commentId,
      input.briefId,
      input.reviewer,
      input.reviewerDisplayName ?? null,
      input.message,
      input.createdAt,
    ],
  );
  await run(
    database,
    "update studio_brief_draft set status = ?, updated_at = ? where brief_id = ?",
    ["in_review", input.createdAt, input.briefId],
  );
}

export async function markStudioBriefDraftPublishCandidate(
  database: D1Database,
  input: { briefId: string; publishedAt: string },
): Promise<void> {
  await run(
    database,
    "update studio_brief_draft set status = ?, published_at = ?, updated_at = ? where brief_id = ?",
    ["publish_candidate", input.publishedAt, input.publishedAt, input.briefId],
  );
}

export async function markStudioBriefDraftRetracted(
  database: D1Database,
  input: { briefId: string; retractedAt: string },
): Promise<void> {
  await run(
    database,
    "update studio_brief_draft set status = ?, updated_at = ? where brief_id = ?",
    ["retracted", input.retractedAt, input.briefId],
  );
}

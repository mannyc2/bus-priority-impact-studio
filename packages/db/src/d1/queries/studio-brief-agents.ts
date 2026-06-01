import type { D1Database } from "@cloudflare/workers-types";
import * as z from "zod";

const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "needs_approval",
  "failed",
  "cancelled",
  "superseded",
]);
const AgentRunIntentSchema = z.enum([
  "generate_brief",
  "revise_selection",
  "fix_validation_issue",
  "insert_from_corpus",
  "send_to_brief",
  "review_response",
  "freeform_edit",
]);
const AgentProposalStatusSchema = z.enum([
  "drafting",
  "proposed",
  "applying",
  "partially_applied",
  "applied",
  "rejected",
  "stale",
]);
const DraftVersionActorTypeSchema = z.enum(["human", "agent", "system"]);
const DraftVersionReasonSchema = z.enum([
  "draft_created",
  "manual_edit",
  "agent_proposal_applied",
  "suggestion_accepted",
  "publish_candidate",
  "promotion_receipt",
  "restored",
]);
const DraftVersionSnapshotStorageSchema = z.enum(["d1", "r2"]);

const StudioBriefAgentRunRowSchema = z
  .object({
    run_id: z.string(),
    brief_id: z.string(),
    workspace_id: z.string().nullable(),
    status: AgentRunStatusSchema,
    intent: AgentRunIntentSchema,
    base_version_id: z.string(),
    base_content_hash: z.string(),
    trigger_json: z.string(),
    actor_id: z.string(),
    actor_display_name: z.string().nullable(),
    model_provider: z.string().nullable(),
    model_id: z.string().nullable(),
    prompt_hash: z.string().nullable(),
    proposal_id: z.string().nullable(),
    error_code: z.string().nullable(),
    error_message: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
  })
  .strict();

const StudioBriefAgentProposalRowSchema = z
  .object({
    proposal_id: z.string(),
    run_id: z.string(),
    brief_id: z.string(),
    status: AgentProposalStatusSchema,
    base_version_id: z.string(),
    base_content_hash: z.string(),
    title: z.string(),
    summary: z.string(),
    operations_json: z.string(),
    validation_json: z.string().nullable(),
    preview_hash: z.string(),
    provenance_json: z.string(),
    accepted_operation_ids_json: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    applied_at: z.string().nullable(),
    rejected_at: z.string().nullable(),
  })
  .strict();

const StudioBriefDraftVersionSnapshotRowSchema = z
  .object({
    snapshot_key: z.string(),
    brief_id: z.string(),
    snapshot_json: z.string(),
    created_at: z.string(),
  })
  .strict();

const StudioBriefDraftVersionRowSchema = z
  .object({
    version_id: z.string(),
    brief_id: z.string(),
    parent_version_id: z.string().nullable(),
    content_hash: z.string(),
    actor_id: z.string(),
    actor_type: DraftVersionActorTypeSchema,
    reason: DraftVersionReasonSchema,
    source_run_id: z.string().nullable(),
    source_proposal_id: z.string().nullable(),
    validation_score: z.number().int().nullable(),
    snapshot_storage: DraftVersionSnapshotStorageSchema,
    snapshot_key: z.string(),
    snapshot_sha256: z.string(),
    created_at: z.string(),
  })
  .strict();

export type StudioBriefAgentRunStatus = z.output<typeof AgentRunStatusSchema>;
export type StudioBriefAgentRunIntent = z.output<typeof AgentRunIntentSchema>;
export type StudioBriefAgentProposalStatus = z.output<typeof AgentProposalStatusSchema>;
export type StudioBriefDraftVersionActorType = z.output<typeof DraftVersionActorTypeSchema>;
export type StudioBriefDraftVersionReason = z.output<typeof DraftVersionReasonSchema>;
export type StudioBriefDraftVersionSnapshotStorage = z.output<
  typeof DraftVersionSnapshotStorageSchema
>;
export type StudioBriefAgentRunRow = z.output<typeof StudioBriefAgentRunRowSchema>;
export type StudioBriefAgentProposalRow = z.output<typeof StudioBriefAgentProposalRowSchema>;
export type StudioBriefDraftVersionRow = z.output<typeof StudioBriefDraftVersionRowSchema>;
export type StudioBriefDraftVersionSnapshotRow = z.output<
  typeof StudioBriefDraftVersionSnapshotRowSchema
>;

type D1Value = string | number | boolean | null;

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

export async function insertStudioBriefAgentRun(
  database: D1Database,
  input: {
    runId: string;
    briefId: string;
    workspaceId: string | null;
    status: StudioBriefAgentRunStatus;
    intent: StudioBriefAgentRunIntent;
    baseVersionId: string;
    baseContentHash: string;
    triggerJson: string;
    actorId: string;
    actorDisplayName: string | null;
    modelProvider?: string | null;
    modelId?: string | null;
    promptHash?: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
  },
): Promise<void> {
  await run(
    database,
    `insert into studio_brief_agent_run
      (run_id, brief_id, workspace_id, status, intent, base_version_id, base_content_hash,
       trigger_json, actor_id, actor_display_name, model_provider, model_id, prompt_hash,
       proposal_id, error_code, error_message, created_at, updated_at, started_at, completed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.runId,
      input.briefId,
      input.workspaceId,
      input.status,
      input.intent,
      input.baseVersionId,
      input.baseContentHash,
      input.triggerJson,
      input.actorId,
      input.actorDisplayName,
      input.modelProvider ?? null,
      input.modelId ?? null,
      input.promptHash ?? null,
      null,
      null,
      null,
      input.createdAt,
      input.updatedAt,
      input.startedAt ?? null,
      input.completedAt ?? null,
    ],
  );
}

export async function getStudioBriefAgentRun(
  database: D1Database,
  input: { briefId: string; runId: string },
): Promise<StudioBriefAgentRunRow | null> {
  return first(
    database,
    `select run_id, brief_id, workspace_id, status, intent, base_version_id, base_content_hash,
            trigger_json, actor_id, actor_display_name, model_provider, model_id, prompt_hash,
            proposal_id, error_code, error_message, created_at, updated_at, started_at,
            completed_at
       from studio_brief_agent_run
      where brief_id = ? and run_id = ?`,
    StudioBriefAgentRunRowSchema,
    [input.briefId, input.runId],
  );
}

export async function updateStudioBriefAgentRunStatus(
  database: D1Database,
  input: {
    runId: string;
    briefId: string;
    status: StudioBriefAgentRunStatus;
    updatedAt: string;
    proposalId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  },
): Promise<void> {
  const assignments = ["status = ?", "updated_at = ?"];
  const values: D1Value[] = [input.status, input.updatedAt];
  if (input.proposalId !== undefined) {
    assignments.push("proposal_id = ?");
    values.push(input.proposalId);
  }
  if (input.errorCode !== undefined) {
    assignments.push("error_code = ?");
    values.push(input.errorCode);
  }
  if (input.errorMessage !== undefined) {
    assignments.push("error_message = ?");
    values.push(input.errorMessage);
  }
  if (input.startedAt !== undefined) {
    assignments.push("started_at = ?");
    values.push(input.startedAt);
  }
  if (input.completedAt !== undefined) {
    assignments.push("completed_at = ?");
    values.push(input.completedAt);
  }
  values.push(input.briefId, input.runId);
  await run(
    database,
    `update studio_brief_agent_run
        set ${assignments.join(", ")}
      where brief_id = ? and run_id = ?`,
    values,
  );
}

export async function insertStudioBriefAgentProposal(
  database: D1Database,
  input: {
    proposalId: string;
    runId: string;
    briefId: string;
    status: StudioBriefAgentProposalStatus;
    baseVersionId: string;
    baseContentHash: string;
    title: string;
    summary: string;
    operationsJson: string;
    validationJson: string | null;
    previewHash: string;
    provenanceJson: string;
    createdAt: string;
    updatedAt: string;
  },
): Promise<void> {
  await run(
    database,
    `insert into studio_brief_agent_proposal
      (proposal_id, run_id, brief_id, status, base_version_id, base_content_hash, title,
       summary, operations_json, validation_json, preview_hash, provenance_json,
       accepted_operation_ids_json, created_at, updated_at, applied_at, rejected_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.proposalId,
      input.runId,
      input.briefId,
      input.status,
      input.baseVersionId,
      input.baseContentHash,
      input.title,
      input.summary,
      input.operationsJson,
      input.validationJson,
      input.previewHash,
      input.provenanceJson,
      null,
      input.createdAt,
      input.updatedAt,
      null,
      null,
    ],
  );
}

export async function getStudioBriefAgentProposal(
  database: D1Database,
  input: { briefId: string; proposalId: string },
): Promise<StudioBriefAgentProposalRow | null> {
  return first(
    database,
    `select proposal_id, run_id, brief_id, status, base_version_id, base_content_hash,
            title, summary, operations_json, validation_json, preview_hash, provenance_json,
            accepted_operation_ids_json, created_at, updated_at, applied_at, rejected_at
       from studio_brief_agent_proposal
      where brief_id = ? and proposal_id = ?`,
    StudioBriefAgentProposalRowSchema,
    [input.briefId, input.proposalId],
  );
}

export async function listStudioBriefAgentProposals(
  database: D1Database,
  briefId: string,
): Promise<StudioBriefAgentProposalRow[]> {
  return all(
    database,
    `select proposal_id, run_id, brief_id, status, base_version_id, base_content_hash,
            title, summary, operations_json, validation_json, preview_hash, provenance_json,
            accepted_operation_ids_json, created_at, updated_at, applied_at, rejected_at
       from studio_brief_agent_proposal
      where brief_id = ?
      order by created_at desc, proposal_id desc`,
    StudioBriefAgentProposalRowSchema,
    [briefId],
  );
}

export async function updateStudioBriefAgentProposalStatus(
  database: D1Database,
  input: {
    proposalId: string;
    briefId: string;
    status: StudioBriefAgentProposalStatus;
    updatedAt: string;
    appliedAt?: string | null;
    rejectedAt?: string | null;
    acceptedOperationIds?: string[] | null;
  },
): Promise<void> {
  const assignments = ["status = ?", "updated_at = ?"];
  const values: D1Value[] = [input.status, input.updatedAt];
  if (input.appliedAt !== undefined) {
    assignments.push("applied_at = ?");
    values.push(input.appliedAt);
  }
  if (input.rejectedAt !== undefined) {
    assignments.push("rejected_at = ?");
    values.push(input.rejectedAt);
  }
  if (input.acceptedOperationIds !== undefined) {
    assignments.push("accepted_operation_ids_json = ?");
    values.push(
      input.acceptedOperationIds === null ? null : JSON.stringify(input.acceptedOperationIds),
    );
  }
  values.push(input.briefId, input.proposalId);
  await run(
    database,
    `update studio_brief_agent_proposal
        set ${assignments.join(", ")}
      where brief_id = ? and proposal_id = ?`,
    values,
  );
}

export async function insertStudioBriefDraftVersion(
  database: D1Database,
  input: {
    versionId: string;
    briefId: string;
    parentVersionId: string | null;
    contentHash: string;
    actorId: string;
    actorType: StudioBriefDraftVersionActorType;
    reason: StudioBriefDraftVersionReason;
    sourceRunId?: string | null;
    sourceProposalId?: string | null;
    validationScore?: number | null;
    snapshotStorage: StudioBriefDraftVersionSnapshotStorage;
    snapshotKey: string;
    snapshotSha256: string;
    createdAt: string;
  },
): Promise<void> {
  await run(
    database,
    `insert into studio_brief_draft_version
      (version_id, brief_id, parent_version_id, content_hash, actor_id, actor_type, reason,
       source_run_id, source_proposal_id, validation_score, snapshot_storage, snapshot_key,
       snapshot_sha256, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.versionId,
      input.briefId,
      input.parentVersionId,
      input.contentHash,
      input.actorId,
      input.actorType,
      input.reason,
      input.sourceRunId ?? null,
      input.sourceProposalId ?? null,
      input.validationScore ?? null,
      input.snapshotStorage,
      input.snapshotKey,
      input.snapshotSha256,
      input.createdAt,
    ],
  );
}

export async function getStudioBriefDraftVersion(
  database: D1Database,
  input: { briefId: string; versionId: string },
): Promise<StudioBriefDraftVersionRow | null> {
  return first(
    database,
    `select version_id, brief_id, parent_version_id, content_hash, actor_id, actor_type,
            reason, source_run_id, source_proposal_id, validation_score, snapshot_storage,
            snapshot_key, snapshot_sha256, created_at
       from studio_brief_draft_version
      where brief_id = ? and version_id = ?`,
    StudioBriefDraftVersionRowSchema,
    [input.briefId, input.versionId],
  );
}

export async function listStudioBriefDraftVersions(
  database: D1Database,
  briefId: string,
): Promise<StudioBriefDraftVersionRow[]> {
  return all(
    database,
    `select version_id, brief_id, parent_version_id, content_hash, actor_id, actor_type,
            reason, source_run_id, source_proposal_id, validation_score, snapshot_storage,
            snapshot_key, snapshot_sha256, created_at
       from studio_brief_draft_version
      where brief_id = ?
      order by created_at desc, version_id desc`,
    StudioBriefDraftVersionRowSchema,
    [briefId],
  );
}

export async function insertStudioBriefDraftVersionSnapshot(
  database: D1Database,
  input: {
    snapshotKey: string;
    briefId: string;
    snapshotJson: string;
    createdAt: string;
  },
): Promise<void> {
  await run(
    database,
    `insert into studio_brief_draft_version_snapshot
      (snapshot_key, brief_id, snapshot_json, created_at)
      values (?, ?, ?, ?)`,
    [input.snapshotKey, input.briefId, input.snapshotJson, input.createdAt],
  );
}

export async function getStudioBriefDraftVersionSnapshot(
  database: D1Database,
  input: { snapshotKey: string; briefId: string },
): Promise<StudioBriefDraftVersionSnapshotRow | null> {
  return first(
    database,
    `select snapshot_key, brief_id, snapshot_json, created_at
       from studio_brief_draft_version_snapshot
      where snapshot_key = ? and brief_id = ?`,
    StudioBriefDraftVersionSnapshotRowSchema,
    [input.snapshotKey, input.briefId],
  );
}

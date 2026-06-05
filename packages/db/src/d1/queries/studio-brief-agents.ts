import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import {
  studioBriefAgentProposal,
  studioBriefAgentRun,
  studioBriefDraftVersion,
  studioBriefDraftVersionSnapshot,
} from "../schema.js";

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

const agentRunSelection = {
  run_id: studioBriefAgentRun.runId,
  brief_id: studioBriefAgentRun.briefId,
  workspace_id: studioBriefAgentRun.workspaceId,
  status: studioBriefAgentRun.status,
  intent: studioBriefAgentRun.intent,
  base_version_id: studioBriefAgentRun.baseVersionId,
  base_content_hash: studioBriefAgentRun.baseContentHash,
  trigger_json: studioBriefAgentRun.triggerJson,
  actor_id: studioBriefAgentRun.actorId,
  actor_display_name: studioBriefAgentRun.actorDisplayName,
  model_provider: studioBriefAgentRun.modelProvider,
  model_id: studioBriefAgentRun.modelId,
  prompt_hash: studioBriefAgentRun.promptHash,
  proposal_id: studioBriefAgentRun.proposalId,
  error_code: studioBriefAgentRun.errorCode,
  error_message: studioBriefAgentRun.errorMessage,
  created_at: studioBriefAgentRun.createdAt,
  updated_at: studioBriefAgentRun.updatedAt,
  started_at: studioBriefAgentRun.startedAt,
  completed_at: studioBriefAgentRun.completedAt,
} as const;

const agentProposalSelection = {
  proposal_id: studioBriefAgentProposal.proposalId,
  run_id: studioBriefAgentProposal.runId,
  brief_id: studioBriefAgentProposal.briefId,
  status: studioBriefAgentProposal.status,
  base_version_id: studioBriefAgentProposal.baseVersionId,
  base_content_hash: studioBriefAgentProposal.baseContentHash,
  title: studioBriefAgentProposal.title,
  summary: studioBriefAgentProposal.summary,
  operations_json: studioBriefAgentProposal.operationsJson,
  validation_json: studioBriefAgentProposal.validationJson,
  preview_hash: studioBriefAgentProposal.previewHash,
  provenance_json: studioBriefAgentProposal.provenanceJson,
  accepted_operation_ids_json: studioBriefAgentProposal.acceptedOperationIdsJson,
  created_at: studioBriefAgentProposal.createdAt,
  updated_at: studioBriefAgentProposal.updatedAt,
  applied_at: studioBriefAgentProposal.appliedAt,
  rejected_at: studioBriefAgentProposal.rejectedAt,
} as const;

const draftVersionSelection = {
  version_id: studioBriefDraftVersion.versionId,
  brief_id: studioBriefDraftVersion.briefId,
  parent_version_id: studioBriefDraftVersion.parentVersionId,
  content_hash: studioBriefDraftVersion.contentHash,
  actor_id: studioBriefDraftVersion.actorId,
  actor_type: studioBriefDraftVersion.actorType,
  reason: studioBriefDraftVersion.reason,
  source_run_id: studioBriefDraftVersion.sourceRunId,
  source_proposal_id: studioBriefDraftVersion.sourceProposalId,
  validation_score: studioBriefDraftVersion.validationScore,
  snapshot_storage: studioBriefDraftVersion.snapshotStorage,
  snapshot_key: studioBriefDraftVersion.snapshotKey,
  snapshot_sha256: studioBriefDraftVersion.snapshotSha256,
  created_at: studioBriefDraftVersion.createdAt,
} as const;

const draftVersionSnapshotSelection = {
  snapshot_key: studioBriefDraftVersionSnapshot.snapshotKey,
  brief_id: studioBriefDraftVersionSnapshot.briefId,
  snapshot_json: studioBriefDraftVersionSnapshot.snapshotJson,
  created_at: studioBriefDraftVersionSnapshot.createdAt,
} as const;

export async function insertStudioBriefAgentRun(
  db: D1ServingDb,
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
  await db.insert(studioBriefAgentRun).values({
    runId: input.runId,
    briefId: input.briefId,
    workspaceId: input.workspaceId,
    status: input.status,
    intent: input.intent,
    baseVersionId: input.baseVersionId,
    baseContentHash: input.baseContentHash,
    triggerJson: input.triggerJson,
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName,
    modelProvider: input.modelProvider ?? null,
    modelId: input.modelId ?? null,
    promptHash: input.promptHash ?? null,
    proposalId: null,
    errorCode: null,
    errorMessage: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
  });
}

export async function getStudioBriefAgentRun(
  db: D1ServingDb,
  input: { briefId: string; runId: string },
): Promise<StudioBriefAgentRunRow | null> {
  const [row] = await db
    .select(agentRunSelection)
    .from(studioBriefAgentRun)
    .where(
      and(
        eq(studioBriefAgentRun.briefId, input.briefId),
        eq(studioBriefAgentRun.runId, input.runId),
      ),
    )
    .limit(1);
  return row === undefined ? null : StudioBriefAgentRunRowSchema.parse(row);
}

export async function updateStudioBriefAgentRunStatus(
  db: D1ServingDb,
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
  const values: Partial<typeof studioBriefAgentRun.$inferInsert> = {
    status: input.status,
    updatedAt: input.updatedAt,
  };
  if (input.proposalId !== undefined) {
    values.proposalId = input.proposalId;
  }
  if (input.errorCode !== undefined) {
    values.errorCode = input.errorCode;
  }
  if (input.errorMessage !== undefined) {
    values.errorMessage = input.errorMessage;
  }
  if (input.startedAt !== undefined) {
    values.startedAt = input.startedAt;
  }
  if (input.completedAt !== undefined) {
    values.completedAt = input.completedAt;
  }
  await db
    .update(studioBriefAgentRun)
    .set(values)
    .where(
      and(
        eq(studioBriefAgentRun.briefId, input.briefId),
        eq(studioBriefAgentRun.runId, input.runId),
      ),
    );
}

export async function insertStudioBriefAgentProposal(
  db: D1ServingDb,
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
  await db.insert(studioBriefAgentProposal).values({
    proposalId: input.proposalId,
    runId: input.runId,
    briefId: input.briefId,
    status: input.status,
    baseVersionId: input.baseVersionId,
    baseContentHash: input.baseContentHash,
    title: input.title,
    summary: input.summary,
    operationsJson: input.operationsJson,
    validationJson: input.validationJson,
    previewHash: input.previewHash,
    provenanceJson: input.provenanceJson,
    acceptedOperationIdsJson: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    appliedAt: null,
    rejectedAt: null,
  });
}

export async function getStudioBriefAgentProposal(
  db: D1ServingDb,
  input: { briefId: string; proposalId: string },
): Promise<StudioBriefAgentProposalRow | null> {
  const [row] = await db
    .select(agentProposalSelection)
    .from(studioBriefAgentProposal)
    .where(
      and(
        eq(studioBriefAgentProposal.briefId, input.briefId),
        eq(studioBriefAgentProposal.proposalId, input.proposalId),
      ),
    )
    .limit(1);
  return row === undefined ? null : StudioBriefAgentProposalRowSchema.parse(row);
}

export async function listStudioBriefAgentProposals(
  db: D1ServingDb,
  briefId: string,
): Promise<StudioBriefAgentProposalRow[]> {
  const rows = await db
    .select(agentProposalSelection)
    .from(studioBriefAgentProposal)
    .where(eq(studioBriefAgentProposal.briefId, briefId))
    .orderBy(desc(studioBriefAgentProposal.createdAt), desc(studioBriefAgentProposal.proposalId));
  return rows.map((row) => StudioBriefAgentProposalRowSchema.parse(row));
}

export async function updateStudioBriefAgentProposalStatus(
  db: D1ServingDb,
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
  const values: Partial<typeof studioBriefAgentProposal.$inferInsert> = {
    status: input.status,
    updatedAt: input.updatedAt,
  };
  if (input.appliedAt !== undefined) {
    values.appliedAt = input.appliedAt;
  }
  if (input.rejectedAt !== undefined) {
    values.rejectedAt = input.rejectedAt;
  }
  if (input.acceptedOperationIds !== undefined) {
    values.acceptedOperationIdsJson =
      input.acceptedOperationIds === null ? null : JSON.stringify(input.acceptedOperationIds);
  }
  await db
    .update(studioBriefAgentProposal)
    .set(values)
    .where(
      and(
        eq(studioBriefAgentProposal.briefId, input.briefId),
        eq(studioBriefAgentProposal.proposalId, input.proposalId),
      ),
    );
}

export async function insertStudioBriefDraftVersion(
  db: D1ServingDb,
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
  await db.insert(studioBriefDraftVersion).values({
    versionId: input.versionId,
    briefId: input.briefId,
    parentVersionId: input.parentVersionId,
    contentHash: input.contentHash,
    actorId: input.actorId,
    actorType: input.actorType,
    reason: input.reason,
    sourceRunId: input.sourceRunId ?? null,
    sourceProposalId: input.sourceProposalId ?? null,
    validationScore: input.validationScore ?? null,
    snapshotStorage: input.snapshotStorage,
    snapshotKey: input.snapshotKey,
    snapshotSha256: input.snapshotSha256,
    createdAt: input.createdAt,
  });
}

export async function getStudioBriefDraftVersion(
  db: D1ServingDb,
  input: { briefId: string; versionId: string },
): Promise<StudioBriefDraftVersionRow | null> {
  const [row] = await db
    .select(draftVersionSelection)
    .from(studioBriefDraftVersion)
    .where(
      and(
        eq(studioBriefDraftVersion.briefId, input.briefId),
        eq(studioBriefDraftVersion.versionId, input.versionId),
      ),
    )
    .limit(1);
  return row === undefined ? null : StudioBriefDraftVersionRowSchema.parse(row);
}

export async function listStudioBriefDraftVersions(
  db: D1ServingDb,
  briefId: string,
): Promise<StudioBriefDraftVersionRow[]> {
  const rows = await db
    .select(draftVersionSelection)
    .from(studioBriefDraftVersion)
    .where(eq(studioBriefDraftVersion.briefId, briefId))
    .orderBy(desc(studioBriefDraftVersion.createdAt), desc(studioBriefDraftVersion.versionId));
  return rows.map((row) => StudioBriefDraftVersionRowSchema.parse(row));
}

export async function insertStudioBriefDraftVersionSnapshot(
  db: D1ServingDb,
  input: {
    snapshotKey: string;
    briefId: string;
    snapshotJson: string;
    createdAt: string;
  },
): Promise<void> {
  await db.insert(studioBriefDraftVersionSnapshot).values({
    snapshotKey: input.snapshotKey,
    briefId: input.briefId,
    snapshotJson: input.snapshotJson,
    createdAt: input.createdAt,
  });
}

export async function getStudioBriefDraftVersionSnapshot(
  db: D1ServingDb,
  input: { snapshotKey: string; briefId: string },
): Promise<StudioBriefDraftVersionSnapshotRow | null> {
  const [row] = await db
    .select(draftVersionSnapshotSelection)
    .from(studioBriefDraftVersionSnapshot)
    .where(
      and(
        eq(studioBriefDraftVersionSnapshot.snapshotKey, input.snapshotKey),
        eq(studioBriefDraftVersionSnapshot.briefId, input.briefId),
      ),
    )
    .limit(1);
  return row === undefined ? null : StudioBriefDraftVersionSnapshotRowSchema.parse(row);
}

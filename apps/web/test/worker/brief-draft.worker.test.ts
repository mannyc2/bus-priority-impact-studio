import {
  buildStudioBriefProjection,
  buildStudioBriefsProjection,
  buildStudioFindingProjection,
  buildStudioFindingsProjection,
  buildStudioRouteProjection,
  buildStudioRoutesProjection,
  StudioBriefAgentProposalApplyResponseSchema,
  StudioBriefAgentProposalResponseSchema,
  StudioBriefAgentProposalRejectResponseSchema,
  StudioBriefAgentProposeEditResultSchema,
  StudioBriefAgentRunResponseSchema,
  StudioBriefCreateResponseSchema,
  StudioBriefDraftAttachResponseSchema,
  StudioBriefDraftBlockResponseSchema,
  StudioBriefDraftCommentResponseSchema,
  StudioBriefDraftCommentsResponseSchema,
  StudioBriefDraftPromotionReceiptResponseSchema,
  StudioBriefDraftRefsResolveResponseSchema,
  StudioBriefDraftRefsResponseSchema,
  StudioBriefDraftVersionRestoreResponseSchema,
  StudioBriefPublishCandidateExportResponseSchema,
  StudioBriefResponseSchema,
} from "@bp/domain";
import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { studioReleaseSeed } from "../../src/studio/sample-data.js";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";

type Row = {
  active?: unknown;
  action?: unknown;
  accepted_operation_ids_json?: unknown;
  block_id?: unknown;
  block_json?: unknown;
  block_type?: unknown;
  body?: unknown;
  body_md?: unknown;
  brief_id?: unknown;
  caveat_ids_json?: unknown;
  claim_n?: unknown;
  comment_id?: unknown;
  consumed_at?: unknown;
  created_at?: unknown;
  dek?: unknown;
  display_name?: unknown;
  email?: unknown;
  event_seq?: unknown;
  evidence_ids_json?: unknown;
  applied_at?: unknown;
  completed_at?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  expires_at?: unknown;
  idempotency_key?: unknown;
  identity_id?: unknown;
  job_completed_at?: unknown;
  job_error?: unknown;
  job_generation_mode?: unknown;
  job_llm_status?: unknown;
  job_llm_model?: unknown;
  job_llm_provider?: unknown;
  job_started_at?: unknown;
  job_id?: unknown;
  job_status?: unknown;
  kind?: unknown;
  last_used_at?: unknown;
  last_validated_at?: unknown;
  method?: unknown;
  message?: unknown;
  model_provider?: unknown;
  path?: unknown;
  parent_comment_id?: unknown;
  prompt_hash?: unknown;
  proposal_id?: unknown;
  published_at?: unknown;
  promotion_artifact_key?: unknown;
  promotion_artifact_sha256?: unknown;
  promotion_candidate_id?: unknown;
  promotion_recorded_at?: unknown;
  promotion_target_brief_id?: unknown;
  response_json?: unknown;
  ref_id?: unknown;
  ref_json?: unknown;
  ref_kind?: unknown;
  rejected_at?: unknown;
  revoked_at?: unknown;
  resolved_at?: unknown;
  resolved_by?: unknown;
  role_id?: unknown;
  run_id?: unknown;
  scopes_json?: unknown;
  session_id?: unknown;
  suggestion_json?: unknown;
  anchor_json?: unknown;
  state?: unknown;
  status?: unknown;
  status_code?: unknown;
  started_at?: unknown;
  strength?: unknown;
  summary?: unknown;
  title?: unknown;
  token_hash?: unknown;
  updated_at?: unknown;
  validation_blocking_issues_json?: unknown;
  validation_missing_evidence_json?: unknown;
  validation_score?: unknown;
  validation_weak_claims_json?: unknown;
  version?: unknown;
  version_id?: unknown;
  snapshot_key?: unknown;
  workspace_id?: unknown;
  [key: string]: unknown;
};

class FakeR2Object {
  readonly httpEtag = '"test-etag"';
  readonly body: ReadableStream<Uint8Array>;

  constructor(private readonly value: string) {
    this.body = new Response(value).body ?? new ReadableStream<Uint8Array>();
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.value) as unknown;
  }

  writeHttpMetadata(headers: Headers): void {
    headers.set("Content-Type", "application/json");
  }
}

class FakeR2Bucket {
  constructor(private readonly objects: Record<string, FakeR2Object>) {}

  async get(key: string): Promise<FakeR2Object | null> {
    return this.objects[key] ?? null;
  }
}

type FakeBriefAuthorGenerateInput = {
  briefId: string;
  runId: string;
  jobId: string;
  requestedAt: string;
};

class FakeBriefAuthorAgentNamespace {
  readonly starts: Array<FakeBriefAuthorGenerateInput & { name: string }> = [];

  constructor(private readonly options: { fail?: boolean } = {}) {}

  getByName(name: string): {
    submitGenerateJob: (input: FakeBriefAuthorGenerateInput) => Promise<void>;
  } {
    return {
      submitGenerateJob: async (input) => {
        if (this.options.fail === true) {
          throw new Error("fake agent failed to start");
        }
        this.starts.push({ ...input, name });
      },
    };
  }
}

class FakeStudioDraftDb {
  identity: Row[] = [];
  session: Row[] = [];
  role: Row[] = [];
  draft: Row[] = [];
  claim: Row[] = [];
  block: Row[] = [];
  ref: Row[] = [];
  reviewComment: Row[] = [];
  agentRun: Row[] = [];
  proposal: Row[] = [];
  version: Row[] = [];
  versionSnapshot: Row[] = [];
  history: Row[] = [];
  idempotency: Row[] = [];

  prepare(query: string) {
    const normalized = query.toLowerCase();
    const captureSelf = this;
    let bound: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        bound = values;
        return this;
      },
      async first() {
        const rows = captureSelf.rowsForQuery(normalized, bound);
        return rows[0] ?? null;
      },
      async all() {
        return { results: captureSelf.rowsForQuery(normalized, bound) };
      },
      async run() {
        return { meta: captureSelf.runQuery(normalized, bound) };
      },
    };
  }

  private rowsForQuery(normalized: string, bound: unknown[]): Row[] {
    if (normalized.includes("from identity_session s") && normalized.includes("join identity i")) {
      const tokenHash = bound[0] as string;
      const nowStr = bound[1] as string;
      const session = this.session.find(
        (row) =>
          row.token_hash === tokenHash &&
          row.revoked_at === null &&
          row.consumed_at === null &&
          (row.kind === "session" || row.kind === "legacy_bearer") &&
          (row.expires_at === null || (row.expires_at as string) > nowStr),
      );
      if (session === undefined) return [];
      const identity = this.identity.find((row) => row.identity_id === session.identity_id);
      if (identity === undefined || identity.active !== 1) return [];
      return [
        {
          session_id: session.session_id,
          identity_id: identity.identity_id,
          kind: session.kind,
          email: identity.email,
          display_name: identity.display_name,
          identity_active: identity.active,
        },
      ];
    }
    if (normalized.includes("from studio_actor_role")) {
      const identityId = bound[0] as string;
      const role = this.role.find((row) => row.identity_id === identityId && row.active === 1);
      return role === undefined
        ? []
        : [
            {
              role_id: role.role_id,
              identity_id: role.identity_id,
              workspace_id: role.workspace_id,
              scopes_json: role.scopes_json,
            },
          ];
    }
    if (normalized.includes("from studio_brief_write_idempotency")) {
      const [idempotencyKey, method, path] = bound as string[];
      const row = this.idempotency.find(
        (entry) =>
          entry.idempotency_key === idempotencyKey &&
          entry.method === method &&
          entry.path === path,
      );
      return row === undefined ? [] : [row];
    }
    if (normalized.includes("from studio_brief_draft_claim")) {
      const briefId = bound[0] as string;
      return this.claim
        .filter((row) => row.brief_id === briefId)
        .sort((left, right) => (left.claim_n as number) - (right.claim_n as number));
    }
    if (normalized.includes("from studio_brief_draft_block")) {
      const briefId = bound[0] as string;
      return this.block
        .filter((row) => row.brief_id === briefId)
        .sort((left, right) => String(left.block_id).localeCompare(String(right.block_id)));
    }
    if (normalized.includes("from studio_brief_draft_ref")) {
      const briefId = bound[0] as string;
      return this.ref
        .filter((row) => row.brief_id === briefId)
        .sort((left, right) => String(left.ref_id).localeCompare(String(right.ref_id)));
    }
    if (normalized.includes("from studio_brief_review_comment")) {
      const briefId = bound[0] as string;
      const commentId = bound[1] as string | undefined;
      return this.reviewComment
        .filter(
          (row) =>
            row.brief_id === briefId && (commentId === undefined || row.comment_id === commentId),
        )
        .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
    }
    if (normalized.includes("from studio_brief_history_event")) {
      const briefId = bound[0] as string;
      if (normalized.includes("coalesce(max(event_seq)")) {
        const maxSeq = Math.max(
          0,
          ...this.history
            .filter((row) => row.brief_id === briefId)
            .map((row) => row.event_seq as number),
        );
        return [{ event_seq: maxSeq + 1 }];
      }
      return this.history
        .filter((row) => row.brief_id === briefId)
        .sort((left, right) => (left.event_seq as number) - (right.event_seq as number));
    }
    if (normalized.includes("from studio_brief_agent_run")) {
      const briefId = bound[0] as string;
      const runId = bound[1] as string;
      return this.agentRun.filter((row) => row.brief_id === briefId && row.run_id === runId);
    }
    if (normalized.includes("from studio_brief_agent_proposal")) {
      const briefId = bound[0] as string;
      const proposalId = bound[1] as string | undefined;
      return this.proposal
        .filter(
          (row) =>
            row.brief_id === briefId &&
            (proposalId === undefined || row.proposal_id === proposalId),
        )
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    }
    if (normalized.includes("from studio_brief_draft_version_snapshot")) {
      const snapshotKey = bound[0] as string;
      const briefId = bound[1] as string;
      return this.versionSnapshot.filter(
        (row) => row.snapshot_key === snapshotKey && row.brief_id === briefId,
      );
    }
    if (normalized.includes("from studio_brief_draft_version")) {
      const briefId = bound[0] as string;
      const versionId = bound[1] as string | undefined;
      return this.version
        .filter(
          (row) =>
            row.brief_id === briefId && (versionId === undefined || row.version_id === versionId),
        )
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    }
    if (normalized.includes("from studio_brief_draft")) {
      const briefId = bound[0] as string;
      const row = this.draft.find((entry) => entry.brief_id === briefId);
      return row === undefined ? [] : [row];
    }
    return [];
  }

  private runQuery(normalized: string, bound: unknown[]): { changes: number } {
    if (normalized.startsWith("update identity_session set last_used_at")) {
      const session = this.session.find((row) => row.session_id === bound[1]);
      if (session !== undefined) session.last_used_at = bound[0];
      return { changes: session === undefined ? 0 : 1 };
    }
    if (normalized.startsWith("insert or ignore into studio_brief_write_idempotency")) {
      const [idempotencyKey, method, path, statusCode, responseJson, createdAt] = bound;
      if (
        this.idempotency.some(
          (row) =>
            row.idempotency_key === idempotencyKey && row.method === method && row.path === path,
        )
      ) {
        return { changes: 0 };
      }
      this.idempotency.push({
        idempotency_key: idempotencyKey,
        method,
        path,
        status_code: statusCode,
        response_json: responseJson,
        created_at: createdAt,
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_agent_run")) {
      this.agentRun.push({
        run_id: bound[0],
        brief_id: bound[1],
        workspace_id: bound[2],
        status: bound[3],
        intent: bound[4],
        base_version_id: bound[5],
        base_content_hash: bound[6],
        trigger_json: bound[7],
        actor_id: bound[8],
        actor_display_name: bound[9],
        model_provider: bound[10],
        model_id: bound[11],
        prompt_hash: bound[12],
        proposal_id: bound[13],
        error_code: bound[14],
        error_message: bound[15],
        created_at: bound[16],
        updated_at: bound[17],
        started_at: bound[18],
        completed_at: bound[19],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_agent_proposal")) {
      this.proposal.push({
        proposal_id: bound[0],
        run_id: bound[1],
        brief_id: bound[2],
        status: bound[3],
        base_version_id: bound[4],
        base_content_hash: bound[5],
        title: bound[6],
        summary: bound[7],
        operations_json: bound[8],
        validation_json: bound[9],
        preview_hash: bound[10],
        provenance_json: bound[11],
        accepted_operation_ids_json: bound[12],
        created_at: bound[13],
        updated_at: bound[14],
        applied_at: bound[15],
        rejected_at: bound[16],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_draft_version_snapshot")) {
      this.versionSnapshot.push({
        snapshot_key: bound[0],
        brief_id: bound[1],
        snapshot_json: bound[2],
        created_at: bound[3],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_draft_version")) {
      this.version.push({
        version_id: bound[0],
        brief_id: bound[1],
        parent_version_id: bound[2],
        content_hash: bound[3],
        actor_id: bound[4],
        actor_type: bound[5],
        reason: bound[6],
        source_run_id: bound[7],
        source_proposal_id: bound[8],
        validation_score: bound[9],
        snapshot_storage: bound[10],
        snapshot_key: bound[11],
        snapshot_sha256: bound[12],
        created_at: bound[13],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_agent_run")) {
      const briefId = bound.at(-2) as string;
      const runId = bound.at(-1) as string;
      const run = this.agentRun.find((row) => row.brief_id === briefId && row.run_id === runId);
      if (run === undefined) return { changes: 0 };
      let index = 2;
      run.status = bound[0];
      run.updated_at = bound[1];
      if (normalized.includes("proposal_id = ?")) run.proposal_id = bound[index++];
      if (normalized.includes("error_code = ?")) run.error_code = bound[index++];
      if (normalized.includes("error_message = ?")) run.error_message = bound[index++];
      if (normalized.includes("started_at = ?")) run.started_at = bound[index++];
      if (normalized.includes("completed_at = ?")) run.completed_at = bound[index++];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_agent_proposal")) {
      const briefId = bound.at(-2) as string;
      const proposalId = bound.at(-1) as string;
      const proposal = this.proposal.find(
        (row) => row.brief_id === briefId && row.proposal_id === proposalId,
      );
      if (proposal === undefined) return { changes: 0 };
      let index = 2;
      proposal.status = bound[0];
      proposal.updated_at = bound[1];
      if (normalized.includes("applied_at = ?")) proposal.applied_at = bound[index++];
      if (normalized.includes("rejected_at = ?")) proposal.rejected_at = bound[index++];
      if (normalized.includes("accepted_operation_ids_json = ?")) {
        proposal.accepted_operation_ids_json = bound[index++];
      }
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_draft\n")) {
      this.draft.push({
        brief_id: bound[0],
        route_slug: bound[1],
        workspace_id: bound[2],
        source_brief_id: bound[3],
        from_finding_id: bound[4],
        status: bound[5],
        title: bound[6],
        dek: bound[7],
        summary: bound[8],
        body_md: bound[9],
        version: bound[10],
        job_id: bound[11],
        job_status: bound[12],
        job_generation_mode: bound[13],
        job_llm_status: bound[14],
        job_llm_provider: bound[15],
        job_llm_model: bound[16],
        job_started_at: bound[17],
        job_completed_at: bound[18],
        job_error: bound[19],
        validation_score: null,
        validation_weak_claims_json: null,
        validation_missing_evidence_json: null,
        validation_blocking_issues_json: null,
        last_validated_at: null,
        created_at: bound[20],
        updated_at: bound[21],
        published_at: null,
        promotion_candidate_id: null,
        promotion_target_brief_id: null,
        promotion_artifact_key: null,
        promotion_artifact_sha256: null,
        promotion_recorded_at: null,
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_draft_claim")) {
      this.claim.push({
        brief_id: bound[0],
        claim_n: bound[1],
        title: bound[2],
        body: bound[3],
        strength: bound[4],
        evidence_ids_json: bound[5],
        caveat_ids_json: bound[6],
        state: bound[7],
        created_at: bound[8],
        updated_at: bound[9],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_draft_block")) {
      this.block.push({
        brief_id: bound[0],
        block_id: bound[1],
        block_type: bound[2],
        block_json: bound[3],
        created_at: bound[4],
        updated_at: bound[5],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_draft_ref")) {
      this.ref.push({
        brief_id: bound[0],
        ref_id: bound[1],
        ref_kind: bound[2],
        ref_json: bound[3],
        created_at: bound[4],
        updated_at: bound[5],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_history_event")) {
      this.history.push({
        event_id: bound[0],
        brief_id: bound[1],
        event_seq: bound[2],
        action: bound[3],
        actor: bound[4],
        summary: bound[5],
        draft_version: bound[6],
        snapshot_json: bound[7],
        created_at: bound[8],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into studio_brief_review_comment")) {
      this.reviewComment.push({
        comment_id: bound[0],
        brief_id: bound[1],
        parent_comment_id: bound[2],
        reviewer: bound[3],
        reviewer_display_name: bound[4],
        message: bound[5],
        kind: bound[6],
        status: bound[7],
        anchor_json: bound[8],
        suggestion_json: bound[9],
        created_at: bound[10],
        updated_at: bound[11],
        resolved_at: bound[12],
        resolved_by: bound[13],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_review_comment")) {
      const briefId = bound.at(-2) as string;
      const commentId = bound.at(-1) as string;
      const comment = this.reviewComment.find(
        (row) => row.brief_id === briefId && row.comment_id === commentId,
      );
      if (comment === undefined) return { changes: 0 };
      let index = 1;
      comment.updated_at = bound[0];
      if (normalized.includes("message = ?")) comment.message = bound[index++];
      if (normalized.includes("status = ?")) {
        comment.status = bound[index++];
        comment.resolved_at = bound[index++];
        comment.resolved_by = bound[index++];
      }
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft set updated_at")) {
      const briefId = bound.at(-1) as string;
      const draft = this.findDraft(briefId);
      if (draft === undefined) return { changes: 0 };
      let index = 1;
      draft.updated_at = bound[0];
      if (normalized.includes("title = ?")) draft.title = bound[index++];
      if (normalized.includes("dek = ?")) draft.dek = bound[index++];
      if (normalized.includes("summary = ?")) draft.summary = bound[index++];
      if (normalized.includes("body_md = ?")) draft.body_md = bound[index++];
      if (normalized.includes("status = ?")) draft.status = bound[index++];
      if (normalized.includes("version = ?")) draft.version = bound[index++];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft set status = ?, published_at")) {
      const draft = this.findDraft(bound[3] as string);
      if (draft === undefined) return { changes: 0 };
      draft.status = bound[0];
      draft.published_at = bound[1];
      draft.updated_at = bound[2];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft set status = ?, updated_at")) {
      const draft = this.findDraft(bound[2] as string);
      if (draft === undefined) return { changes: 0 };
      draft.status = bound[0];
      draft.updated_at = bound[1];
      return { changes: 1 };
    }
    if (
      normalized.startsWith(
        "update studio_brief_draft\n        set status = ?,\n            job_id",
      )
    ) {
      const draft = this.findDraft(bound[11] as string);
      if (draft === undefined) return { changes: 0 };
      draft.status = bound[0];
      draft.job_id = bound[1];
      draft.job_status = bound[2];
      draft.job_generation_mode = bound[3];
      draft.job_llm_status = bound[4];
      draft.job_llm_provider = bound[5];
      draft.job_llm_model = bound[6];
      draft.job_started_at = bound[7];
      draft.job_completed_at = bound[8];
      draft.job_error = bound[9];
      draft.updated_at = bound[10];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft\n        set status = ?")) {
      const briefId = bound.at(-1) as string;
      const draft = this.findDraft(briefId);
      if (draft === undefined) return { changes: 0 };
      if (normalized.includes("published_at = ?")) {
        draft.status = bound[0];
        draft.published_at = bound[1];
        draft.updated_at = bound[2];
        return { changes: 1 };
      }
      draft.status = bound[0];
      draft.updated_at = bound[1];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft\n        set validation_score")) {
      const draft = this.findDraft(bound[6] as string);
      if (draft === undefined) return { changes: 0 };
      draft.validation_score = bound[0];
      draft.validation_weak_claims_json = bound[1];
      draft.validation_missing_evidence_json = bound[2];
      draft.validation_blocking_issues_json = bound[3];
      draft.last_validated_at = bound[4];
      draft.updated_at = bound[5];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft\n        set status = 'published'")) {
      const draft = this.findDraft(bound[6] as string);
      if (draft === undefined) return { changes: 0 };
      draft.status = "published";
      draft.promotion_candidate_id = bound[0];
      draft.promotion_target_brief_id = bound[1];
      draft.promotion_artifact_key = bound[2];
      draft.promotion_artifact_sha256 = bound[3];
      draft.promotion_recorded_at = bound[4];
      draft.updated_at = bound[5];
      return { changes: 1 };
    }
    if (normalized.startsWith("update studio_brief_draft_claim\n        set updated_at")) {
      const briefId = bound.at(-2) as string;
      const claimN = bound.at(-1) as number;
      const claim = this.claim.find((row) => row.brief_id === briefId && row.claim_n === claimN);
      if (claim === undefined) return { changes: 0 };
      let index = 1;
      claim.updated_at = bound[0];
      if (normalized.includes("title = ?")) claim.title = bound[index++];
      if (normalized.includes("body = ?")) claim.body = bound[index++];
      if (normalized.includes("strength = ?")) claim.strength = bound[index++];
      if (normalized.includes("evidence_ids_json = ?")) claim.evidence_ids_json = bound[index++];
      if (normalized.includes("caveat_ids_json = ?")) claim.caveat_ids_json = bound[index++];
      if (normalized.includes("state = ?")) claim.state = bound[index++];
      return { changes: 1 };
    }
    if (normalized.startsWith("delete from studio_brief_draft_claim")) {
      const [briefId, claimN] = bound;
      const before = this.claim.length;
      this.claim = this.claim.filter(
        (row) => row.brief_id !== briefId || (claimN !== undefined && row.claim_n !== claimN),
      );
      return { changes: before - this.claim.length };
    }
    if (normalized.startsWith("update studio_brief_draft_block")) {
      const [blockType, blockJson, updatedAt, briefId, blockId] = bound;
      const block = this.block.find((row) => row.brief_id === briefId && row.block_id === blockId);
      if (block === undefined) return { changes: 0 };
      block.block_type = blockType;
      block.block_json = blockJson;
      block.updated_at = updatedAt;
      return { changes: 1 };
    }
    if (normalized.startsWith("delete from studio_brief_draft_block")) {
      const [briefId, blockId] = bound;
      const before = this.block.length;
      this.block = this.block.filter(
        (row) => row.brief_id !== briefId || (blockId !== undefined && row.block_id !== blockId),
      );
      return { changes: before - this.block.length };
    }
    if (normalized.startsWith("delete from studio_brief_draft_ref")) {
      const before = this.ref.length;
      if (normalized.includes("json_extract")) {
        const [briefId, blockId] = bound;
        this.ref = this.ref.filter((row) => {
          if (row.brief_id !== briefId || row.ref_kind !== "block") return true;
          const parsed = JSON.parse(String(row.ref_json)) as { blockId?: string };
          return parsed.blockId !== blockId;
        });
      } else {
        const [briefId] = bound;
        this.ref = this.ref.filter((row) => row.brief_id !== briefId);
      }
      return { changes: before - this.ref.length };
    }
    if (normalized.startsWith("update studio_brief_draft_claim\n        set claim_n")) {
      const [updatedAt, briefId, deletedClaimN] = bound;
      for (const row of this.claim) {
        if (row.brief_id === briefId && (row.claim_n as number) > (deletedClaimN as number)) {
          row.claim_n = (row.claim_n as number) - 1;
          row.updated_at = updatedAt;
        }
      }
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  private findDraft(briefId: string): Row | undefined {
    return this.draft.find((row) => row.brief_id === briefId);
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function seedOperator(
  db: FakeStudioDraftDb,
  scopes: string[],
): Promise<{ cookie: string; identityId: string }> {
  const identityId = "identity-1";
  const sessionToken = "session-token";
  db.identity.push({
    identity_id: identityId,
    email: "operator@example.test",
    email_normalized: "operator@example.test",
    display_name: "Studio Operator",
    active: 1,
  });
  db.session.push({
    session_id: "session-1",
    identity_id: identityId,
    kind: "session",
    token_hash: await sha256Hex(sessionToken),
    expires_at: "2999-01-01T00:00:00.000Z",
    consumed_at: null,
    revoked_at: null,
  });
  db.role.push({
    role_id: "role-1",
    identity_id: identityId,
    workspace_id: "workspace-1",
    scopes_json: JSON.stringify(scopes),
    active: 1,
  });
  return { cookie: `bp_session=${sessionToken}`, identityId };
}

function createStudioDraftEnv(db: FakeStudioDraftDb): Env {
  const brief = studioReleaseSeed.briefs[0];
  if (brief === undefined) {
    throw new Error("studioReleaseSeed must include at least one brief");
  }
  const projection = buildStudioBriefProjection(studioReleaseSeed, brief);
  if (projection === undefined) {
    throw new Error("sample brief projection must be buildable");
  }
  const routeDetail = buildStudioRouteProjection(studioReleaseSeed, projection.route);
  const finding = studioReleaseSeed.findings[0];
  const findingProjection =
    finding === undefined ? undefined : buildStudioFindingProjection(studioReleaseSeed, finding);
  const routeDetailWithArtifact = {
    ...routeDetail,
    artifactRefs: [
      {
        routeId: projection.route.routeId,
        month: "2026-05",
        name: "M15 test GeoJSON",
        key: "routes/m15/test.geojson",
        contentType: "application/geo+json",
        byteLength: 42,
        sha256: "test-sha256",
      },
    ],
  };
  return {
    DB: db as unknown as D1Database,
    ARTIFACTS: new FakeR2Bucket({
      "studio/v1/briefs.json": new FakeR2Object(
        JSON.stringify(buildStudioBriefsProjection(studioReleaseSeed)),
      ),
      "studio/v1/findings.json": new FakeR2Object(
        JSON.stringify(buildStudioFindingsProjection(studioReleaseSeed)),
      ),
      "studio/v1/routes.json": new FakeR2Object(
        JSON.stringify(buildStudioRoutesProjection(studioReleaseSeed)),
      ),
      [`studio/v1/briefs/${brief.id}/index.json`]: new FakeR2Object(JSON.stringify(projection)),
      ...(finding === undefined || findingProjection === undefined
        ? {}
        : {
            [`studio/v1/findings/${finding.id}/index.json`]: new FakeR2Object(
              JSON.stringify(findingProjection),
            ),
          }),
      [`studio/v1/routes/${projection.route.slug}/index.json`]: new FakeR2Object(
        JSON.stringify(routeDetailWithArtifact),
      ),
    }) as unknown as R2Bucket,
  };
}

function jsonRequest(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  headers: HeadersInit = {},
): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("Studio brief draft Worker endpoints", () => {
  const briefId = studioReleaseSeed.briefs[0]?.id ?? "brief-missing";

  it("requires sign-in for draft authoring endpoints", async () => {
    const db = new FakeStudioDraftDb();
    const env = createStudioDraftEnv(db);

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        { title: "Draft title" },
        {
          "Idempotency-Key": "anon-patch",
        },
      ),
      env,
    );

    expect(response.status).toBe(401);
    expect(db.draft).toHaveLength(0);
  });

  it("gates draft mutations by operator scope", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs"]);
    const env = createStudioDraftEnv(db);

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        { title: "Draft title" },
        {
          Cookie: cookie,
          "Idempotency-Key": "forbidden-patch",
        },
      ),
      env,
    );

    expect(response.status).toBe(403);
    expect(db.draft).toHaveLength(0);
  });

  it("requires an idempotency key for authenticated draft mutations", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        { title: "Draft title" },
        { Cookie: cookie },
      ),
      env,
    );

    expect(response.status).toBe(400);
    expect(db.draft).toHaveLength(0);
  });

  it("creates an agent run and stores valid proposed edits without mutating the draft", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const runResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs`,
        "POST",
        {
          intent: "generate_brief",
          trigger: { message: "Draft a sharper version." },
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-run-create",
        },
      ),
      env,
    );

    expect(runResponse.status).toBe(200);
    const { run } = StudioBriefAgentRunResponseSchema.parse(await runResponse.json());
    expect(run.status).toBe("queued");
    expect(run.baseContentHash).toHaveLength(64);
    const originalBodyMd = db.draft[0]?.body_md;

    const proposalResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs/${run.runId}/propose-edit`,
        "POST",
        {
          title: "Replace the draft body",
          summary: "Produces an approvable body replacement.",
          operations: [
            {
              opId: "op-body",
              type: "replace_body_md",
              bodyMd: "## Agent proposal\n\nThis is proposed text, not accepted text.",
            },
          ],
          provenance: {
            modelProvider: "fake",
            modelId: "fake-model",
            promptHash: null,
            evidenceRefs: [],
          },
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-propose-valid",
        },
      ),
      env,
    );

    expect(proposalResponse.status).toBe(200);
    const proposalResult = StudioBriefAgentProposeEditResultSchema.parse(
      await proposalResponse.json(),
    );
    expect(proposalResult.ok).toBe(true);
    if (!proposalResult.ok) {
      throw new Error("expected proposal result to be valid");
    }
    expect(db.proposal).toHaveLength(1);
    expect(db.agentRun[0]?.status).toBe("needs_approval");
    expect(db.agentRun[0]?.proposal_id).toBe(proposalResult.proposalId);
    expect(db.draft[0]?.body_md).toBe(originalBodyMd);

    const fetchProposalResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/proposals/${proposalResult.proposalId}`,
        "GET",
        undefined,
        { Cookie: cookie },
      ),
      env,
    );
    expect(fetchProposalResponse.status).toBe(200);
    const { proposal } = StudioBriefAgentProposalResponseSchema.parse(
      await fetchProposalResponse.json(),
    );
    expect(proposal.status).toBe("proposed");
    expect(proposal.operations[0]?.type).toBe("replace_body_md");
    expect(proposal.previewHash).toBe(proposalResult.previewHash);
  });

  it("returns repair feedback for invalid agent edit output", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const runResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs`,
        "POST",
        { intent: "revise_selection", trigger: { message: "Revise the lead." } },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-run-repair",
        },
      ),
      env,
    );
    const { run } = StudioBriefAgentRunResponseSchema.parse(await runResponse.json());

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs/${run.runId}/propose-edit`,
        "POST",
        {
          title: "Bad range",
          summary: "This should produce feedback.",
          operations: [
            {
              opId: "op-missing",
              type: "replace_body_range",
              anchor: {
                target: "body",
                targetId: null,
                quote: { exact: "text that is not in the draft" },
              },
              replaceWith: "Replacement",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-propose-repair",
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const result = StudioBriefAgentProposeEditResultSchema.parse(await response.json());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("repair_required");
      expect(result.errors[0]?.code).toBe("selector_missing");
    }
    expect(db.proposal).toHaveLength(0);
    expect(db.agentRun[0]?.status).toBe("queued");
  });

  it("rejects agent proposals created against a stale draft base", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const runResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs`,
        "POST",
        { intent: "generate_brief", trigger: { message: "Generate a draft." } },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-run-stale",
        },
      ),
      env,
    );
    const { run } = StudioBriefAgentRunResponseSchema.parse(await runResponse.json());

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs/${run.runId}/propose-edit`,
        "POST",
        {
          baseContentHash: "0".repeat(64),
          title: "Stale proposal",
          summary: "Should not be accepted.",
          operations: [
            {
              opId: "op-body",
              type: "replace_body_md",
              bodyMd: "## Stale text",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-propose-stale",
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const result = StudioBriefAgentProposeEditResultSchema.parse(await response.json());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("stale_base");
      expect(result.errors[0]?.retryable).toBe(false);
    }
    expect(db.proposal).toHaveLength(0);
  });

  it("applies approved agent proposal operations and creates a restoreable version", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const runResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs`,
        "POST",
        { intent: "generate_brief", trigger: { message: "Generate a draft." } },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-run-apply",
        },
      ),
      env,
    );
    const { run } = StudioBriefAgentRunResponseSchema.parse(await runResponse.json());

    const proposalResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs/${run.runId}/propose-edit`,
        "POST",
        {
          title: "Apply body",
          summary: "Apply the proposal body.",
          operations: [
            {
              opId: "op-body",
              type: "replace_body_md",
              bodyMd: "## Accepted agent text\n\nThis text is now approved by a human.",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-propose-apply",
        },
      ),
      env,
    );
    const proposalResult = StudioBriefAgentProposeEditResultSchema.parse(
      await proposalResponse.json(),
    );
    expect(proposalResult.ok).toBe(true);
    if (!proposalResult.ok) throw new Error("expected proposal to be stored");

    const applyResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/proposals/${proposalResult.proposalId}/apply`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-proposal-apply",
        },
      ),
      env,
    );

    expect(applyResponse.status).toBe(200);
    const applied = StudioBriefAgentProposalApplyResponseSchema.parse(await applyResponse.json());
    expect(applied.draft.bodyMd).toBe(
      "## Accepted agent text\n\nThis text is now approved by a human.",
    );
    expect(applied.proposal.status).toBe("applied");
    expect(applied.proposal.acceptedOperationIds).toEqual(["op-body"]);
    expect(applied.version.reason).toBe("agent_proposal_applied");
    expect(db.draft[0]?.body_md).toBe(
      "## Accepted agent text\n\nThis text is now approved by a human.",
    );
    expect(db.version).toHaveLength(1);
    expect(db.versionSnapshot).toHaveLength(1);
  });

  it("rejects agent proposals without mutating accepted draft content", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const runResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs`,
        "POST",
        { intent: "freeform_edit", trigger: { message: "Try a rewrite." } },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-run-reject",
        },
      ),
      env,
    );
    const { run } = StudioBriefAgentRunResponseSchema.parse(await runResponse.json());
    const originalBodyMd = db.draft[0]?.body_md;

    const proposalResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs/${run.runId}/propose-edit`,
        "POST",
        {
          title: "Reject body",
          summary: "This should stay proposed only.",
          operations: [
            {
              opId: "op-body",
              type: "replace_body_md",
              bodyMd: "## Rejected text",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-propose-reject",
        },
      ),
      env,
    );
    const proposalResult = StudioBriefAgentProposeEditResultSchema.parse(
      await proposalResponse.json(),
    );
    expect(proposalResult.ok).toBe(true);
    if (!proposalResult.ok) throw new Error("expected proposal to be stored");

    const rejectResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/proposals/${proposalResult.proposalId}/reject`,
        "POST",
        { reason: "Too speculative." },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-proposal-reject",
        },
      ),
      env,
    );

    expect(rejectResponse.status).toBe(200);
    const rejected = StudioBriefAgentProposalRejectResponseSchema.parse(
      await rejectResponse.json(),
    );
    expect(rejected.proposal.status).toBe("rejected");
    expect(rejected.proposal.rejectedAt).not.toBeNull();
    expect(db.draft[0]?.body_md).toBe(originalBodyMd);
  });

  it("restores a stored draft version snapshot as a new draft version", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const runResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs`,
        "POST",
        { intent: "generate_brief", trigger: { message: "Generate a restorable draft." } },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-run-restore",
        },
      ),
      env,
    );
    const { run } = StudioBriefAgentRunResponseSchema.parse(await runResponse.json());
    const proposalResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/agent-runs/${run.runId}/propose-edit`,
        "POST",
        {
          title: "Restore body",
          summary: "Creates a version to restore.",
          operations: [
            {
              opId: "op-body",
              type: "replace_body_md",
              bodyMd: "## Restorable agent text",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-propose-restore",
        },
      ),
      env,
    );
    const proposalResult = StudioBriefAgentProposeEditResultSchema.parse(
      await proposalResponse.json(),
    );
    expect(proposalResult.ok).toBe(true);
    if (!proposalResult.ok) throw new Error("expected proposal to be stored");

    const applyResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/proposals/${proposalResult.proposalId}/apply`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "agent-proposal-restore-apply",
        },
      ),
      env,
    );
    const applied = StudioBriefAgentProposalApplyResponseSchema.parse(await applyResponse.json());

    const patchResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        { bodyMd: "## Manual later edit" },
        {
          Cookie: cookie,
          "Idempotency-Key": "manual-change-before-restore",
        },
      ),
      env,
    );
    expect(patchResponse.status).toBe(204);
    expect(db.draft[0]?.body_md).toBe("## Manual later edit");

    const restoreResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/versions/${applied.version.versionId}/restore`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "draft-version-restore",
        },
      ),
      env,
    );

    expect(restoreResponse.status).toBe(200);
    const restored = StudioBriefDraftVersionRestoreResponseSchema.parse(
      await restoreResponse.json(),
    );
    expect(restored.draft.bodyMd).toBe("## Restorable agent text");
    expect(restored.version.reason).toBe("restored");
    expect(db.version).toHaveLength(2);
    expect(db.versionSnapshot).toHaveLength(2);
  });

  it("creates a new draft-only brief from a route seed and serves it to the operator", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);
    const routeSlug = studioReleaseSeed.routes[0]?.slug ?? "m15-sbs";

    const createResponse = await worker.fetch(
      jsonRequest(
        "/api/v1/studio/briefs",
        "POST",
        {
          routeSlug,
          title: "New draft from route",
          summary: "A new working summary.",
          bodyMd: "## Working summary\n\nA new working summary.",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "brief-create-route",
        },
      ),
      env,
    );

    expect(createResponse.status).toBe(200);
    const created = StudioBriefCreateResponseSchema.parse(await createResponse.json());
    expect(created.draft.briefId).toMatch(/^draft-/);
    expect(created.draft.routeSlug).toBe(routeSlug);
    expect(created.draft.title).toBe("New draft from route");
    expect(created.draft.bodyMd).toBe("## Working summary\n\nA new working summary.");

    const operatorResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${created.draft.briefId}`, "GET", undefined, {
        Cookie: cookie,
      }),
      env,
    );
    expect(operatorResponse.status).toBe(200);
    const operatorBrief = StudioBriefResponseSchema.parse(await operatorResponse.json());
    expect(operatorBrief.brief.id).toBe(created.draft.briefId);
    expect(operatorBrief.brief.title).toBe("New draft from route");
    expect(operatorBrief.draftStatus).toBe("draft");

    const publicResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${created.draft.briefId}`, "GET"),
      env,
    );
    expect(publicResponse.status).toBe(404);
  });

  it("creates a new draft from a finding seed with an initial claim", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);
    const finding = studioReleaseSeed.findings[0];
    expect(finding).toBeDefined();

    const response = await worker.fetch(
      jsonRequest(
        "/api/v1/studio/briefs",
        "POST",
        { fromFindingId: finding?.id },
        {
          Cookie: cookie,
          "Idempotency-Key": "brief-create-finding",
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const body = StudioBriefCreateResponseSchema.parse(await response.json());
    expect(body.draft.fromFindingId).toBe(finding?.id);
    expect(body.draft.routeSlug).toBe(finding?.routeSlug);
    expect(body.draft.claims).toHaveLength(1);
    expect(body.draft.claims[0]?.title).toBe(finding?.title);
  });

  it("creates a D1 draft, writes metadata, and overlays draft status only for the operator", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const patchResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        {
          title: "Operator draft title",
          bodyMd: "## Operator draft title\n\nEdited draft body.",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "patch-title",
        },
      ),
      env,
    );
    expect(patchResponse.status).toBe(204);
    expect(db.draft[0]?.title).toBe("Operator draft title");
    expect(db.draft[0]?.body_md).toBe("## Operator draft title\n\nEdited draft body.");
    expect(db.idempotency).toHaveLength(1);

    const operatorResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${briefId}`, "GET", undefined, { Cookie: cookie }),
      env,
    );
    expect(operatorResponse.status).toBe(200);
    const operatorBrief = StudioBriefResponseSchema.parse(await operatorResponse.json());
    expect(operatorBrief.brief.title).toBe("Operator draft title");
    expect(operatorBrief.brief.bodyMd).toBe("## Operator draft title\n\nEdited draft body.");
    expect(operatorBrief.draftStatus).toBe("draft");

    const publicResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${briefId}`, "GET"),
      env,
    );
    expect(publicResponse.status).toBe(200);
    const publicBrief = StudioBriefResponseSchema.parse(await publicResponse.json());
    expect(publicBrief.brief.title).not.toBe("Operator draft title");
    expect(publicBrief.draftStatus).toBeNull();
  });

  it("records generation requests as failed when no AI runner binding is configured", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/generate`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "generate-once",
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string; error?: string | null };
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/Cloudflare Think and Workers AI bindings/i);
    expect(db.draft[0]?.job_status).toBe("failed");
    expect(db.draft[0]?.job_llm_status).toBe("not_configured");
  });

  it("queues Cloudflare Think generation when Workers AI bindings are configured", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const agent = new FakeBriefAuthorAgentNamespace();
    const env: Env = {
      ...createStudioDraftEnv(db),
      AI: { run: async () => ({}) } as unknown as Ai,
      BRIEF_AUTHOR_AGENT: agent as unknown as NonNullable<Env["BRIEF_AUTHOR_AGENT"]>,
    };

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/generate`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "generate-queued",
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string; error?: string | null };
    expect(body.status).toBe("queued");
    expect(body.error).toBeNull();
    expect(db.draft[0]?.job_status).toBe("queued");
    expect(db.draft[0]?.job_llm_status).toBe("pending");
    expect(db.draft[0]?.job_llm_provider).toBe("workers_ai");
    expect(db.agentRun).toHaveLength(1);
    expect(db.agentRun[0]?.status).toBe("queued");
    expect(db.agentRun[0]?.model_provider).toBe("workers_ai");
    expect(db.agentRun[0]?.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(agent.starts).toHaveLength(1);
    expect(agent.starts[0]?.briefId).toBe(briefId);
    expect(agent.starts[0]?.runId).toBe(db.agentRun[0]?.run_id);
    expect(agent.starts[0]?.jobId).toBe(db.draft[0]?.job_id);
  });

  it("replays idempotent claim creation without duplicating claims", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const request = () =>
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/claims`,
        "POST",
        {
          title: "New claim",
          body: "Claim body",
          strength: 75,
          evidenceIds: [],
          caveatIds: [],
          state: "editing",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "claim-create",
        },
      );

    const first = await worker.fetch(request(), env);
    const second = await worker.fetch(request(), env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(db.claim.filter((row) => row.title === "New claim")).toHaveLength(1);
  });

  it("creates, updates, resolves, and deletes typed draft blocks", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);
    const block = {
      id: "blk_madison_pm",
      type: "segment-card",
      title: "Madison Av, E 28 St to E 58 St",
      routeId: "M15",
      routeLabel: "M15 SBS",
      direction: "NB",
      from: "E 28 St",
      to: "E 58 St",
      metrics: { avgSpeedMph: 4.8, scheduledSpeedMph: 7.1, riderHoursLostDaily: 18420 },
      refs: [{ role: "source", kind: "evidence", id: "evidence-1" }],
    };

    const createResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/blocks`,
        "POST",
        { block },
        {
          Cookie: cookie,
          "Idempotency-Key": "block-create",
        },
      ),
      env,
    );
    expect(createResponse.status).toBe(200);
    const created = StudioBriefDraftBlockResponseSchema.parse(await createResponse.json());
    expect(created.block.id).toBe("blk_madison_pm");
    expect(db.block).toHaveLength(1);

    const operatorBriefResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${briefId}`, "GET", undefined, { Cookie: cookie }),
      env,
    );
    expect(operatorBriefResponse.status).toBe(200);
    const operatorBrief = StudioBriefResponseSchema.parse(await operatorBriefResponse.json());
    expect(operatorBrief.brief.blocks?.[0]?.id).toBe("blk_madison_pm");

    const evidence = operatorBrief.brief.evidence[0];
    expect(evidence).toBeDefined();
    const resolveResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/refs/resolve`,
        "POST",
        {
          refs: [
            {
              id: "block:madison",
              kind: "block",
              blockId: "blk_madison_pm",
              blockType: "segment-card",
            },
            {
              id: "evidence:first",
              kind: "evidence",
              evidenceId: evidence?.id,
              role: "primary",
            },
            {
              id: "metric:madison",
              kind: "metric",
              metricId: "metric_m15_madison_pm",
              sourceEvidenceIds: [evidence?.id],
            },
            {
              id: "artifact:geojson",
              kind: "artifact",
              artifactKey: "routes/m15/test.geojson",
              artifactType: "geojson",
            },
            {
              id: "missing:block",
              kind: "block",
              blockId: "missing_block",
              blockType: "segment-card",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "refs-resolve",
        },
      ),
      env,
    );
    expect(resolveResponse.status).toBe(200);
    const resolved = StudioBriefDraftRefsResolveResponseSchema.parse(await resolveResponse.json());
    expect(resolved.refs).toContainEqual({
      id: "block:madison",
      kind: "block",
      blockId: "blk_madison_pm",
      blockType: "segment-card",
    });
    expect(resolved.refs).toContainEqual({
      id: "evidence:first",
      kind: "evidence",
      evidenceId: evidence?.id,
      role: "primary",
      label: evidence?.title,
    });
    expect(resolved.refs).toContainEqual({
      id: "metric:madison",
      kind: "metric",
      metricId: "metric_m15_madison_pm",
      sourceEvidenceIds: [evidence?.id],
      label: "metric_m15_madison_pm",
    });
    expect(resolved.refs).toContainEqual({
      id: "artifact:geojson",
      kind: "artifact",
      artifactKey: "routes/m15/test.geojson",
      artifactType: "geojson",
      label: "M15 test GeoJSON",
      publicUrl: "/api/v1/artifacts/routes/m15/test.geojson",
    });
    expect(resolved.unresolved).toEqual(["missing:block"]);

    const replaceRefsResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/refs`,
        "PUT",
        { refs: resolved.refs.filter((ref) => ref.kind !== "unresolved") },
        {
          Cookie: cookie,
          "Idempotency-Key": "refs-replace",
        },
      ),
      env,
    );
    expect(replaceRefsResponse.status).toBe(200);
    const replacedRefs = StudioBriefDraftRefsResponseSchema.parse(await replaceRefsResponse.json());
    expect(replacedRefs.refs).toHaveLength(4);
    expect(db.ref).toHaveLength(4);

    const listRefsResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${briefId}/draft/refs`, "GET", undefined, {
        Cookie: cookie,
      }),
      env,
    );
    expect(listRefsResponse.status).toBe(200);
    const listedRefs = StudioBriefDraftRefsResponseSchema.parse(await listRefsResponse.json());
    expect(listedRefs.refs.map((ref) => ref.id)).toContain("artifact:geojson");

    const updateResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/blocks/blk_madison_pm`,
        "PATCH",
        {
          block: {
            ...block,
            title: "Updated Madison segment",
            metrics: { avgSpeedMph: 5.1 },
            refs: [],
          },
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "block-update",
        },
      ),
      env,
    );
    expect(updateResponse.status).toBe(204);
    expect(JSON.parse(String(db.block[0]?.block_json)).title).toBe("Updated Madison segment");

    const deleteResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/blocks/blk_madison_pm`,
        "DELETE",
        undefined,
        {
          Cookie: cookie,
          "Idempotency-Key": "block-delete",
        },
      ),
      env,
    );
    expect(deleteResponse.status).toBe(204);
    expect(db.block).toHaveLength(0);
    expect(db.ref.some((row) => row.ref_id === "block:madison")).toBe(false);
  });

  it("attaches captured objects as blocks, refs, and body directives", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const response = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/attach`,
        "POST",
        {
          block: {
            id: "finding_m15_slow",
            type: "finding",
            title: "M15 slow speed finding",
            confidence: "moderate",
            claim: "M15 buses are slow in the PM peak.",
            supports: ["Observed speed trails the schedule."],
            route: "M15",
            sbs: true,
          },
          refs: [
            {
              id: "evidence:attached",
              kind: "evidence",
              evidenceId: "evidence-m15-speed",
              role: "primary",
            },
          ],
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "attach-finding",
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const attached = StudioBriefDraftAttachResponseSchema.parse(await response.json());
    expect(attached.block.id).toBe("finding_m15_slow");
    expect(attached.draft.bodyMd).toContain(':::finding{ref="finding_m15_slow"}');
    expect(attached.draft.refs.map((ref) => ref.id)).toContain("block:finding_m15_slow");
    expect(db.block).toHaveLength(1);
    expect(db.ref.map((row) => row.ref_id)).toContain("block:finding_m15_slow");
  });

  it("validates draft body markdown against typed block refs", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs"]);
    const env = createStudioDraftEnv(db);

    const createBlockResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/blocks`,
        "POST",
        {
          block: {
            id: "blk_before_after",
            type: "before-after",
            intervention: "Dedicated bus lane",
            when: "PM peak",
            before: 4.8,
            after: 6.2,
            unit: "mph",
            delta: 1.4,
          },
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "validation-block-create",
        },
      ),
      env,
    );
    expect(createBlockResponse.status).toBe(200);

    const patchResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        {
          bodyMd:
            "## Body\n\n:::segment-card{ref=missing_block}\n:::\n\n:::segment-card{ref=blk_before_after}\n:::",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "validation-body-md",
        },
      ),
      env,
    );
    expect(patchResponse.status).toBe(204);

    const validateResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/validate`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "validation-body-check",
        },
      ),
      env,
    );

    expect(validateResponse.status).toBe(200);
    const body = (await validateResponse.json()) as {
      validation?: { blockingIssues?: string[] };
    };
    expect(body.validation?.blockingIssues).toEqual(
      expect.arrayContaining([
        "Body markdown references missing block missing_block.",
        "Body markdown references block blk_before_after as segment-card, but the block is before-after.",
      ]),
    );
  });

  it("persists anchored review threads, replies, and accepted body suggestions", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs", "review:briefs"]);
    const env = createStudioDraftEnv(db);

    const patchResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        { bodyMd: "## Body\n\nThis sentence is too long." },
        {
          Cookie: cookie,
          "Idempotency-Key": "review-thread-body",
        },
      ),
      env,
    );
    expect(patchResponse.status).toBe(204);

    const createResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/comments`,
        "POST",
        {
          kind: "suggested-edit",
          body: "Trim this sentence.",
          anchor: {
            target: "body",
            targetId: null,
            quote: { exact: "This sentence is too long." },
          },
          suggestion: {
            suggestFrom: "This sentence is too long.",
            suggestTo: "Tighter sentence.",
          },
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "review-thread-create",
        },
      ),
      env,
    );
    expect(createResponse.status).toBe(200);
    const created = StudioBriefDraftCommentResponseSchema.parse(await createResponse.json());
    expect(created.comment.kind).toBe("suggested-edit");
    expect(created.comment.suggestion?.suggestTo).toBe("Tighter sentence.");

    const replyResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/comments/${created.comment.commentId}/replies`,
        "POST",
        { body: "Taking this." },
        {
          Cookie: cookie,
          "Idempotency-Key": "review-thread-reply",
        },
      ),
      env,
    );
    expect(replyResponse.status).toBe(200);
    const replied = StudioBriefDraftCommentResponseSchema.parse(await replyResponse.json());
    expect(replied.comment.replies[0]?.body).toBe("Taking this.");

    const acceptResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/comments/${created.comment.commentId}/accept-suggestion`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "review-thread-accept",
        },
      ),
      env,
    );
    expect(acceptResponse.status).toBe(204);
    expect(db.draft[0]?.body_md).toBe("## Body\n\nTighter sentence.");
    expect(db.reviewComment[0]?.status).toBe("resolved");

    const listResponse = await worker.fetch(
      jsonRequest(`/api/v1/studio/briefs/${briefId}/draft/comments`, "GET", undefined, {
        Cookie: cookie,
      }),
      env,
    );
    expect(listResponse.status).toBe(200);
    const listed = StudioBriefDraftCommentsResponseSchema.parse(await listResponse.json());
    expect(listed.comments).toHaveLength(1);
    expect(listed.comments[0]?.replies).toHaveLength(1);
  });

  it("records reviewer verdict transitions separately from publish", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, ["read:briefs", "write:briefs", "review:briefs"]);
    const env = createStudioDraftEnv(db);

    const patchResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        { title: "Verdict candidate" },
        {
          Cookie: cookie,
          "Idempotency-Key": "verdict-seed",
        },
      ),
      env,
    );
    expect(patchResponse.status).toBe(204);

    const changesResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/verdict`,
        "POST",
        {
          verdict: "request_changes",
          message: "Please tighten the evidence.",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "verdict-request-changes",
        },
      ),
      env,
    );
    expect(changesResponse.status).toBe(204);
    expect(db.draft[0]?.status).toBe("draft");
    expect(db.reviewComment[0]?.message).toBe("Please tighten the evidence.");

    const blockedApproveResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/verdict`,
        "POST",
        { verdict: "approve" },
        {
          Cookie: cookie,
          "Idempotency-Key": "verdict-approve-blocked",
        },
      ),
      env,
    );
    expect(blockedApproveResponse.status).toBe(409);

    const resolveResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/comments/${db.reviewComment[0]?.comment_id}`,
        "PATCH",
        { status: "resolved" },
        {
          Cookie: cookie,
          "Idempotency-Key": "verdict-resolve-change",
        },
      ),
      env,
    );
    expect(resolveResponse.status).toBe(200);

    const approveResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/verdict`,
        "POST",
        { verdict: "approve" },
        {
          Cookie: cookie,
          "Idempotency-Key": "verdict-approve",
        },
      ),
      env,
    );
    expect(approveResponse.status).toBe(204);
    expect(db.draft[0]?.status).toBe("approved");
    expect(db.history.map((row) => row.action)).toContain("draft.verdict.approved");
  });

  it("marks publish candidates and returns the export payload for publish operators", async () => {
    const db = new FakeStudioDraftDb();
    const { cookie } = await seedOperator(db, [
      "read:briefs",
      "write:briefs",
      "review:briefs",
      "publish:briefs",
    ]);
    const env = createStudioDraftEnv(db);

    const patchResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft`,
        "PATCH",
        {
          title: "Candidate draft title",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "candidate-title",
        },
      ),
      env,
    );
    expect(patchResponse.status).toBe(204);

    const approveResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/verdict`,
        "POST",
        { verdict: "approve" },
        {
          Cookie: cookie,
          "Idempotency-Key": "candidate-approve",
        },
      ),
      env,
    );
    expect(approveResponse.status).toBe(204);

    const publishResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/publish`,
        "POST",
        {},
        {
          Cookie: cookie,
          "Idempotency-Key": "candidate-publish",
        },
      ),
      env,
    );
    expect(publishResponse.status).toBe(204);

    const exportResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/publish-candidate-export`,
        "GET",
        undefined,
        { Cookie: cookie },
      ),
      env,
    );

    expect(exportResponse.status).toBe(200);
    const body = StudioBriefPublishCandidateExportResponseSchema.parse(await exportResponse.json());
    expect(body.brief.title).toBe("Candidate draft title");
    expect(body.artifactKey).toBe(`studio/v1/publish-candidates/${briefId}.json`);
    expect(body.publishedAt).toBe(db.draft[0]?.published_at);
    expect(body.audit?.validation.blockingIssues).toEqual([]);
    expect(body.audit?.contentHashes.bodyMd).toHaveLength(64);
    expect(body.audit?.reviewThreads).toEqual([]);

    const receiptResponse = await worker.fetch(
      jsonRequest(
        `/api/v1/studio/briefs/${briefId}/draft/promotion-receipt`,
        "POST",
        {
          candidateId: body.candidateId,
          targetBriefId: body.sourceBriefId ?? body.briefId,
          artifactKey: body.artifactKey,
          artifactSha256: "b".repeat(64),
          promotedAt: "2026-05-31T00:30:00.000Z",
        },
        {
          Cookie: cookie,
          "Idempotency-Key": "candidate-receipt",
        },
      ),
      env,
    );
    expect(receiptResponse.status).toBe(200);
    const receipt = StudioBriefDraftPromotionReceiptResponseSchema.parse(
      await receiptResponse.json(),
    );
    expect(receipt.draft.status).toBe("published");
    expect(receipt.draft.promotionArtifactSha256).toBe("b".repeat(64));
    expect(db.draft[0]?.promotion_target_brief_id).toBe(body.sourceBriefId ?? body.briefId);
  });
});

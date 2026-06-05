import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createD1ServingDb,
  type D1ServingDb,
  deleteStudioBriefDraftBlock,
  deleteStudioBriefDraftClaim,
  getStudioBriefAgentProposal,
  getStudioBriefAgentRun,
  getStudioBriefDraftRecord,
  getStudioBriefDraftVersion,
  getStudioBriefDraftVersionSnapshot,
  getStudioBriefReviewComment,
  getStudioBriefWriteIdempotency,
  insertStudioBriefAgentProposal,
  insertStudioBriefAgentRun,
  insertStudioBriefDraft,
  insertStudioBriefDraftBlock,
  insertStudioBriefDraftClaim,
  insertStudioBriefDraftVersion,
  insertStudioBriefDraftVersionSnapshot,
  insertStudioBriefHistoryEvent,
  insertStudioBriefReviewReply,
  insertStudioBriefReviewThread,
  listStudioBriefDraftVersions,
  listStudioBriefHistoryEvents,
  markStudioBriefDraftPublishCandidate,
  markStudioBriefDraftRetracted,
  recordStudioBriefPromotionReceipt,
  recordStudioBriefWriteIdempotency,
  replaceStudioBriefDraftRefs,
  updateStudioBriefAgentProposalStatus,
  updateStudioBriefAgentRunStatus,
  updateStudioBriefDraftBlock,
  updateStudioBriefDraftClaim,
  updateStudioBriefDraftMetadata,
  updateStudioBriefDraftValidation,
  updateStudioBriefReviewComment,
} from "../src/d1/index.js";

type D1Value = string | number | boolean | null;

class SqliteD1Statement {
  private values: D1Value[] = [];

  constructor(
    private readonly database: Database,
    private readonly query: string,
  ) {}

  bind(...values: D1Value[]): SqliteD1Statement {
    this.values = values;
    return this;
  }

  async first(): Promise<Record<string, unknown> | null> {
    return (
      (this.database.query(this.query).get(...(this.values as never[])) as Record<
        string,
        unknown
      > | null) ?? null
    );
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    return {
      results: this.database.query(this.query).all(...(this.values as never[])) as Record<
        string,
        unknown
      >[],
    };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const result = this.database.query(this.query).run(...(this.values as never[]));
    return { meta: { changes: result.changes } };
  }

  async raw(): Promise<unknown[][]> {
    return this.database.query(this.query).values(...(this.values as never[]));
  }

  isSelect(): boolean {
    return this.query.trimStart().toLowerCase().startsWith("select");
  }
}

class SqliteD1Database {
  constructor(private readonly database: Database) {}

  prepare(query: string): SqliteD1Statement {
    return new SqliteD1Statement(this.database, query);
  }

  async batch(statements: SqliteD1Statement[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const statement of statements) {
      if (statement.isSelect()) {
        const { results: rows } = await statement.all();
        results.push({ results: rows });
      } else {
        results.push(await statement.run());
      }
    }
    return results;
  }
}

async function createTestD1(): Promise<{ database: D1ServingDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationsDir = new URL("../migrations/d1/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    sqlite.exec(await Bun.file(new URL(filename, migrationsDir)).text());
  }
  return {
    database: createD1ServingDb(new SqliteD1Database(sqlite) as unknown as D1Database),
    sqlite,
  };
}

async function seedDraft(database: D1ServingDb, now = "2026-05-31T00:00:00.000Z") {
  await insertStudioBriefDraft(database, {
    briefId: "brief-m15",
    routeSlug: "m15-sbs",
    sourceBriefId: "brief-m15",
    workspaceId: "workspace-1",
    fromFindingId: null,
    status: "draft",
    title: "Initial draft",
    dek: "Initial dek",
    summary: "Initial summary",
    bodyMd: "## Initial draft\n\nInitial summary",
    version: "v1",
    jobId: "job-seed",
    createdAt: now,
    updatedAt: now,
  });

  await insertStudioBriefDraftClaim(database, {
    briefId: "brief-m15",
    claimN: 1,
    title: "First claim",
    body: "Claim body",
    strength: 80,
    evidenceIds: ["evidence-1"],
    caveatIds: [],
    state: "active",
    createdAt: now,
    updatedAt: now,
  });
  await insertStudioBriefDraftClaim(database, {
    briefId: "brief-m15",
    claimN: 2,
    title: "Second claim",
    body: null,
    strength: 40,
    evidenceIds: [],
    caveatIds: ["caveat-1"],
    state: "weak",
    createdAt: now,
    updatedAt: now,
  });
}

describe("studio brief draft D1 queries", () => {
  test("persists agent runs, proposals, and draft version milestones", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await insertStudioBriefAgentRun(database, {
        runId: "run-1",
        briefId: "brief-m15",
        workspaceId: "workspace-1",
        status: "queued",
        intent: "generate_brief",
        baseVersionId: "v1",
        baseContentHash: "a".repeat(64),
        triggerJson: JSON.stringify({ message: "Draft this brief." }),
        actorId: "operator@example.test",
        actorDisplayName: "Operator",
        createdAt: "2026-05-31T01:00:00.000Z",
        updatedAt: "2026-05-31T01:00:00.000Z",
      });
      await insertStudioBriefAgentProposal(database, {
        proposalId: "proposal-1",
        runId: "run-1",
        briefId: "brief-m15",
        status: "proposed",
        baseVersionId: "v1",
        baseContentHash: "a".repeat(64),
        title: "Replace body",
        summary: "Updates the body markdown.",
        operationsJson: JSON.stringify([
          { opId: "op-1", type: "replace_body_md", bodyMd: "## Updated" },
        ]),
        validationJson: JSON.stringify({
          score: 100,
          weakClaims: [],
          missingEvidence: [],
          blockingIssues: [],
          validatedAt: "2026-05-31T01:01:00.000Z",
        }),
        previewHash: "b".repeat(64),
        provenanceJson: JSON.stringify({
          modelProvider: null,
          modelId: null,
          promptHash: null,
          evidenceRefs: [],
        }),
        createdAt: "2026-05-31T01:01:00.000Z",
        updatedAt: "2026-05-31T01:01:00.000Z",
      });
      await updateStudioBriefAgentRunStatus(database, {
        runId: "run-1",
        briefId: "brief-m15",
        status: "needs_approval",
        proposalId: "proposal-1",
        updatedAt: "2026-05-31T01:02:00.000Z",
      });
      await updateStudioBriefAgentProposalStatus(database, {
        proposalId: "proposal-1",
        briefId: "brief-m15",
        status: "applied",
        updatedAt: "2026-05-31T01:02:30.000Z",
        appliedAt: "2026-05-31T01:02:30.000Z",
        acceptedOperationIds: ["op-1"],
      });
      await insertStudioBriefDraftVersionSnapshot(database, {
        snapshotKey: "studio-brief-draft:brief-m15:version-1",
        briefId: "brief-m15",
        snapshotJson: JSON.stringify({ briefId: "brief-m15", bodyMd: "## Updated" }),
        createdAt: "2026-05-31T01:03:00.000Z",
      });
      await insertStudioBriefDraftVersion(database, {
        versionId: "version-1",
        briefId: "brief-m15",
        parentVersionId: null,
        contentHash: "c".repeat(64),
        actorId: "operator@example.test",
        actorType: "human",
        reason: "draft_created",
        validationScore: 100,
        snapshotStorage: "d1",
        snapshotKey: "studio-brief-draft:brief-m15:version-1",
        snapshotSha256: "d".repeat(64),
        createdAt: "2026-05-31T01:03:00.000Z",
      });

      const run = await getStudioBriefAgentRun(database, {
        briefId: "brief-m15",
        runId: "run-1",
      });
      const proposal = await getStudioBriefAgentProposal(database, {
        briefId: "brief-m15",
        proposalId: "proposal-1",
      });
      const version = await getStudioBriefDraftVersion(database, {
        briefId: "brief-m15",
        versionId: "version-1",
      });
      const snapshot = await getStudioBriefDraftVersionSnapshot(database, {
        briefId: "brief-m15",
        snapshotKey: "studio-brief-draft:brief-m15:version-1",
      });
      const versions = await listStudioBriefDraftVersions(database, "brief-m15");

      expect(run).toMatchObject({
        status: "needs_approval",
        proposal_id: "proposal-1",
        trigger_json: JSON.stringify({ message: "Draft this brief." }),
      });
      expect(proposal).toMatchObject({
        proposal_id: "proposal-1",
        status: "applied",
        preview_hash: "b".repeat(64),
        accepted_operation_ids_json: JSON.stringify(["op-1"]),
      });
      expect(version?.version_id).toBe("version-1");
      expect(snapshot?.snapshot_json).toContain("## Updated");
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        version_id: "version-1",
        actor_type: "human",
        snapshot_storage: "d1",
      });
    } finally {
      sqlite.close();
    }
  });

  test("persists draft records with parsed claims and validation arrays", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await updateStudioBriefDraftValidation(database, {
        briefId: "brief-m15",
        score: 72,
        weakClaims: [2],
        missingEvidence: [2],
        blockingIssues: ["Needs stronger evidence."],
        validatedAt: "2026-05-31T00:05:00.000Z",
      });

      const record = await getStudioBriefDraftRecord(database, "brief-m15");
      expect(record?.draft.body_md).toBe("## Initial draft\n\nInitial summary");
      expect(record?.draft.validation_score).toBe(72);
      expect(record?.draft.validation_weak_claims_json).toBe("[2]");
      expect(record?.draft.validation_blocking_issues_json).toBe(
        JSON.stringify(["Needs stronger evidence."]),
      );
      expect(record?.claims.map((claim) => claim.claim_n)).toEqual([1, 2]);
      expect(record?.claims[0]?.evidence_ids_json).toBe(JSON.stringify(["evidence-1"]));
    } finally {
      sqlite.close();
    }
  });

  test("updates draft body markdown independently from typed blocks", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await updateStudioBriefDraftMetadata(database, {
        briefId: "brief-m15",
        updatedAt: "2026-05-31T00:10:00.000Z",
        bodyMd: "## Updated body\n\n:::segment-card{ref=blk_madison_pm}\n:::",
      });

      const record = await getStudioBriefDraftRecord(database, "brief-m15");
      expect(record?.draft.body_md).toBe(
        "## Updated body\n\n:::segment-card{ref=blk_madison_pm}\n:::",
      );
      expect(record?.draft.updated_at).toBe("2026-05-31T00:10:00.000Z");
    } finally {
      sqlite.close();
    }
  });

  test("updates and renumbers claims after deletion", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await updateStudioBriefDraftClaim(database, {
        briefId: "brief-m15",
        claimN: 2,
        updatedAt: "2026-05-31T00:06:00.000Z",
        title: "Updated second claim",
        evidenceIds: ["evidence-2"],
      });
      await deleteStudioBriefDraftClaim(database, {
        briefId: "brief-m15",
        claimN: 1,
        updatedAt: "2026-05-31T00:07:00.000Z",
      });

      const record = await getStudioBriefDraftRecord(database, "brief-m15");
      expect(record?.claims).toHaveLength(1);
      expect(record?.claims[0]).toEqual(
        expect.objectContaining({
          claim_n: 1,
          title: "Updated second claim",
          evidence_ids_json: JSON.stringify(["evidence-2"]),
        }),
      );
    } finally {
      sqlite.close();
    }
  });

  test("persists typed draft blocks with parsed draft records", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await insertStudioBriefDraftBlock(database, {
        briefId: "brief-m15",
        blockId: "blk_madison_pm",
        blockType: "segment-card",
        blockJson: JSON.stringify({
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
        }),
        createdAt: "2026-05-31T00:08:00.000Z",
        updatedAt: "2026-05-31T00:08:00.000Z",
      });
      await updateStudioBriefDraftBlock(database, {
        briefId: "brief-m15",
        blockId: "blk_madison_pm",
        blockType: "segment-card",
        blockJson: JSON.stringify({
          id: "blk_madison_pm",
          type: "segment-card",
          title: "Updated Madison segment",
          routeId: "M15",
          routeLabel: "M15 SBS",
          direction: "NB",
          from: "E 28 St",
          to: "E 58 St",
          metrics: { avgSpeedMph: 5.1 },
          refs: [],
        }),
        updatedAt: "2026-05-31T00:09:00.000Z",
      });

      const record = await getStudioBriefDraftRecord(database, "brief-m15");
      expect(record?.blocks).toHaveLength(1);
      expect(record?.blocks[0]).toEqual(
        expect.objectContaining({
          block_id: "blk_madison_pm",
          block_type: "segment-card",
          updated_at: "2026-05-31T00:09:00.000Z",
        }),
      );

      await deleteStudioBriefDraftBlock(database, {
        briefId: "brief-m15",
        blockId: "blk_madison_pm",
      });
      const updated = await getStudioBriefDraftRecord(database, "brief-m15");
      expect(updated?.blocks).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  test("records idempotency, history, publish, and retract state", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await recordStudioBriefWriteIdempotency(database, {
        idempotencyKey: "key-1",
        method: "POST",
        path: "/api/v1/studio/briefs/brief-m15/draft/claims",
        statusCode: 200,
        responseJson: JSON.stringify({ ok: true }),
        createdAt: "2026-05-31T00:01:00.000Z",
      });
      await insertStudioBriefHistoryEvent(database, {
        eventId: "event-1",
        briefId: "brief-m15",
        action: "draft.updated",
        actor: "Operator",
        summary: "Updated draft.",
        draftVersion: "v1",
        snapshotJson: "{}",
        createdAt: "2026-05-31T00:02:00.000Z",
      });
      await markStudioBriefDraftPublishCandidate(database, {
        briefId: "brief-m15",
        publishedAt: "2026-05-31T00:03:00.000Z",
      });
      await markStudioBriefDraftRetracted(database, {
        briefId: "brief-m15",
        retractedAt: "2026-05-31T00:04:00.000Z",
      });

      const replay = await getStudioBriefWriteIdempotency(database, {
        idempotencyKey: "key-1",
        method: "POST",
        path: "/api/v1/studio/briefs/brief-m15/draft/claims",
      });
      const history = await listStudioBriefHistoryEvents(database, "brief-m15");
      const record = await getStudioBriefDraftRecord(database, "brief-m15");

      expect(replay?.status_code).toBe(200);
      expect(history.map((event) => event.event_seq)).toEqual([1]);
      expect(record?.draft.status).toBe("retracted");
      expect(record?.draft.published_at).toBe("2026-05-31T00:03:00.000Z");
    } finally {
      sqlite.close();
    }
  });

  test("persists anchored review threads, replies, and resolution state", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await insertStudioBriefReviewThread(database, {
        commentId: "comment-1",
        briefId: "brief-m15",
        reviewer: "reviewer@example.test",
        reviewerDisplayName: "Reviewer",
        message: "Use the shorter sentence.",
        kind: "suggested-edit",
        anchorJson: JSON.stringify({
          target: "body",
          targetId: null,
          quote: { exact: "Initial summary" },
        }),
        suggestionJson: JSON.stringify({
          suggestFrom: "Initial summary",
          suggestTo: "Tighter summary",
        }),
        createdAt: "2026-05-31T00:10:00.000Z",
      });
      await insertStudioBriefReviewReply(database, {
        commentId: "reply-1",
        briefId: "brief-m15",
        parentCommentId: "comment-1",
        reviewer: "author@example.test",
        reviewerDisplayName: "Author",
        message: "Accepted.",
        createdAt: "2026-05-31T00:11:00.000Z",
      });
      await updateStudioBriefReviewComment(database, {
        briefId: "brief-m15",
        commentId: "comment-1",
        updatedAt: "2026-05-31T00:12:00.000Z",
        status: "resolved",
        resolvedBy: "author@example.test",
      });

      const record = await getStudioBriefDraftRecord(database, "brief-m15");
      const comment = await getStudioBriefReviewComment(database, {
        briefId: "brief-m15",
        commentId: "comment-1",
      });

      expect(record?.reviewComments).toHaveLength(2);
      expect(comment).toMatchObject({
        comment_id: "comment-1",
        kind: "suggested-edit",
        status: "resolved",
        resolved_by: "author@example.test",
      });
      expect(comment?.anchor_json).toContain("Initial summary");
      expect(comment?.suggestion_json).toContain("Tighter summary");
      expect(record?.reviewComments[1]).toMatchObject({
        comment_id: "reply-1",
        parent_comment_id: "comment-1",
      });
    } finally {
      sqlite.close();
    }
  });

  test("persists draft refs and promotion receipt metadata", async () => {
    const { database, sqlite } = await createTestD1();
    try {
      await seedDraft(database);
      await replaceStudioBriefDraftRefs(database, {
        briefId: "brief-m15",
        refs: [
          {
            refId: "block:blk-1",
            refKind: "block",
            refJson: JSON.stringify({
              id: "block:blk-1",
              kind: "block",
              blockId: "blk-1",
              blockType: "finding",
            }),
          },
          {
            refId: "evidence:evidence-1",
            refKind: "evidence",
            refJson: JSON.stringify({
              id: "evidence:evidence-1",
              kind: "evidence",
              evidenceId: "evidence-1",
              role: "primary",
              label: "Observed speed",
            }),
          },
        ],
        updatedAt: "2026-05-31T00:20:00.000Z",
      });
      await markStudioBriefDraftPublishCandidate(database, {
        briefId: "brief-m15",
        publishedAt: "2026-05-31T00:21:00.000Z",
      });
      await recordStudioBriefPromotionReceipt(database, {
        briefId: "brief-m15",
        candidateId: "brief-m15:2026-05-31T00:21:00.000Z",
        targetBriefId: "brief-m15",
        artifactKey: "studio/v1/publish-candidates/brief-m15.json",
        artifactSha256: "a".repeat(64),
        recordedAt: "2026-05-31T00:22:00.000Z",
      });

      const record = await getStudioBriefDraftRecord(database, "brief-m15");

      expect(record?.refs).toHaveLength(2);
      expect(record?.refs[0]).toMatchObject({ ref_id: "block:blk-1", ref_kind: "block" });
      expect(record?.draft).toMatchObject({
        status: "published",
        promotion_candidate_id: "brief-m15:2026-05-31T00:21:00.000Z",
        promotion_target_brief_id: "brief-m15",
        promotion_artifact_sha256: "a".repeat(64),
        promotion_recorded_at: "2026-05-31T00:22:00.000Z",
      });
    } finally {
      sqlite.close();
    }
  });
});

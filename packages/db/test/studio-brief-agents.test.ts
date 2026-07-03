import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createD1ServingDb,
  type D1ServingDb,
  getStudioBriefAgentProposal,
  getStudioBriefAgentRun,
  getStudioBriefDraftVersion,
  getStudioBriefDraftVersionSnapshot,
  insertStudioBriefAgentProposal,
  insertStudioBriefAgentRun,
  insertStudioBriefDraftVersion,
  insertStudioBriefDraftVersionSnapshot,
  listStudioBriefDraftVersions,
  updateStudioBriefAgentProposalStatus,
  updateStudioBriefAgentRunStatus,
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

describe("studio brief agent D1 queries", () => {
  test("persists agent runs, proposals, and version milestones", async () => {
    const { database, sqlite } = await createTestD1();
    try {
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
});

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalPlan097Json, type Plan097BatchStatement } from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  applyPlan097CompactedBatch,
  buildPlan097CompactedBatch,
} from "../../src/lib/plan097-recovery-batch.ts";
import {
  assertPlan097ProtectedFingerprints,
  buildPlan097SelectiveRestoreBatch,
  capturePlan097SelectiveSnapshot,
  provePlan097ActivationAndRestore,
} from "../../src/lib/plan097-selective-restore.ts";

const oldPublishedAt = "2026-07-01T12:00:00.000Z";
const candidatePublishedAt = "2026-07-22T12:00:00.000Z";
const oldReleaseId = releaseIdFromPublishedAt(oldPublishedAt);
const candidate = decodeStrict(ReleaseIdentitySchema)({
  releaseId: releaseIdFromPublishedAt(candidatePublishedAt),
  publishedAt: candidatePublishedAt,
  coverage: { start: "2025-02", end: "2026-05" },
});

const schemaSql = `
CREATE TABLE route_catalog (route_id TEXT PRIMARY KEY, route_short_name TEXT NOT NULL);
CREATE TABLE route_brief_summary (route_id TEXT NOT NULL, month TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY (route_id, month));
CREATE TABLE route_batch_status (month TEXT PRIMARY KEY, generated_at TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE route_month_source_status (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  source_scope TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (route_id, month, source_scope, source_id)
);
CREATE TABLE exact_route_identity_release (release_id TEXT PRIMARY KEY, published_at TEXT NOT NULL);
CREATE TABLE map_release_catalog (
  release_id TEXT PRIMARY KEY,
  published_at TEXT NOT NULL,
  coverage_start TEXT,
  coverage_end TEXT NOT NULL,
  manifest_key TEXT NOT NULL UNIQUE,
  manifest_sha256 TEXT NOT NULL,
  release_profile TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  route_count INTEGER NOT NULL
);
CREATE TABLE identity (id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
CREATE TABLE identity_session (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, token_hash TEXT NOT NULL);
CREATE TABLE studio_actor_role (identity_id TEXT PRIMARY KEY, role TEXT NOT NULL);
CREATE TABLE alert (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, rule TEXT NOT NULL);
CREATE TABLE saved_search (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, query TEXT NOT NULL);
CREATE TABLE public_comment (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE route_observed_reliability_summary (route_id TEXT, month TEXT, run_id TEXT, PRIMARY KEY (route_id, month, run_id));
CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT);
`;

const recoverySeedSql = `
DELETE FROM "route_catalog";
DELETE FROM "route_brief_summary" WHERE "month" = '2026-05';
DELETE FROM "route_month_source_status" WHERE "month" = '2026-05' AND NOT ("source_scope" = 'reliability' AND "source_id" IN ('observedHeadways', 'bunching', 'waitTimeReliability'));
DELETE FROM "route_batch_status" WHERE "month" = '2026-05';
INSERT INTO "route_catalog" VALUES ('B44+', 'B44-SBS');
INSERT INTO "route_brief_summary" VALUES ('B44+', '2026-05', 'Candidate');
INSERT INTO "route_month_source_status" VALUES ('B44+', '2026-05', 'reviewed', 'routeSpeed', 'complete');
INSERT INTO "route_batch_status" VALUES ('2026-05', '${candidatePublishedAt}', 'pass');
`;

function registrationStatements(): Plan097BatchStatement[] {
  return [
    {
      sql: `INSERT INTO exact_route_identity_release VALUES ('${candidate.releaseId}', '${candidate.publishedAt}')`,
      params: [],
      table: "exact_route_identity_release",
      kind: "registration",
      rowCount: 1,
    },
    {
      sql: `INSERT INTO map_release_catalog VALUES ('${candidate.releaseId}', '${candidate.publishedAt}', '2025-02', '2026-05', 'map/2026-05/manifest.json', '${"a".repeat(64)}', 'full', 'pass', 1)`,
      params: [],
      table: "map_release_catalog",
      kind: "registration",
      rowCount: 1,
    },
  ];
}

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec(schemaSql);
  sqlite.exec(`
    INSERT INTO route_catalog VALUES ('B44', 'B44');
    INSERT INTO route_brief_summary VALUES ('B44', '2026-04', 'Previous');
    INSERT INTO route_brief_summary VALUES ('B44', '2026-05', 'Old candidate-month row');
    INSERT INTO route_batch_status VALUES ('2026-04', '${oldPublishedAt}', 'pass');
    INSERT INTO route_month_source_status VALUES ('B44', '2026-05', 'reviewed', 'routeSpeed', 'old');
    INSERT INTO route_month_source_status VALUES ('B44', '2026-05', 'reliability', 'observedHeadways', 'live');
    INSERT INTO exact_route_identity_release VALUES ('${oldReleaseId}', '${oldPublishedAt}');
    INSERT INTO map_release_catalog VALUES ('${oldReleaseId}', '${oldPublishedAt}', '2025-01', '2026-04', 'map/2026-04/manifest.json', '${"b".repeat(64)}', 'full', 'pass', 1);
    INSERT INTO identity VALUES ('person-1', 'Redacted User');
    INSERT INTO identity_session VALUES ('session-1', 'person-1', 'secret-hash');
    INSERT INTO studio_actor_role VALUES ('person-1', 'operator');
    INSERT INTO alert VALUES ('alert-1', 'person-1', 'delay');
    INSERT INTO saved_search VALUES ('search-1', 'person-1', 'B44');
    INSERT INTO public_comment VALUES ('comment-1', 'person-1', 'hello');
    INSERT INTO route_observed_reliability_summary VALUES ('B44', '2026-05', 'live-run');
    INSERT INTO d1_migrations VALUES (34, '0034_exact_route_identity_release.sql', NULL);
  `);
  const activationBatch = buildPlan097CompactedBatch({
    schemaSql,
    recoverySeedSql,
    registrations: registrationStatements(),
  });
  const snapshot = capturePlan097SelectiveSnapshot({
    sqlite,
    activationBatch,
    candidate,
    capturedAt: candidatePublishedAt,
  });
  const snapshotText = `${canonicalPlan097Json(snapshot)}\n`;
  const snapshotSha256 = createHash("sha256").update(snapshotText).digest("hex");
  return { sqlite, activationBatch, snapshot, snapshotSha256 };
}

describe("Plan 097 selective serving restore", () => {
  test("proves A→B→A while preserving user and current-signal fingerprints", () => {
    const { sqlite, activationBatch, snapshot, snapshotSha256 } = fixture();
    try {
      expect(snapshot.previousElection).toEqual({
        studioReleaseId: oldReleaseId,
        mapReleaseId: oldReleaseId,
        exactRouteReleaseId: oldReleaseId,
      });
      expect(snapshot.tables.map((table) => table.table)).toEqual([
        "route_catalog",
        "route_brief_summary",
        "route_month_source_status",
        "route_batch_status",
      ]);
      const proof = provePlan097ActivationAndRestore({
        sqlite,
        activationBatch,
        snapshot,
        snapshotSha256,
      });
      expect(proof.finalElection).toEqual(snapshot.previousElection);
      expect(proof.restoreBatch.statements.at(-1)).toMatchObject({
        table: "route_batch_status",
        kind: "activation",
      });
      expect(sqlite.query("SELECT route_id FROM route_catalog").all()).toEqual([
        { route_id: "B44" },
      ]);
      expect(
        sqlite.query("SELECT release_id FROM map_release_catalog ORDER BY published_at").all(),
      ).toEqual([{ release_id: oldReleaseId }]);
      expect(sqlite.query("SELECT release_id FROM exact_route_identity_release").all()).toEqual([
        { release_id: oldReleaseId },
      ]);
      expect(
        sqlite
          .query("SELECT source_id, status FROM route_month_source_status ORDER BY source_id")
          .all(),
      ).toEqual([
        { source_id: "observedHeadways", status: "live" },
        { source_id: "routeSpeed", status: "old" },
      ]);
      assertPlan097ProtectedFingerprints({
        sqlite,
        expected: snapshot.protectedFingerprints,
      });
    } finally {
      sqlite.close();
    }
  });

  test("rolls back an injected restore failure without exposing a partial old cut", () => {
    const { sqlite, activationBatch, snapshot, snapshotSha256 } = fixture();
    try {
      applyPlan097CompactedBatch({ sqlite, batch: activationBatch });
      const restoreBatch = buildPlan097SelectiveRestoreBatch({ snapshot, snapshotSha256 });
      const failBeforeStatement = restoreBatch.statements.findIndex(
        (statement) => statement.kind === "activation",
      );
      expect(() =>
        applyPlan097CompactedBatch({ sqlite, batch: restoreBatch, failBeforeStatement }),
      ).toThrow("Injected Plan 097 failure");
      expect(sqlite.query("SELECT route_id FROM route_catalog").all()).toEqual([
        { route_id: "B44+" },
      ]);
      expect(
        sqlite
          .query("SELECT release_id FROM map_release_catalog ORDER BY published_at DESC LIMIT 1")
          .get(),
      ).toEqual({ release_id: candidate.releaseId });
    } finally {
      sqlite.close();
    }
  });

  test("rejects snapshot receipt drift", () => {
    const { sqlite, snapshot, snapshotSha256 } = fixture();
    try {
      const routeCatalog = snapshot.tables.find((table) => table.table === "route_catalog");
      if (routeCatalog === undefined) throw new Error("missing fixture snapshot");
      const tampered = {
        ...snapshot,
        tables: snapshot.tables.map((table) =>
          table.table === "route_catalog"
            ? {
                ...table,
                rows: table.rows.map((row, index) =>
                  index === 0 ? ["tampered", ...row.slice(1)] : row,
                ),
              }
            : table,
        ),
      };
      expect(() =>
        buildPlan097SelectiveRestoreBatch({ snapshot: tampered, snapshotSha256 }),
      ).toThrow("snapshot hash");
    } finally {
      sqlite.close();
    }
  });
});

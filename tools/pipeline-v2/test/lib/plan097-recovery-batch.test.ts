import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  applyPlan097CompactedBatch,
  buildPlan097CompactedBatch,
} from "../../src/lib/plan097-recovery-batch.ts";

const schemaSql = `
CREATE TABLE route_catalog (route_id TEXT PRIMARY KEY, route_short_name TEXT NOT NULL);
CREATE TABLE route_batch_issue (month TEXT NOT NULL, issue_rank INTEGER NOT NULL, message TEXT NOT NULL, PRIMARY KEY (month, issue_rank));
CREATE TABLE route_batch_status (month TEXT PRIMARY KEY, generated_at TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE route_observed_reliability_summary (route_id TEXT, month TEXT, run_id TEXT, PRIMARY KEY (route_id, month, run_id));
CREATE TABLE route_scorecard_citation (route_id TEXT, month TEXT, citation_rank INTEGER, title TEXT, PRIMARY KEY (route_id, month, citation_rank));
`;

const recoverySeedSql = `
DELETE FROM "route_catalog";
DELETE FROM "route_batch_issue" WHERE "month" = '2026-05';
DELETE FROM "route_batch_status" WHERE "month" = '2026-05';
INSERT INTO "route_catalog" ("route_id", "route_short_name") VALUES ('B44', 'B44'), ('B44+', 'B44-SBS');
INSERT INTO "route_batch_issue" ("month", "issue_rank", "message") VALUES ('2026-05', 1, 'fixture');
INSERT INTO "route_batch_status" ("month", "generated_at", "status") VALUES ('2026-05', '2026-07-22T12:00:00.000Z', 'pass');
`;

describe("Plan 097 compacted transactional batch", () => {
  test("compacts rows into one-bound-parameter JSON1 statements with activation last", () => {
    const batch = buildPlan097CompactedBatch({ schemaSql, recoverySeedSql });
    expect(batch.metrics.originalStatementCount).toBe(6);
    expect(batch.metrics.compactedStatementCount).toBeLessThanOrEqual(6);
    expect(batch.metrics.maxParametersPerStatement).toBe(1);
    expect(batch.statements.at(-1)).toMatchObject({
      table: "route_batch_status",
      kind: "activation",
    });
    expect(batch.statements.every((statement) => statement.params.length <= 100)).toBe(true);
  });

  test("preserves protected rows and rolls the whole batch back on injected failure", () => {
    const batch = buildPlan097CompactedBatch({ schemaSql, recoverySeedSql });
    const sqlite = new Database(":memory:");
    sqlite.exec(schemaSql);
    sqlite.exec(`
      INSERT INTO route_catalog VALUES ('OLD', 'Old');
      INSERT INTO route_observed_reliability_summary VALUES ('B44', '2026-05', 'live');
      INSERT INTO route_scorecard_citation VALUES ('B44', '2026-05', 1, 'Source');
    `);
    const failBeforeStatement = batch.statements.findIndex(
      (statement) => statement.kind === "activation",
    );
    expect(() => applyPlan097CompactedBatch({ sqlite, batch, failBeforeStatement })).toThrow(
      "Injected Plan 097 failure",
    );
    expect(sqlite.query("SELECT route_id FROM route_catalog").all()).toEqual([{ route_id: "OLD" }]);

    applyPlan097CompactedBatch({ sqlite, batch });
    expect(sqlite.query("SELECT route_id FROM route_catalog ORDER BY route_id").all()).toEqual([
      { route_id: "B44" },
      { route_id: "B44+" },
    ]);
    expect(sqlite.query("SELECT run_id FROM route_observed_reliability_summary").get()).toEqual({
      run_id: "live",
    });
    expect(sqlite.query("SELECT title FROM route_scorecard_citation").get()).toEqual({
      title: "Source",
    });
    expect(sqlite.query("SELECT status FROM route_batch_status").get()).toEqual({
      status: "pass",
    });
    sqlite.close();
  });

  test("fails closed on an unclassified mutation target", () => {
    expect(() =>
      buildPlan097CompactedBatch({
        schemaSql: `${schemaSql}\nCREATE TABLE identity (id TEXT PRIMARY KEY);`,
        recoverySeedSql: `DELETE FROM "identity";`,
      }),
    ).toThrow("Unclassified Plan 097 delete");
  });
});

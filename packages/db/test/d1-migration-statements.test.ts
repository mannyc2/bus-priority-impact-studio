import { expect, test } from "bun:test";
import {
  parseD1MigrationStatements,
  rewriteD1RemoteSafeTrigger,
} from "../scripts/d1-migration-statements";

test("D1 migration statement parsing keeps nested CASE trigger bodies whole", () => {
  const migration = `CREATE TRIGGER example
BEFORE UPDATE ON target
BEGIN
  SELECT CASE
    WHEN NEW.value = OLD.value THEN RAISE(ABORT, 'END; is data')
  END;
END;

CREATE TABLE next_table (id TEXT PRIMARY KEY);`;

  const statements = parseD1MigrationStatements(migration);

  expect(statements).toHaveLength(2);
  expect(statements[0]).toContain("  END;\nEND;");
  expect(statements[1]).toBe("CREATE TABLE next_table (id TEXT PRIMARY KEY);");
});

test("D1 remote-safe rewrites remove CASE compounds from the three guarded triggers", async () => {
  const source = await Bun.file(
    new URL("../migrations/d1-v2/0000_atomic_serving_release.sql", import.meta.url),
  ).text();
  const statements = parseD1MigrationStatements(source).map(rewriteD1RemoteSafeTrigger);
  const guarded = statements.filter((statement) =>
    [
      "serving_active_release_validate_cas",
      "serving_active_release_commit",
      "serving_candidate_ready_guard",
    ].some((name) => statement.startsWith(`CREATE TRIGGER ${name}\n`)),
  );

  expect(guarded).toHaveLength(3);
  expect(guarded.every((statement) => !/\bCASE\b/.test(statement))).toBe(true);
  expect(guarded.every((statement) => statement.includes("SELECT RAISE(ABORT"))).toBe(true);
});

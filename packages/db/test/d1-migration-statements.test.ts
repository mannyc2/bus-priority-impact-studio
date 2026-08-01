import { expect, test } from "bun:test";
import { parseD1MigrationStatements } from "../scripts/d1-migration-statements";

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

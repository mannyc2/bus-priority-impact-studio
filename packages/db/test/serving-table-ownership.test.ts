import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { getTableName, isTable } from "drizzle-orm";
import * as schema from "../src/d1/schema.js";
import { D1_SERVING_TABLE_OWNERSHIP } from "../src/d1/serving-table-ownership.js";

const dbRoot = new URL("../", import.meta.url);

function seedTargetExports(): Set<string> {
  const source = readFileSync(new URL("src/d1/seed/build-seed-sql.ts", dbRoot), "utf8");
  return new Set(
    [...source.matchAll(/seedDb\s*\.\s*(?:delete|insert)\(\s*([A-Za-z][A-Za-z0-9]*)\s*\)/gu)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined),
  );
}

describe("Plan 098 D1 table ownership", () => {
  test("classifies every legacy migration and exported D1 table exactly once", () => {
    const schemaTables = Object.values(schema).filter(isTable).map(getTableName);
    const migrationRoot = new URL("src/d1/../../migrations/d1/", dbRoot);
    const migrationTables = readdirSync(migrationRoot)
      .filter((filename) => filename.endsWith(".sql"))
      .flatMap((filename) => {
        const sql = readFileSync(new URL(filename, migrationRoot), "utf8");
        return [...sql.matchAll(/CREATE TABLE [`"]?([a-zA-Z0-9_]+)/gu)].flatMap((match) =>
          match[1] === undefined ? [] : [match[1]],
        );
      });
    expect(Object.keys(D1_SERVING_TABLE_OWNERSHIP).toSorted()).toEqual(
      [...new Set([...schemaTables, ...migrationTables])].toSorted(),
    );
  });

  test("keeps both seed writers away from live-write tables", () => {
    const schemaExports = new Map(Object.entries(schema));
    for (const exportName of seedTargetExports()) {
      const table = schemaExports.get(exportName);
      expect(isTable(table), `Unknown seed target export ${exportName}`).toBe(true);
      if (!isTable(table)) continue;
      const tableName = getTableName(table) as keyof typeof D1_SERVING_TABLE_OWNERSHIP;
      expect(
        ["generated_candidate", "mixed_legacy_requires_split"],
        `Unsafe seed ownership for ${tableName}`,
      ).toContain(D1_SERVING_TABLE_OWNERSHIP[tableName].owner);
    }
  });

  test("keeps the two known mixed legacy tables explicit", () => {
    expect(
      Object.entries(D1_SERVING_TABLE_OWNERSHIP)
        .filter(([, value]) => value.owner === "mixed_legacy_requires_split")
        .map(([table]) => table)
        .toSorted(),
    ).toEqual(["route_month_source_status", "route_observed_reliability_summary"]);
  });
});

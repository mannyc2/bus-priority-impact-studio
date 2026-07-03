import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import { listSourceMonthCoverage } from "../src/d1/index.js";

async function createDrizzleTestDb(): Promise<Database> {
  const sqlite = new Database(":memory:");
  const migrationsDir = new URL("../migrations/d1/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    sqlite.exec(await Bun.file(new URL(filename, migrationsDir)).text());
  }
  return sqlite;
}

describe("Snapshot coverage D1 read model", () => {
  test("normalizes legacy display months from source month coverage rows", async () => {
    const sqlite = await createDrizzleTestDb();
    sqlite
      .query(
        `INSERT INTO source_month_coverage (
          source_id,
          month,
          label,
          source_kind,
          grain,
          status,
          row_count,
          route_count,
          note,
          generated_at,
          artifact_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "local_route_segment_speed",
        "March 2026",
        "Route segment speed rows",
        "source_table",
        "route x month x segment/hour speed observation",
        "available",
        4200,
        350,
        null,
        "2026-06-06T00:00:00.000Z",
        "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
      );

    const rows = await listSourceMonthCoverage(createBunSqliteServingDb(sqlite));

    expect(rows).toEqual([
      expect.objectContaining({
        sourceId: "local_route_segment_speed",
        month: "2026-03",
      }),
    ]);
  });
});

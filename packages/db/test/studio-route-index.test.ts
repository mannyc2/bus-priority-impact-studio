import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import { listStudioRouteIndexSourceRows } from "../src/d1/index.js";

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

describe("Studio route index D1 read model", () => {
  test("treats route speed-history coverage as optional for older serving schemas", async () => {
    const sqlite = await createDrizzleTestDb();
    sqlite.exec("DROP TABLE route_speed_history_coverage");
    sqlite
      .query(
        `INSERT INTO route_catalog (
          route_id,
          route_short_name,
          route_long_name,
          shape_count,
          stop_count,
          timepoint_stop_count
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("M15+", "M15+", "Select Bus Service", 12, 80, 16);
    sqlite.exec(
      "INSERT INTO route_catalog_type (route_id, type_rank, route_type) VALUES ('M15+', 1, 'SBS')",
    );
    sqlite.exec(
      "INSERT INTO route_catalog_trip_type (route_id, trip_type_rank, trip_type) VALUES ('M15+', 1, '14')",
    );

    const rows = await listStudioRouteIndexSourceRows(createBunSqliteServingDb(sqlite), "2026-03");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      routeId: "M15+",
      routeTypes: ["SBS"],
      tripTypes: ["14"],
      speedHistoryCoverage: null,
    });
  });
});

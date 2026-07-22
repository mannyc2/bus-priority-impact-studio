import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import {
  findEarliestSpeedTrendMonth,
  findLatestPublishedStudioServingRelease,
  findLatestSpeedTrendMonth,
  listStudioRouteIndexSourceRows,
} from "../src/d1/index.js";

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

function insertRouteSummary(sqlite: Database, month: string, routeId = "M1"): void {
  sqlite
    .query(
      `INSERT INTO route_brief_summary (
        route_id,
        month,
        route_score,
        public_visible,
        public_visibility_reason,
        average_speed_mph,
        hotspot_count,
        total_ridership,
        total_transfers,
        ace_active,
        ace_violation_count,
        bus_lane_matched_lane_count,
        schedule_match_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(routeId, month, 42, 1, "public", 7.2, 3, 10_000, 500, 0, 0, 2, 0.9);
}

function insertRouteBatch(
  sqlite: Database,
  month: string,
  generatedAt: string,
  status: "running" | "pass" | "fail",
): void {
  sqlite
    .query(
      `INSERT INTO route_batch_status (
        month,
        generated_at,
        status,
        route_count,
        artifact_count,
        missing_artifact_count,
        hash_mismatch_count,
        byte_length_mismatch_count,
        total_byte_length,
        issue_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(month, generatedAt, status, 1, 1, 0, 0, 0, 100, status === "pass" ? 0 : 1);
}

function insertTrend(
  sqlite: Database,
  routeId: string,
  month: string,
  hasSpeedTrend: boolean,
): void {
  sqlite
    .query(
      `INSERT INTO route_month_trend (
        route_id,
        month,
        speed_observation_count,
        speed_bus_trip_count,
        average_speed_mph,
        ridership,
        transfers,
        has_speed_trend,
        has_ridership_trend
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      routeId,
      month,
      hasSpeedTrend ? 10 : 0,
      hasSpeedTrend ? 100 : 0,
      7.2,
      null,
      null,
      hasSpeedTrend ? 1 : 0,
      0,
    );
}

describe("Studio route index D1 read model", () => {
  test("resolves the latest passing published serving batch and speed coverage", async () => {
    const sqlite = await createDrizzleTestDb();
    insertRouteSummary(sqlite, "2026-01");
    insertRouteBatch(sqlite, "2026-01", "2026-02-10T12:00:00.000Z", "pass");
    insertRouteSummary(sqlite, "2026-02");
    insertRouteBatch(sqlite, "2026-02", "2026-03-10T12:00:00.000Z", "pass");
    insertRouteSummary(sqlite, "2026-03");
    insertRouteBatch(sqlite, "2026-03", "2026-04-10T12:00:00.000Z", "fail");
    insertRouteBatch(sqlite, "2026-04", "2026-05-10T12:00:00.000Z", "pass");
    insertTrend(sqlite, "M1", "2023-04", true);
    insertTrend(sqlite, "M1", "2024-01", false);
    insertTrend(sqlite, "M1", "2026-02", true);

    const db = createBunSqliteServingDb(sqlite);
    await expect(findLatestPublishedStudioServingRelease(db)).resolves.toEqual({
      end: "2026-02",
      publishedAt: "2026-03-10T12:00:00.000Z",
    });
    await expect(findEarliestSpeedTrendMonth(db)).resolves.toBe("2023-04");
    await expect(findLatestSpeedTrendMonth(db)).resolves.toBe("2026-02");
  });

  test("does not publish an empty or non-passing serving batch", async () => {
    const sqlite = await createDrizzleTestDb();
    const db = createBunSqliteServingDb(sqlite);
    await expect(findLatestPublishedStudioServingRelease(db)).resolves.toBeNull();

    insertRouteSummary(sqlite, "2026-03");
    insertRouteBatch(sqlite, "2026-03", "2026-04-10T12:00:00.000Z", "fail");
    await expect(findLatestPublishedStudioServingRelease(db)).resolves.toBeNull();
  });

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

  test("treats route catalog trip types as optional for the published legacy schema", async () => {
    const sqlite = await createDrizzleTestDb();
    sqlite.exec("DROP TABLE route_catalog_trip_type");
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
      .run("B44+", "B44+", "Select Bus Service", 8, 64, 12);
    sqlite.exec(
      "INSERT INTO route_catalog_type (route_id, type_rank, route_type) VALUES ('B44+', 1, 'SBS')",
    );

    const rows = await listStudioRouteIndexSourceRows(createBunSqliteServingDb(sqlite), "2026-03");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      routeId: "B44+",
      routeTypes: ["SBS"],
      tripTypeCatalogAvailable: false,
      tripTypes: [],
    });
  });
});

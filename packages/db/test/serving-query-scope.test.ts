import { Database, type SQLQueryBindings } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import type { D1Database } from "@cloudflare/workers-types";
import { createD1ServingDb, scopeServingQuery } from "../src/d1/client.js";
import { listRouteMonthTrends } from "../src/d1/queries/route-month-trends.js";

class BunD1Statement {
  readonly #database: Database;
  readonly #sql: string;
  #bindings: SQLQueryBindings[] = [];

  constructor(database: Database, sql: string) {
    this.#database = database;
    this.#sql = sql;
  }

  bind(...values: SQLQueryBindings[]): BunD1Statement {
    this.#bindings = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.#database.query(this.#sql).get(...this.#bindings) as T | null) ?? null;
  }

  async all<T>(): Promise<{ success: true; results: T[] }> {
    return {
      success: true,
      results: this.#database.query(this.#sql).all(...this.#bindings) as T[],
    };
  }

  async raw<T>(): Promise<T[]> {
    return this.#database.query(this.#sql).values(...this.#bindings) as T[];
  }

  async run(): Promise<{ success: true }> {
    this.#database.query(this.#sql).run(...this.#bindings);
    return { success: true };
  }
}

function asD1(database: Database): D1Database {
  return {
    prepare: (sql: string) => new BunD1Statement(database, sql),
  } as unknown as D1Database;
}

async function migratedDatabase(): Promise<Database> {
  const database = new Database(":memory:");
  for (const directory of ["../migrations/d1/", "../migrations/d1-v2/"]) {
    const migrations = new URL(directory, import.meta.url);
    for (const filename of (await readdir(migrations))
      .filter((candidate) => candidate.endsWith(".sql"))
      .toSorted()) {
      database.exec(await Bun.file(new URL(filename, migrations)).text());
    }
  }
  return database;
}

function trendValues(averageSpeedMph: number): SQLQueryBindings[] {
  return ["BX38", "2026-06", 10, 20, averageSpeedMph, 100, 5, 1, 1];
}

describe("Plan 098 candidate-scoped D1 reads", () => {
  test("rewrites every generated FROM/JOIN with bindings before query parameters", () => {
    expect(
      scopeServingQuery(
        'select * from "route_catalog" inner join "route_month_trend" on 1 = 1 where "route_catalog"."route_id" = ?',
        "candidate-a",
      ),
    ).toEqual({
      query:
        'select * from (SELECT * FROM "route_catalog_v2" WHERE candidate_id = ?) AS "route_catalog" inner join (SELECT * FROM "route_month_trend_v2" WHERE candidate_id = ?) AS "route_month_trend" on 1 = 1 where "route_catalog"."route_id" = ?',
      bindings: ["candidate-a", "candidate-a"],
    });
  });

  test("returns only the explicitly resolved candidate namespace", async () => {
    const database = await migratedDatabase();
    const insert = database.query(
      `INSERT INTO route_month_trend_v2(
        route_id, month, speed_observation_count, speed_bus_trip_count,
        average_speed_mph, ridership, transfers, has_speed_trend,
        has_ridership_trend, candidate_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(...trendValues(8), "candidate-a");
    insert.run(...trendValues(12), "candidate-b");
    const d1 = asD1(database);

    const candidateA = await listRouteMonthTrends(
      createD1ServingDb(d1, { candidateId: "candidate-a" }),
      "BX38",
    );
    const candidateB = await listRouteMonthTrends(
      createD1ServingDb(d1, { candidateId: "candidate-b" }),
      "BX38",
    );

    expect(candidateA[0]?.averageSpeedMph).toBe(8);
    expect(candidateB[0]?.averageSpeedMph).toBe(12);
  });
});

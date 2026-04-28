import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { D1ServingDb } from "./client.js";
import * as schema from "./schema.js";

export function createBunSqliteServingDb(database: Database): D1ServingDb {
  return drizzle(database, { schema }) as unknown as D1ServingDb;
}

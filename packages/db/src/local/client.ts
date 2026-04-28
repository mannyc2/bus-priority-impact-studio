import type { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";

export type LocalPipelineSchema = typeof schema;
export type LocalPipelineDb = BunSQLiteDatabase<LocalPipelineSchema>;

export function createLocalPipelineDb(database: Database): LocalPipelineDb {
  return drizzle(database, { schema });
}

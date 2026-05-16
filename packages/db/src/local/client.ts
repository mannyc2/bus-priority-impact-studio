import type { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import type { SQLiteInsertValue, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema.js";

export type LocalPipelineSchema = typeof schema;
export type LocalPipelineDb = BunSQLiteDatabase<LocalPipelineSchema>;

export function createLocalPipelineDb(database: Database): LocalPipelineDb {
  return drizzle(database, { schema });
}

const INSERT_BATCH_SIZE = 500;

/** Batch-insert rows to stay under SQLite's ~32K bind-parameter limit. */
export async function batchInsert<T extends SQLiteTable>(
  db: LocalPipelineDb,
  table: T,
  rows: readonly SQLiteInsertValue<T>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    await db.insert(table).values(rows.slice(i, i + INSERT_BATCH_SIZE) as SQLiteInsertValue<T>[]);
  }
}

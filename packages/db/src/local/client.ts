import type { Database } from "bun:sqlite";
import { drizzle, type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import type { SQLiteInsertValue, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema.js";

export type LocalPipelineSchema = typeof schema;
export type LocalPipelineDb = SQLiteBunDatabase<LocalPipelineSchema>;

/** The transaction handle yielded by `db.transaction((tx) => { ... })`. */
export type LocalPipelineTx = Parameters<Parameters<LocalPipelineDb["transaction"]>[0]>[0];

export function createLocalPipelineDb(database: Database): LocalPipelineDb {
  return drizzle({ client: database, schema });
}

/**
 * Apply the canonical pragmas for the local pipeline SQLite database. One place
 * so every opener (runtime, migration, tests) is consistent: foreign keys on so
 * declared cascades fire, a busy timeout to tolerate concurrent readers, and —
 * for writable connections — WAL + relaxed sync for fast local bulk writes.
 */
export function applyLocalPragmas(database: Database, options: { readonly?: boolean } = {}): void {
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA foreign_keys = ON");
  if (!options.readonly) {
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = NORMAL");
  }
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

/**
 * Synchronous chunked insert, safe to call inside a `db.transaction((tx) => …)`
 * callback. Like {@link batchInsert} but executes via `.run()` so it composes
 * with the synchronous bun-sqlite transaction API.
 */
export function insertAll<T extends SQLiteTable>(
  tx: LocalPipelineTx,
  table: T,
  rows: readonly SQLiteInsertValue<T>[],
): void {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    tx
      .insert(table)
      .values(rows.slice(i, i + INSERT_BATCH_SIZE) as SQLiteInsertValue<T>[])
      .run();
  }
}

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { createLocalPipelineDb, type LocalPipelineDb, migrateLocalPipelineDb } from "@bp/db/local";
import { fromRepoRoot } from "../source-manifest.js";

export type OpenLocalPipelineDb = {
  db: LocalPipelineDb;
  sqlite: Database;
  path: string;
};

export function defaultLocalPipelineDbPath(): string {
  return fromRepoRoot(join("data/local/pipeline.sqlite"));
}

export async function openLocalPipelineDb(
  path = defaultLocalPipelineDbPath(),
): Promise<OpenLocalPipelineDb> {
  await migrateLocalPipelineDb(path);

  const sqlite = new Database(path);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");

  return {
    db: createLocalPipelineDb(sqlite),
    sqlite,
    path,
  };
}

export async function withLocalPipelineDb<T>(
  path: string | undefined,
  useDb: (local: OpenLocalPipelineDb) => T | Promise<T>,
): Promise<T> {
  const local = await openLocalPipelineDb(path);

  try {
    return await useDb(local);
  } finally {
    local.sqlite.close();
  }
}

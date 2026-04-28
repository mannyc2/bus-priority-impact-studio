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

  return {
    db: createLocalPipelineDb(sqlite),
    sqlite,
    path,
  };
}

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { createLocalPipelineDb, type LocalPipelineDb, migrateLocalPipelineDb } from "@bp/db/local";
import { fromRepoRoot } from "../source-manifest.js";
import { loadSpatialite } from "./spatialite.js";

export type OpenLocalPipelineDb = {
  db: LocalPipelineDb;
  sqlite: Database;
  path: string;
  spatialite: { path: string; version: string } | null;
};

export type OpenLocalPipelineDbOptions = {
  spatial?: boolean;
};

export function defaultLocalPipelineDbPath(): string {
  return fromRepoRoot(join("data/local/pipeline.sqlite"));
}

export async function openLocalPipelineDb(
  path: string | undefined = defaultLocalPipelineDbPath(),
  options: OpenLocalPipelineDbOptions = {},
): Promise<OpenLocalPipelineDb> {
  await migrateLocalPipelineDb(path);

  const sqlite = new Database(path);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  // Enforce declared foreign keys (e.g. local_finding_evidence_link →
  // local_finding_candidate). SQLite leaves this off by default.
  sqlite.exec("PRAGMA foreign_keys = ON");

  let spatialite: { path: string; version: string } | null = null;
  if (options.spatial) {
    spatialite = loadSpatialite(sqlite);
  }

  return {
    db: createLocalPipelineDb(sqlite),
    sqlite,
    path,
    spatialite,
  };
}

export async function withLocalPipelineDb<T>(
  path: string | undefined,
  useDb: (local: OpenLocalPipelineDb) => T | Promise<T>,
  options: OpenLocalPipelineDbOptions = {},
): Promise<T> {
  const local = await openLocalPipelineDb(path, options);

  try {
    return await useDb(local);
  } finally {
    local.sqlite.close();
  }
}

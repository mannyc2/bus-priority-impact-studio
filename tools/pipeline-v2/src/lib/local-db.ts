import { Database } from "bun:sqlite";
import { join } from "node:path";
import {
  applyLocalPragmas,
  createLocalPipelineDb,
  type LocalPipelineDb,
  migrateLocalPipelineDb,
} from "@bp/db/local";
import { Schema } from "@bp/pipeline-v2/cli/compat";
import { fromRepoRoot } from "./paths.ts";
import { loadSpatialite } from "./spatialite.ts";

export type OpenLocalPipelineDb = {
  db: LocalPipelineDb;
  sqlite: Database;
  path: string;
  spatialite: { path: string; version: string } | null;
};

export type OpenLocalDbOptions = {
  spatial?: boolean;
  /** Open read-only: skip migration and WAL/sync pragmas, keep foreign keys + busy timeout. */
  readonly?: boolean;
};

export const dbOptions = Schema.Struct({
  db: Schema.optionalKey(Schema.String).annotate({ description: "Local pipeline SQLite path" }),
});

export function defaultLocalPipelineDbPath(): string {
  return fromRepoRoot(join("data/local/pipeline.sqlite"));
}

export async function openLocalPipelineDb(
  path: string | undefined,
  options: OpenLocalDbOptions = {},
): Promise<OpenLocalPipelineDb> {
  const resolved = path ?? defaultLocalPipelineDbPath();
  if (!options.readonly) {
    await migrateLocalPipelineDb(resolved);
  }

  const sqlite = new Database(resolved, options.readonly ? { readonly: true } : undefined);
  applyLocalPragmas(sqlite, { readonly: options.readonly ?? false });

  let spatialite: { path: string; version: string } | null = null;
  if (options.spatial) {
    spatialite = loadSpatialite(sqlite);
  }

  return { db: createLocalPipelineDb(sqlite), sqlite, path: resolved, spatialite };
}

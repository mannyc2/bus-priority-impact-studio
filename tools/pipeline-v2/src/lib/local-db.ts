import { Database } from "bun:sqlite";
import { join } from "node:path";
import { middleware, z } from "@liche/core";
import { createLocalPipelineDb, type LocalPipelineDb, migrateLocalPipelineDb } from "@bp/db/local";
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
};

export const dbOptions = z.object({
  db: z.string().optional().describe("Local pipeline SQLite path"),
});

export function defaultLocalPipelineDbPath(): string {
  return fromRepoRoot(join("data/local/pipeline.sqlite"));
}

export async function openLocalPipelineDb(
  path: string | undefined,
  options: OpenLocalDbOptions = {},
): Promise<OpenLocalPipelineDb> {
  const resolved = path ?? defaultLocalPipelineDbPath();
  await migrateLocalPipelineDb(resolved);

  const sqlite = new Database(resolved);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA foreign_keys = ON");

  let spatialite: { path: string; version: string } | null = null;
  if (options.spatial) {
    spatialite = loadSpatialite(sqlite);
  }

  return { db: createLocalPipelineDb(sqlite), sqlite, path: resolved, spatialite };
}

export const withLocalDb = (options: OpenLocalDbOptions = {}) =>
  middleware(async (ctx, next) => {
    const provided = typeof ctx.options["db"] === "string" ? ctx.options["db"] : undefined;
    const local = await openLocalPipelineDb(provided, options);
    ctx.set("localDb", local);
    try {
      await next();
    } finally {
      local.sqlite.close();
    }
  });

export function localDbFromCtx(ctx: { var: Record<string, unknown> }): OpenLocalPipelineDb {
  const local = ctx.var["localDb"];
  if (!local) {
    throw new Error("withLocalDb middleware not attached to this command");
  }
  return local as OpenLocalPipelineDb;
}

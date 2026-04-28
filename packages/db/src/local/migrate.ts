import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createLocalPipelineDb } from "./client.js";

const defaultDbPath = fileURLToPath(
  new URL("../../../../data/local/pipeline.sqlite", import.meta.url),
);
const migrationsFolder = fileURLToPath(new URL("../../migrations/local", import.meta.url));
const env = Bun.env as { BP_LOCAL_DB_PATH?: string };

export async function migrateLocalPipelineDb(path = env.BP_LOCAL_DB_PATH ?? defaultDbPath) {
  await mkdir(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  try {
    migrate(createLocalPipelineDb(sqlite), { migrationsFolder });
  } finally {
    sqlite.close();
  }
}

if (import.meta.main) {
  await migrateLocalPipelineDb();
}

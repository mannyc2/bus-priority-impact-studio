import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  applyLocalPragmas,
  createLocalPipelineDb,
  type LocalPipelineDb,
} from "../src/local/client.js";

const migrationsFolder = fileURLToPath(new URL("../migrations-drizzle/local", import.meta.url));

export function createTestLocalDb(): { db: LocalPipelineDb; sqlite: Database } {
  const sqlite = new Database(":memory:");
  applyLocalPragmas(sqlite);
  const db = createLocalPipelineDb(sqlite);
  migrate(db, { migrationsFolder });
  return { db, sqlite };
}

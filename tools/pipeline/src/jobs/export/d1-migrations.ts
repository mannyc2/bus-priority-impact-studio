import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fromRepoRoot } from "../../source-manifest.js";

export async function readD1MigrationSql(): Promise<string> {
  const migrationsDir = fromRepoRoot(join("packages/db/migrations/d1"));
  const migrationFilenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const migrations = await Promise.all(
    migrationFilenames.map(async (filename) => Bun.file(join(migrationsDir, filename)).text()),
  );

  return `${migrations.map((migration) => migration.trim()).join("\n")}\n`;
}

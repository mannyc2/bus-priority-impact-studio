import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fromRepoRoot } from "../../lib/paths.ts";

export async function readD1MigrationSql(): Promise<string> {
  const migrationsDir = fromRepoRoot("packages/db/migrations/d1");
  const filenames = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const migrations = await Promise.all(
    filenames.map((name) => Bun.file(join(migrationsDir, name)).text()),
  );
  return `${migrations.map((m) => m.trim()).join("\n")}\n`;
}

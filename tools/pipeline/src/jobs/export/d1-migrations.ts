import { join } from "node:path";
import * as z from "zod";
import { fromRepoRoot } from "../../source-manifest.js";

const D1MigrationJournalSchema = z
  .object({
    entries: z.array(
      z
        .object({
          idx: z.number().int().nonnegative(),
          tag: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export async function readD1MigrationSql(): Promise<string> {
  const migrationsDir = fromRepoRoot(join("packages/db/migrations/d1"));
  const journal = D1MigrationJournalSchema.parse(
    await Bun.file(join(migrationsDir, "meta/_journal.json")).json(),
  );
  const migrations = await Promise.all(
    journal.entries
      .toSorted((left, right) => left.idx - right.idx)
      .map(async (entry) => Bun.file(join(migrationsDir, `${entry.tag}.sql`)).text()),
  );

  return `${migrations.map((migration) => migration.trim()).join("\n")}\n`;
}

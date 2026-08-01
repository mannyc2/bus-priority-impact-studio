import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";

const ChecksumManifestSchema = Schema.Record(
  Schema.String.check(Schema.isPattern(/^\d{4}_[a-z0-9_]+\.sql$/)),
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
);

const failedMigrationPath = new URL(
  "../migrations/d1-v2/0000_atomic_serving_release.sql",
  import.meta.url,
);
const failedMigrationSha256 = "7317ead645a989632662f6f0de95a4f10d11935d3e56905d204f0c86630c8026";
const migrationsDirectory = new URL("../migrations/d1-v2/active/", import.meta.url);
const manifestPath = new URL("checksums.json", migrationsDirectory);
const manifest = decodeStrict(ChecksumManifestSchema)(await Bun.file(manifestPath).json());
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .toSorted();
const manifestFiles = Object.keys(manifest).toSorted();

if (JSON.stringify(migrationFiles) !== JSON.stringify(manifestFiles)) {
  throw new Error(
    `D1 v2 migration/checksum inventory differs: migrations=${migrationFiles.join(",")} manifest=${manifestFiles.join(",")}`,
  );
}

for (const filename of migrationFiles) {
  const expected = manifest[filename];
  if (expected === undefined) throw new Error(`D1 v2 migration ${filename} has no checksum.`);
  const actual = createHash("sha256")
    .update(await Bun.file(new URL(filename, migrationsDirectory)).bytes())
    .digest("hex");
  if (actual !== expected) {
    throw new Error(
      `D1 v2 migration ${filename} is immutable: expected ${expected}, received ${actual}.`,
    );
  }
}

const normalizedStatements = (text: string): string[] => {
  const statements: string[] = [];
  let current: string[] = [];
  let inTrigger = false;
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("--")) current.push(line);
    const trimmed = line.trim();
    if (trimmed.startsWith("CREATE TRIGGER ")) inTrigger = true;
    const complete = inTrigger ? trimmed === "END;" : trimmed.endsWith(";");
    if (!complete) continue;
    statements.push(current.join("\n").trim());
    current = [];
    inTrigger = false;
  }
  if (current.some((line) => line.trim().length > 0)) {
    throw new Error("D1 v2 migration has an unterminated SQL statement.");
  }
  return statements;
};

const failedMigration = await Bun.file(failedMigrationPath).text();
const failedActualSha256 = createHash("sha256").update(failedMigration).digest("hex");
if (failedActualSha256 !== failedMigrationSha256) {
  throw new Error(
    `Failed D1 v2 migration archive drifted: expected ${failedMigrationSha256}, received ${failedActualSha256}.`,
  );
}
const activeStatements = (
  await Promise.all(
    migrationFiles.map(async (filename) =>
      normalizedStatements(await Bun.file(new URL(filename, migrationsDirectory)).text()),
    ),
  )
).flat();
if (JSON.stringify(activeStatements) !== JSON.stringify(normalizedStatements(failedMigration))) {
  throw new Error("Split D1 v2 migrations do not preserve the failed migration statement stream.");
}

console.log(
  `Verified ${migrationFiles.length} immutable split D1 v2 migration checksum(s) against failed archive ${failedMigrationSha256}.`,
);

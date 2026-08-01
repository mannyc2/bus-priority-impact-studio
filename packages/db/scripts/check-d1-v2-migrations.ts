import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";
import { parseD1MigrationStatements, rewriteD1RemoteSafeTrigger } from "./d1-migration-statements";

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
const failedSplitDirectory = new URL(
  "../migrations/d1-v2/failed-split-30720050586/",
  import.meta.url,
);
const failedQueryDirectory = new URL(
  "../migrations/d1-v2/failed-query-30720458733/",
  import.meta.url,
);
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

const normalizedStatements = (text: string): string[] =>
  parseD1MigrationStatements(
    text
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n"),
  );

const failedSplitManifest = decodeStrict(ChecksumManifestSchema)(
  await Bun.file(new URL("checksums.json", failedSplitDirectory)).json(),
);
const failedSplitFiles = (await readdir(failedSplitDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .toSorted();
if (
  JSON.stringify(failedSplitFiles) !== JSON.stringify(Object.keys(failedSplitManifest).toSorted())
) {
  throw new Error("Failed split D1 v2 migration archive inventory differs from its manifest.");
}
for (const filename of failedSplitFiles) {
  const actual = createHash("sha256")
    .update(await Bun.file(new URL(filename, failedSplitDirectory)).bytes())
    .digest("hex");
  if (actual !== failedSplitManifest[filename]) {
    throw new Error(`Failed split D1 v2 migration archive ${filename} drifted.`);
  }
}

const failedQueryManifest = decodeStrict(ChecksumManifestSchema)(
  await Bun.file(new URL("checksums.json", failedQueryDirectory)).json(),
);
const failedQueryFiles = (await readdir(failedQueryDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .toSorted();
if (
  JSON.stringify(failedQueryFiles) !== JSON.stringify(Object.keys(failedQueryManifest).toSorted())
) {
  throw new Error("Failed-query D1 v2 migration archive inventory differs from its manifest.");
}
for (const filename of failedQueryFiles) {
  const actual = createHash("sha256")
    .update(await Bun.file(new URL(filename, failedQueryDirectory)).bytes())
    .digest("hex");
  if (actual !== failedQueryManifest[filename]) {
    throw new Error(`Failed-query D1 v2 migration archive ${filename} drifted.`);
  }
}

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
const failedStatements = normalizedStatements(failedMigration);
if (failedStatements.length !== 301) {
  throw new Error(`Expected 301 trigger-aware statements, received ${failedStatements.length}.`);
}
const remoteSafeStatements = failedStatements.map(rewriteD1RemoteSafeTrigger);
if (JSON.stringify(activeStatements) !== JSON.stringify(remoteSafeStatements)) {
  throw new Error(
    "Split D1 v2 migrations do not preserve the approved remote-safe statement stream.",
  );
}

console.log(
  `Verified ${migrationFiles.length} trigger-safe D1 v2 migration checksum(s), failed-query archives, and the approved remote-safe statement stream against ${failedMigrationSha256}.`,
);

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";

const ChecksumManifestSchema = Schema.Record(
  Schema.String.check(Schema.isPattern(/^\d{4}_[a-z0-9_]+\.sql$/)),
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
);

const migrationsDirectory = new URL("../migrations/d1-v2/", import.meta.url);
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

console.log(`Verified ${migrationFiles.length} immutable D1 v2 migration checksum(s).`);

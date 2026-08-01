import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { parseD1MigrationStatements } from "./d1-migration-statements";

const sourcePath = new URL("../migrations/d1-v2/0000_atomic_serving_release.sql", import.meta.url);
const targetDirectory = new URL("../migrations/d1-v2/active/", import.meta.url);
const source = await Bun.file(sourcePath).text();
const sourceSha256 = createHash("sha256").update(source).digest("hex");

if (sourceSha256 !== "7317ead645a989632662f6f0de95a4f10d11935d3e56905d204f0c86630c8026") {
  throw new Error(`Failed Plan 098 migration archive drifted: ${sourceSha256}.`);
}

await mkdir(targetDirectory, { recursive: true });
const existing = (await readdir(targetDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .toSorted();
const statements = parseD1MigrationStatements(source).map((statement) => `${statement}\n`);

const maximumBytes = 6_000;
const maximumStatements = 30;
const groups: string[][] = [];
let group: string[] = [];
let groupBytes = 0;
for (const statement of statements) {
  const bytes = Buffer.byteLength(statement);
  if (bytes > maximumBytes)
    throw new Error("One Plan 098 migration statement exceeds the split ceiling.");
  if (
    group.length > 0 &&
    (group.length === maximumStatements || groupBytes + bytes > maximumBytes)
  ) {
    groups.push(group);
    group = [];
    groupBytes = 0;
  }
  group.push(statement);
  groupBytes += bytes;
}
if (group.length > 0) groups.push(group);

const checksums: Record<string, string> = {};
for (const [index, statementsForFile] of groups.entries()) {
  const sequence = String(index + 1).padStart(4, "0");
  const part = String(index + 1).padStart(2, "0");
  const filename = `${sequence}_atomic_serving_release_${part}.sql`;
  const text = [
    `-- Plan 098 split migration ${part}/${String(groups.length).padStart(2, "0")}.`,
    "-- Mechanically derived from the checksum-retained failed 0000 migration.",
    "",
    ...statementsForFile,
  ].join("\n");
  if (index === 0 && existing.length > 0) {
    if (existing.length !== 1 || existing[0] !== filename) {
      throw new Error(`Only the applied ${filename} may exist before tail generation.`);
    }
    const applied = await Bun.file(new URL(filename, targetDirectory)).text();
    if (applied !== text) throw new Error(`Applied D1 v2 migration ${filename} would drift.`);
  } else {
    await Bun.write(new URL(filename, targetDirectory), text);
  }
  checksums[filename] = createHash("sha256").update(text).digest("hex");
}

await Bun.write(
  new URL("checksums.json", targetDirectory),
  `${JSON.stringify(checksums, null, 2)}\n`,
);

console.log(
  `Preserved the applied first migration and split ${statements.length} trigger-aware statements into ${groups.length} migrations with statement payloads under ${maximumBytes} bytes each.`,
);

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import {
  collectD1ArtifactKeys,
  collectManifestArtifactKeys,
} from "../lib/publish-artifact-keys.js";

const repoRoot = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const artifactRoot = join(repoRoot, "data", "artifacts");

type CompletenessReport = {
  schemaVersion: 1;
  month: string;
  generatedAt: string;
  status: "pass" | "fail";
  manifestCount: number;
  manifestArtifactCount: number;
  d1ExportUsed: boolean;
  d1ArtifactCount: number;
  artifactCount: number;
  missing: string[];
  outputPath: string;
};

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function repoPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const month = parseArg("--month");
if (!month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error("Usage: check-publish-completeness --month YYYY-MM [--output path]");
  process.exit(2);
}

const outputPath =
  parseArg("--output") ?? join(artifactRoot, "audits", `publish-completeness-${month}.json`);
const exportRoot = parseArg("--export-root") ?? join(repoRoot, "data", "exports", "d1");
const schemaPath = repoPath(parseArg("--schema") ?? join(exportRoot, month, "schema.sql"));
const seedPath = repoPath(parseArg("--seed") ?? join(exportRoot, month, "seed.sql"));

// Manifests that declare R2 keys referenced by D1 rows or other release artifacts.
const manifestDirs = ["briefs", "evaluations", "map"] as const;
const [manifestKeys, d1Keys] = await Promise.all([
  collectManifestArtifactKeys({ artifactRoot, manifestDirs, month }),
  collectD1ArtifactKeys({ month, schemaPath, seedPath }),
]);
const artifactKeys = new Set<string>([...manifestKeys.keys, ...d1Keys.keys]);

const missing: string[] = [];
for (const key of artifactKeys) {
  const localPath = join(artifactRoot, key);
  if (!(await fileExists(localPath))) {
    missing.push(key);
  }
}
missing.sort();

const report: CompletenessReport = {
  schemaVersion: 1,
  month,
  generatedAt: new Date().toISOString(),
  status: missing.length === 0 ? "pass" : "fail",
  manifestCount: manifestKeys.manifestCount,
  manifestArtifactCount: manifestKeys.keys.length,
  d1ExportUsed: d1Keys.exportUsed,
  d1ArtifactCount: d1Keys.keys.length,
  artifactCount: artifactKeys.size,
  missing,
  outputPath,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (process.argv.includes("--emit-keys")) {
  for (const key of [...artifactKeys].sort()) {
    process.stdout.write(`${key}\n`);
  }
}

console.error(
  `publish-completeness ${month}: ${report.status} (${report.manifestCount} manifest${report.manifestCount === 1 ? "" : "s"}, ${report.d1ArtifactCount} D1 artifact refs, ${artifactKeys.size} keys, ${missing.length} missing)`,
);

process.exit(report.status === "pass" ? 0 : 1);

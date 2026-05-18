import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const repoRoot = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const artifactRoot = join(repoRoot, "data", "artifacts");

type ManifestArtifact = {
  artifactKey: string;
  byteLength?: number;
  sha256?: string;
};

type ManifestFile = {
  artifacts: ManifestArtifact[];
};

type CompletenessReport = {
  schemaVersion: 1;
  month: string;
  generatedAt: string;
  status: "pass" | "fail";
  manifestCount: number;
  artifactCount: number;
  missing: string[];
  outputPath: string;
};

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    const body = await readFile(path, "utf-8");
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
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

// Manifests that declare R2 keys referenced by D1 rows or other release artifacts.
const manifestPaths = [
  join(artifactRoot, "briefs", month, "manifest.json"),
  join(artifactRoot, "evaluations", month, "manifest.json"),
];

const artifactKeys = new Set<string>();
let manifestCount = 0;

for (const manifestPath of manifestPaths) {
  const manifest = await readJsonIfExists<ManifestFile>(manifestPath);
  if (manifest === null) continue;
  manifestCount += 1;
  for (const entry of manifest.artifacts) {
    if (typeof entry.artifactKey === "string") {
      artifactKeys.add(entry.artifactKey);
    }
  }
}

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
  manifestCount,
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
  `publish-completeness ${month}: ${report.status} (${manifestCount} manifest${manifestCount === 1 ? "" : "s"}, ${artifactKeys.size} keys, ${missing.length} missing)`,
);

process.exit(report.status === "pass" ? 0 : 1);

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import {
  collectD1ArtifactKeys,
  collectManifestArtifactKeys,
} from "../commands/publish/publish-artifact-keys.ts";

const repoRoot = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const defaultArtifactRoot = join(repoRoot, "data", "artifacts");

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
  conflicts: string[];
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

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const month = parseArg("--month");
if (!month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error("Usage: check-publish-completeness --month YYYY-MM [--output path]");
  process.exit(2);
}

const artifactRoot = repoPath(parseArg("--artifact-root") ?? defaultArtifactRoot);
const outputPath =
  parseArg("--output") ?? join(artifactRoot, "audits", `publish-completeness-${month}.json`);
const exportRoot = parseArg("--export-root") ?? join(repoRoot, "data", "exports", "d1");
const schemaPath = repoPath(parseArg("--schema") ?? join(exportRoot, month, "schema.sql"));
const seedPath = repoPath(parseArg("--seed") ?? join(exportRoot, month, "seed.sql"));

// Manifests that declare R2 keys referenced by D1 rows or other release artifacts.
const manifestDirs = ["map"] as const;
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

const conflicts: string[] = [];
if (!d1Keys.exportUsed) conflicts.push("Verified D1 schema and seed exports are unavailable.");
const mapManifest = await readJson(join(artifactRoot, "map", month, "manifest.json"));
if (mapManifest === null) {
  conflicts.push(`Map manifest for ${month} is missing or invalid.`);
} else {
  if (mapManifest["releaseProfile"] !== "full")
    conflicts.push("Map manifest is not a full release.");
  if (mapManifest["buildStatus"] !== "pass")
    conflicts.push("Map manifest buildStatus is not pass.");
  if (mapManifest["verificationStatus"] !== "pass")
    conflicts.push("Map manifest verificationStatus is not pass.");
  if (mapManifest["analysisPeriod"] !== month)
    conflicts.push(
      `Map manifest month ${String(mapManifest["analysisPeriod"])} conflicts with ${month}.`,
    );
  const routeFacts = mapManifest["routeFacts"] as Record<string, unknown> | undefined;
  if (routeFacts?.["status"] !== "available") conflicts.push("Map route facts are unavailable.");
  else if (routeFacts["baselineMonth"] !== month)
    conflicts.push(
      `Map route-fact month ${String(routeFacts["baselineMonth"])} conflicts with ${month}.`,
    );
  const artifacts = Array.isArray(mapManifest["artifacts"])
    ? (mapManifest["artifacts"] as Array<Record<string, unknown>>)
    : [];
  if (!artifacts.some((entry) => entry["artifactKind"] === "map_network_simplified_geojson"))
    conflicts.push("Map manifest lacks the required network artifact.");
}

const studioRoutes = await readJson(join(artifactRoot, "studio", "v1", "routes.json"));
if (studioRoutes === null) conflicts.push("Studio route projection is missing or invalid.");
else if (studioRoutes["baselineMonth"] !== month)
  conflicts.push(
    `Studio route month ${String(studioRoutes["baselineMonth"])} conflicts with ${month}.`,
  );

for (const [label, path] of [
  ["D1 schema", schemaPath],
  ["D1 seed", seedPath],
] as const) {
  const exportMonth = basename(dirname(path));
  if (exportMonth !== month)
    conflicts.push(`${label} export month ${exportMonth} conflicts with ${month}.`);
}
conflicts.sort();

const report: CompletenessReport = {
  schemaVersion: 1,
  month,
  generatedAt: new Date().toISOString(),
  status: missing.length === 0 && conflicts.length === 0 ? "pass" : "fail",
  manifestCount: manifestKeys.manifestCount,
  manifestArtifactCount: manifestKeys.keys.length,
  d1ExportUsed: d1Keys.exportUsed,
  d1ArtifactCount: d1Keys.keys.length,
  artifactCount: artifactKeys.size,
  missing,
  conflicts,
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
  `publish-completeness ${month}: ${report.status} (${report.manifestCount} manifest${report.manifestCount === 1 ? "" : "s"}, ${report.d1ArtifactCount} D1 artifact refs, ${artifactKeys.size} keys, ${missing.length} missing, ${conflicts.length} conflicts)`,
);

process.exit(report.status === "pass" ? 0 : 1);

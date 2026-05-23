import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromRepoRoot } from "../src/source-manifest.js";

const month = "2026-99";
const briefManifestPath = fromRepoRoot(join("data/artifacts/briefs", month, "manifest.json"));
const briefBodyDir = fromRepoRoot(join("data/artifacts/briefs/routes/test-route", month));
const briefBodyPath = join(briefBodyDir, "brief.json");
const auditOutput = fromRepoRoot(
  join("data/artifacts/audits", `publish-completeness-${month}.json`),
);
const exportDir = fromRepoRoot(join("data/exports/d1", month));
const schemaPath = join(exportDir, "schema.sql");
const seedPath = join(exportDir, "seed.sql");
const checkScript = fromRepoRoot("tools/pipeline/src/checks/check-publish-completeness.ts");

type Report = {
  status?: unknown;
  missing?: unknown;
  artifactCount?: unknown;
  d1ArtifactCount?: unknown;
};

async function removeFixtures() {
  await Promise.all([
    rm(fromRepoRoot(join("data/artifacts/briefs", month)), { force: true, recursive: true }),
    rm(briefBodyDir, { force: true, recursive: true }),
    rm(auditOutput, { force: true }),
    rm(exportDir, { force: true, recursive: true }),
  ]);
}

async function writeManifest(includeLocalBody: boolean): Promise<void> {
  await removeFixtures();
  await mkdir(fromRepoRoot(join("data/artifacts/briefs", month)), { recursive: true });
  const artifactKey = `briefs/routes/test-route/${month}/brief.json`;
  await writeFile(
    briefManifestPath,
    JSON.stringify({
      schemaVersion: 1,
      artifactKind: "brief_artifact_manifest",
      analysisPeriod: month,
      artifacts: [{ artifactKey, byteLength: 7, sha256: "x" }],
    }),
  );
  if (includeLocalBody) {
    await mkdir(briefBodyDir, { recursive: true });
    await writeFile(briefBodyPath, '{"ok":1}');
  }
}

async function writeD1Export(key: string): Promise<void> {
  await mkdir(exportDir, { recursive: true });
  await writeFile(
    schemaPath,
    [
      'CREATE TABLE "route_artifact" ("route_id" text NOT NULL, "month" text NOT NULL, "artifact_name" text NOT NULL, "artifact_key" text NOT NULL, "content_type" text NOT NULL, "byte_length" integer NOT NULL, "sha256" text NOT NULL);',
      'CREATE TABLE "corridor_artifact" ("corridor_id" text NOT NULL, "month" text NOT NULL, "artifact_name" text NOT NULL, "artifact_key" text NOT NULL, "content_type" text NOT NULL, "byte_length" integer NOT NULL, "sha256" text NOT NULL);',
    ].join("\n"),
  );
  await writeFile(
    seedPath,
    `insert into "route_artifact" ("route_id", "month", "artifact_name", "artifact_key", "content_type", "byte_length", "sha256") values ('R1', '${month}', 'brief.json', '${key}', 'application/json', 7, '${"a".repeat(64)}');`,
  );
}

async function runCheck(): Promise<{ exitCode: number; report: Report }> {
  const proc = Bun.spawn(["bun", "run", checkScript, "--month", month], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const report = JSON.parse(await Bun.file(auditOutput).text()) as Report;
  return { exitCode, report };
}

describe("check-publish-completeness", () => {
  afterEach(removeFixtures);

  test("passes when every manifest artifactKey has a local file", async () => {
    await writeManifest(true);
    const { exitCode, report } = await runCheck();
    expect(exitCode).toBe(0);
    expect(report.status).toBe("pass");
    expect(report.missing).toEqual([]);
    expect(report.artifactCount).toBe(1);
  });

  test("fails when a manifest references a key without a local file", async () => {
    await writeManifest(false);
    const { exitCode, report } = await runCheck();
    expect(exitCode).toBe(1);
    expect(report.status).toBe("fail");
    expect(report.missing).toEqual([`briefs/routes/test-route/${month}/brief.json`]);
  });

  test("fails when the D1 export references a local artifact key outside manifests", async () => {
    await writeManifest(true);
    const d1OnlyKey = `briefs/routes/d1-only/${month}/brief.json`;
    await writeD1Export(d1OnlyKey);

    const { exitCode, report } = await runCheck();

    expect(exitCode).toBe(1);
    expect(report.status).toBe("fail");
    expect(report.d1ArtifactCount).toBe(1);
    expect(report.missing).toEqual([d1OnlyKey]);
  });
});

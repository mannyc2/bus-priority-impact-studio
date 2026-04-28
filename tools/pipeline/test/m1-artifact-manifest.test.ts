import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteArtifacts } from "@bp/db/local";
import { buildM1ArtifactManifestFromCli } from "../src/jobs/build/m1-artifact-manifest.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));
const dbPath = fromRepoRoot(join("data/fixtures/m1-artifact-manifest/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(artifactDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
  ]);
}

async function writeArtifactFixtures(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(artifactDir, { recursive: true });

  for (const name of [
    "summary.json",
    "hotspots.json",
    "ridership-profile.json",
    "speed-profile.json",
    "intervention-overlay.json",
    "bus-lane-overlay.json",
    "schedule-comparison.json",
    "route-scorecard.json",
    "route-brief-input.json",
  ]) {
    await Bun.write(join(artifactDir, name), `${JSON.stringify({ name })}\n`);
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 artifact manifest build", () => {
  test("writes artifact keys, sizes, and hashes for generated JSON artifacts", async () => {
    await writeArtifactFixtures();

    const result = await buildM1ArtifactManifestFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--db",
      dbPath,
    ]);
    const summaryBytes = await Bun.file(join(artifactDir, "summary.json")).arrayBuffer();
    const expectedSummaryHash = createHash("sha256")
      .update(Buffer.from(summaryBytes))
      .digest("hex");
    const local = await openLocalPipelineDb(dbPath);
    const artifacts = await listRouteArtifacts(local.db, isoMonth);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        artifactCount: 9,
      }),
    );
    const summaryArtifact = artifacts.find((artifact) => artifact.artifactName === "summary.json");
    expect(artifacts).toHaveLength(9);
    expect(summaryArtifact).toEqual(
      expect.objectContaining({
        artifactName: "summary.json",
        artifactKey: "route-slices/t1-2026-03/summary.json",
        contentType: "application/json",
        sha256: expectedSummaryHash,
      }),
    );
    expect(summaryArtifact?.byteLength).toBeGreaterThan(0);
  });
});

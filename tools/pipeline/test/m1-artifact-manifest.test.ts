import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildM1ArtifactManifestFromCli } from "../src/jobs/build/m1-artifact-manifest.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(artifactDir, { force: true, recursive: true });
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
    ]);
    const manifest = await Bun.file(result.manifestPath).json();
    const summaryBytes = await Bun.file(join(artifactDir, "summary.json")).arrayBuffer();
    const expectedSummaryHash = createHash("sha256")
      .update(Buffer.from(summaryBytes))
      .digest("hex");

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        artifactCount: 9,
      }),
    );
    expect(manifest.artifacts).toHaveLength(9);
    expect(manifest.artifacts[0]).toEqual(
      expect.objectContaining({
        name: "summary.json",
        artifactKey: "route-slices/t1-2026-03/summary.json",
        contentType: "application/json",
        sha256: expectedSummaryHash,
      }),
    );
    expect(manifest.artifacts[0].byteLength).toBeGreaterThan(0);
  });
});

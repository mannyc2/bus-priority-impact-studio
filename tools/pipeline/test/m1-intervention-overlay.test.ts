import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceAceRoutes, replaceAceViolationSummaries } from "@bp/db/local";
import { buildM1InterventionOverlay } from "../src/jobs/build/m1-intervention-overlay.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/test-intervention-overlay-interventions"));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-03"));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(workingDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeAceRoutesFixture(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceAceRoutes(local.db, [
      {
        routeId: "T1",
        program: "ABLE",
        implementationDate: "2024-01-01T00:00:00.000Z",
      },
      {
        routeId: "T1",
        program: "ACE",
        implementationDate: "2026-04-01T00:00:00.000Z",
      },
    ]);
    await replaceAceViolationSummaries(local.db, "2026-03", [
      {
        month: "2026-03",
        routeId: "T1",
        violationType: "MOBILE BUS LANE",
        violationStatus: "EXEMPT - OTHER",
        violationCount: 12,
      },
      {
        month: "2026-03",
        routeId: "T2",
        violationType: "MOBILE BUS STOP",
        violationStatus: "TECHNICAL ISSUE/OTHER",
        violationCount: 5,
      },
    ]);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 intervention overlay build", () => {
  test("classifies active and future route-level ACE programs", async () => {
    await writeAceRoutesFixture();

    const result = await buildM1InterventionOverlay({
      routeId: "T1",
      year: 2026,
      month: 3,
      dbPath,
    });
    const overlay = await Bun.file(result.overlayPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        aceRouteMatchCount: 2,
        activeProgramCount: 1,
      }),
    );
    expect(overlay.ace).toEqual(
      expect.objectContaining({
        routeMatched: true,
        activeDuringAnalysisPeriod: true,
        routeMatchCount: 2,
      }),
    );
    expect(overlay.ace.activePrograms.map((row: { program: string }) => row.program)).toEqual([
      "ABLE",
    ]);
    expect(overlay.ace.futurePrograms.map((row: { program: string }) => row.program)).toEqual([
      "ACE",
    ]);
    expect(overlay.violations).toEqual(
      expect.objectContaining({
        routeViolationCount: 12,
        groupedRowCount: 1,
      }),
    );
  });
});

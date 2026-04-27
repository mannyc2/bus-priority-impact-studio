import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildM1InterventionOverlay } from "../src/jobs/build/m1-intervention-overlay.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/test-intervention-overlay-interventions"));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-03"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(workingDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeAceRoutesFixture(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(workingDir, { recursive: true });
  await Bun.write(
    join(workingDir, "ace-routes.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: "ace_routes",
        fetchedAt: "2026-04-27T12:00:00.000Z",
        rows: [
          {
            schemaVersion: 1,
            routeId: "T1",
            program: "ABLE",
            implementationDate: "2024-01-01T00:00:00.000Z",
          },
          {
            schemaVersion: 1,
            routeId: "T1",
            program: "ACE",
            implementationDate: "2026-04-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(workingDir, "ace-violations-2026-03.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: "ace_violations",
        isoMonth: "2026-03",
        fetchedAt: "2026-04-27T12:00:00.000Z",
        rows: [
          {
            schemaVersion: 1,
            routeId: "T1",
            violationType: "MOBILE BUS LANE",
            violationStatus: "EXEMPT - OTHER",
            violationCount: 12,
          },
          {
            schemaVersion: 1,
            routeId: "T2",
            violationType: "MOBILE BUS STOP",
            violationStatus: "TECHNICAL ISSUE/OTHER",
            violationCount: 5,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
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
      interventionDir: workingDir,
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

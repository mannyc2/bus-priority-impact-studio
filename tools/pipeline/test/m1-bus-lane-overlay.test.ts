import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildM1BusLaneOverlay } from "../src/jobs/build/m1-bus-lane-overlay.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeDir = fromRepoRoot(join("data/working/route-slices/t1-2026-03"));
const interventionDir = fromRepoRoot(join("data/working/test-bus-lane-overlay-interventions"));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-03"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(routeDir, { force: true, recursive: true }),
    rm(interventionDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(routeDir, { recursive: true });
  await mkdir(interventionDir, { recursive: true });
  await Bun.write(
    join(routeDir, "stops.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId: "T1",
        rows: [
          {
            schemaVersion: 1,
            routeId: "T1",
            routeShortName: "T1",
            stopId: "A",
            stopName: "5 AV/E 72 ST",
            inEffect: true,
            directionId: "0",
            direction: "N",
            timepoint: true,
            latitude: 40.772141,
            longitude: -73.96508,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(interventionDir, "bus-lanes-local-streets.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: "nyc_dot_bus_lanes_local_streets",
        fetchedAt: "2026-04-27T12:00:00.000Z",
        rows: [
          {
            schemaVersion: 1,
            segmentId: "0001234",
            street: "5 AVENUE",
            borough: "MAN",
            facility: "5th Avenue",
            direction: "SB",
            openDate: "2021-05-01T00:00:00.000",
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [
                    [-73.96508, 40.772141],
                    [-73.965, 40.7722],
                  ],
                ],
              ],
            },
          },
          {
            schemaVersion: 1,
            segmentId: "0005678",
            street: "HILLSIDE AVENUE",
            borough: "QNS",
            facility: "Hillside Avenue",
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

describe("M1 bus-lane overlay build", () => {
  test("matches bus lanes to route stops by street and proximity", async () => {
    await writeFixtureArtifacts();

    const result = await buildM1BusLaneOverlay({
      routeId: "T1",
      year: 2026,
      month: 3,
      interventionDir,
    });
    const overlay = await Bun.file(result.overlayPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        matchedLaneCount: 1,
        matchedStreetCount: 1,
      }),
    );
    expect(overlay.matchedStreets).toEqual(["5 AVENUE"]);
    expect(overlay.matchedLanes[0]).toEqual(
      expect.objectContaining({
        segmentId: "0001234",
        openDate: "2021-05-01T00:00:00.000",
        streetMatched: true,
        proximityMatched: true,
      }),
    );
  });
});

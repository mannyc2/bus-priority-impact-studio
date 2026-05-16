import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { LocalBusLane, LocalRouteStop } from "@bp/db/local";
import { replaceBusLanes, replaceRouteStops } from "@bp/db/local";
import { busLaneMatches } from "../src/jobs/build/route-brief-metrics.js";
import { buildRouteBusLaneOverlay } from "../src/jobs/build/route-secondary-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeDir = fromRepoRoot(join("data/working/route-slices/t1-2026-03"));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-03"));
const dbPath = join(routeDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(routeDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteStops(local.db, "T1", "2026-03", [
      {
        routeId: "T1",
        isoMonth: "2026-03",
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
    ]);
    await replaceBusLanes(local.db, [
      {
        segmentId: "0001234",
        street: "5 AVENUE",
        borough: "MAN",
        facility: "5th Avenue",
        direction: "SB",
        openDate: "2021-05-01T00:00:00.000",
        coordinates: [
          { longitude: -73.96508, latitude: 40.772141 },
          { longitude: -73.965, latitude: 40.7722 },
        ],
      },
      {
        segmentId: "0005678",
        street: "HILLSIDE AVENUE",
        borough: "QNS",
        facility: "Hillside Avenue",
        coordinates: [],
      },
    ]);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route bus-lane overlay build", () => {
  test("matches bus lanes to route stops by street and proximity", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteBusLaneOverlay({
      routeId: "T1",
      year: 2026,
      month: 3,
      dbPath,
    });
    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        matchedLaneCount: 1,
        matchedStreetCount: 1,
      }),
    );
  });

  test("matches outer-borough bus lanes without cross-borough street-name pollution", () => {
    const stops: LocalRouteStop[] = [
      {
        routeId: "T2",
        isoMonth: "2026-03",
        routeShortName: "T2",
        stopId: "BK1",
        stopName: "BROADWAY/MARCY AV",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.70845,
        longitude: -73.95779,
      },
    ];
    const lanes: LocalBusLane[] = [
      {
        segmentId: "brooklyn-broadway",
        street: "BROADWAY",
        borough: "BKN",
        facility: "Broadway",
        coordinates: [
          { longitude: -73.9579, latitude: 40.7085 },
          { longitude: -73.9577, latitude: 40.7083 },
        ],
      },
      {
        segmentId: "manhattan-broadway",
        street: "BROADWAY",
        borough: "MAN",
        facility: "Broadway",
        coordinates: [
          { longitude: -73.98513, latitude: 40.7589 },
          { longitude: -73.98492, latitude: 40.7591 },
        ],
      },
    ];

    expect(busLaneMatches(lanes, stops).map((match) => match.lane.segmentId)).toEqual([
      "brooklyn-broadway",
    ]);
  });
});

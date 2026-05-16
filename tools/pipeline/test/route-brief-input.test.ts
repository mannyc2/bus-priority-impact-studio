import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceAceRoutes,
  replaceAceViolationSummaries,
  replaceBusLanes,
  replaceRouteCatalog,
  replaceRouteHotspots,
  replaceRouteHourlyRidership,
  replaceRouteSchedules,
  replaceRouteSegmentSpeeds,
  replaceRouteStops,
} from "@bp/db/local";
import { buildRouteBriefInputFromCli } from "../src/jobs/build/route-core-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));
const dbDir = fromRepoRoot(join("data/working/test-route-brief-input"));
const dbPath = join(dbDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(artifactDir, { force: true, recursive: true }),
    rm(dbDir, { force: true, recursive: true }),
  ]);
}

async function writeArtifactFixtures(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteCatalog(local.db, [
      {
        routeId,
        routeShortName: routeId,
        routeLongName: "Test route",
        routeTypes: ["Local"],
        directions: ["N"],
        shapeCount: 1,
        stopCount: 3,
        timepointStopCount: 3,
        latitudeMin: 40,
        latitudeMax: 40.2,
        longitudeMin: -73.2,
        longitudeMax: -73,
      },
    ]);
    await replaceRouteHotspots(
      local.db,
      {
        routeId,
        isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        routeWeightedAverageSpeedMph: 6,
        observationCount: 20,
        busTripCount: 200,
        ridershipWeighted: true,
        ridershipWindowCount: 2,
        ridershipMatchedObservationCount: 20,
        ridershipExposure: 1000,
        segmentCount: 4,
        hotspotCount: 2,
      },
      [
        {
          routeId,
          isoMonth,
          segmentId: "T1:2026-03:N:1:A:B",
          direction: "N",
          stopOrder: 1,
          timepointStopId: "A",
          timepointStopName: "A stop",
          nextTimepointStopId: "B",
          nextTimepointStopName: "B stop",
          observationCount: 10,
          busTripCount: 100,
          weightedAverageSpeedMph: 4,
          weightedAverageTravelTimeMinutes: 15,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 0.8,
          speedSeverity: 0.5,
          hotspotScore: 68,
          ridershipExposure: 100,
          riderImpactScore: 79,
        },
        {
          routeId,
          isoMonth,
          segmentId: "T1:2026-03:N:2:B:C",
          direction: "N",
          stopOrder: 2,
          timepointStopId: "B",
          timepointStopName: "B stop",
          nextTimepointStopId: "C",
          nextTimepointStopName: "C stop",
          observationCount: 10,
          busTripCount: 100,
          weightedAverageSpeedMph: 6,
          weightedAverageTravelTimeMinutes: 10,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 0.4,
          speedSeverity: 0.25,
          hotspotScore: 42,
        },
      ],
    );
    await replaceRouteSegmentSpeeds(local.db, routeId, isoMonth, [
      {
        routeId,
        isoMonth,
        timestamp: "2026-03-02T08:00:00.000",
        dayOfWeek: "Monday",
        hourOfDay: 8,
        direction: "N",
        borough: "Manhattan",
        routeType: "Local",
        stopOrder: 1,
        timepointStopId: "A",
        timepointStopName: "A stop",
        timepointStopLatitude: 40,
        timepointStopLongitude: -73,
        nextTimepointStopId: "B",
        nextTimepointStopName: "B stop",
        nextTimepointStopLatitude: 40.1,
        nextTimepointStopLongitude: -73.1,
        roadDistanceMiles: 1,
        averageTravelTimeMinutes: 12,
        averageRoadSpeedMph: 5,
        busTripCount: 100,
      },
    ]);
    await replaceRouteHourlyRidership(local.db, routeId, isoMonth, [
      { routeId, isoMonth, dayOfWeek: "Monday", hourOfDay: 8, ridership: 1000, transfers: 100 },
      { routeId, isoMonth, dayOfWeek: "Monday", hourOfDay: 9, ridership: 400, transfers: 25 },
    ]);
    await replaceRouteSchedules(local.db, routeId, isoMonth, [
      {
        routeId,
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "N",
        shapeId: "T1001",
        stopSequence: 1,
        stopId: "A",
        stopName: "A stop",
        scheduleTime: "2026-01-05T07:00:00.000Z",
        blockId: "B1",
      },
      {
        routeId,
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "N",
        shapeId: "T1001",
        stopSequence: 2,
        stopId: "B",
        stopName: "B stop",
        scheduleTime: "2026-01-05T07:10:00.000Z",
        blockId: "B1",
      },
    ]);
    await replaceAceRoutes(local.db, [
      { routeId, program: "ACE", implementationDate: "2025-01-15T00:00:00.000Z" },
    ]);
    await replaceAceViolationSummaries(local.db, isoMonth, [
      {
        month: isoMonth,
        routeId,
        violationType: "MOBILE BUS LANE",
        violationStatus: "EXEMPT - OTHER",
        violationCount: 12,
      },
    ]);
    await replaceRouteStops(local.db, routeId, isoMonth, [
      {
        routeId,
        isoMonth,
        routeShortName: routeId,
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
        segmentId: "1",
        street: "5 AVENUE",
        borough: "MAN",
        facility: "5 Avenue",
        laneType: "Curbside",
        laneSubtype: "Bus Lane",
        openDate: "2024-06-01T00:00:00.000",
        coordinates: [{ longitude: -73.96508, latitude: 40.772141 }],
      },
      {
        segmentId: "2",
        street: "5 AVENUE",
        borough: "MAN",
        facility: "5 Avenue",
        laneType: "Offset",
        laneSubtype: "Bus Lane",
        coordinates: [{ longitude: -73.96508, latitude: 40.772141 }],
      },
      {
        segmentId: "3",
        street: "5 AVENUE",
        borough: "MAN",
        facility: "5 Avenue",
        laneType: "Curbside",
        laneSubtype: "Bus Lane",
        coordinates: [{ longitude: -73.96508, latitude: 40.772141 }],
      },
    ]);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route brief input build", () => {
  test("combines scorecard and hotspot artifacts into deterministic brief input", async () => {
    await writeArtifactFixtures();

    const result = await buildRouteBriefInputFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--top-segments",
      "1",
      "--db",
      dbPath,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        topSegmentCount: 1,
      }),
    );
  });
});

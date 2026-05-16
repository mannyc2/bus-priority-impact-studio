import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteHourlyRidership, replaceRouteSegmentSpeeds } from "@bp/db/local";
import { buildRouteHotspotsFromCli } from "../src/jobs/build/route-core-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const workingDir = fromRepoRoot(join("data/working/route-slices", sliceKey));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(workingDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeSegmentSpeedFixture(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteSegmentSpeeds(local.db, routeId, isoMonth, [
      {
        routeId,
        isoMonth,
        timestamp: "2026-03-01T08:00:00.000",
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
        averageTravelTimeMinutes: 15,
        averageRoadSpeedMph: 4,
        busTripCount: 10,
      },
      {
        routeId,
        isoMonth,
        timestamp: "2026-03-01T09:00:00.000",
        dayOfWeek: "Monday",
        hourOfDay: 9,
        direction: "N",
        borough: "Manhattan",
        routeType: "Local",
        stopOrder: 2,
        timepointStopId: "B",
        timepointStopName: "B stop",
        timepointStopLatitude: 40.1,
        timepointStopLongitude: -73.1,
        nextTimepointStopId: "C",
        nextTimepointStopName: "C stop",
        nextTimepointStopLatitude: 40.2,
        nextTimepointStopLongitude: -73.2,
        roadDistanceMiles: 1,
        averageTravelTimeMinutes: 6,
        averageRoadSpeedMph: 10,
        busTripCount: 10,
      },
    ]);
    await replaceRouteHourlyRidership(local.db, routeId, isoMonth, [
      { routeId, isoMonth, dayOfWeek: "Monday", hourOfDay: 8, ridership: 100, transfers: 10 },
      { routeId, isoMonth, dayOfWeek: "Monday", hourOfDay: 9, ridership: 1000, transfers: 100 },
    ]);
  } finally {
    local.sqlite.close();
  }
}

async function writeEmptySegmentSpeedFixture(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteSegmentSpeeds(local.db, routeId, isoMonth, []);
    await replaceRouteHourlyRidership(local.db, routeId, isoMonth, []);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route hotspot artifact build", () => {
  test("builds limited hotspot and summary artifacts from normalized segment speeds", async () => {
    await writeSegmentSpeedFixture();

    const result = await buildRouteHotspotsFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--limit",
      "1",
      "--db",
      dbPath,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        hotspotCount: 1,
        topHotspotScore: 68,
        topRiderImpactScore: 79,
      }),
    );
  });

  test("writes empty hotspot artifacts when no segment speeds are available", async () => {
    await writeEmptySegmentSpeedFixture();

    const result = await buildRouteHotspotsFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--db",
      dbPath,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        hotspotCount: 0,
        topHotspotScore: 0,
      }),
    );
  });
});

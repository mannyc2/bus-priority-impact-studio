import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteSegmentSpeeds } from "@bp/db/local";
import { buildM1SpeedProfileFromCli } from "../src/jobs/build/m1-speed-profile.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const workingDir = fromRepoRoot(join("data/working/route-slices", sliceKey));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));
const dbPath = join(workingDir, "pipeline.sqlite");

function speedRow(overrides: Record<string, unknown> = {}) {
  return {
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
    timepointStopLatitude: 40.1,
    timepointStopLongitude: -73.1,
    nextTimepointStopId: "B",
    nextTimepointStopName: "B stop",
    nextTimepointStopLatitude: 40.2,
    nextTimepointStopLongitude: -73.2,
    roadDistanceMiles: 1,
    averageTravelTimeMinutes: 12,
    averageRoadSpeedMph: 5,
    busTripCount: 10,
    ...overrides,
  };
}

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(workingDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteSegmentSpeeds(local.db, routeId, isoMonth, [
      speedRow({ averageRoadSpeedMph: 5, busTripCount: 10 }),
      speedRow({
        hourOfDay: 17,
        direction: "S",
        stopOrder: 2,
        timepointStopId: "C",
        nextTimepointStopId: "D",
        averageRoadSpeedMph: 10,
        averageTravelTimeMinutes: 6,
        busTripCount: 20,
      }),
      speedRow({
        hourOfDay: 16,
        direction: "S",
        stopOrder: 3,
        timepointStopId: "D",
        nextTimepointStopId: "E",
        averageRoadSpeedMph: 4,
        averageTravelTimeMinutes: 14,
        busTripCount: 5,
      }),
    ]);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 speed profile build", () => {
  test("aggregates speed observations by direction, daypart, and slowest windows", async () => {
    await writeFixtureArtifacts();

    const result = await buildM1SpeedProfileFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--limit",
      "2",
      "--db",
      dbPath,
    ]);
    const profile = await Bun.file(result.profilePath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        directionCount: 2,
        daypartCount: 2,
        slowWindowCount: 2,
      }),
    );
    expect(profile.directionProfiles).toContainEqual(
      expect.objectContaining({
        direction: "N",
        weightedAverageSpeedMph: 5,
        slowObservationShare: 1,
      }),
    );
    expect(profile.directionProfiles).toContainEqual(
      expect.objectContaining({
        direction: "S",
        weightedAverageSpeedMph: 8.8,
        slowObservationShare: 0.5,
      }),
    );
    expect(profile.daypartProfiles).toContainEqual(
      expect.objectContaining({
        direction: "S",
        daypart: "PM peak",
        busTripCount: 25,
      }),
    );
    expect(profile.slowestDayHourWindows[0]).toEqual(
      expect.objectContaining({
        dayOfWeek: "Monday",
        hourOfDay: 16,
        weightedAverageSpeedMph: 4,
      }),
    );
  });
});

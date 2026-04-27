import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildM1RidershipProfileFromCli } from "../src/jobs/build/m1-ridership-profile.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const workingDir = fromRepoRoot(join("data/working/route-slices", sliceKey));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(workingDir, { force: true, recursive: true }),
    rm(artifactDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(workingDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await Bun.write(
    join(workingDir, "ridership.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        isoMonth,
        rows: [
          {
            schemaVersion: 1,
            routeId,
            isoMonth,
            dayOfWeek: "Monday",
            hourOfDay: 8,
            ridership: 1000,
            transfers: 100,
          },
          {
            schemaVersion: 1,
            routeId,
            isoMonth,
            dayOfWeek: "Monday",
            hourOfDay: 9,
            ridership: 400,
            transfers: 25,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(workingDir, "segment-speeds.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        isoMonth,
        rows: [
          {
            schemaVersion: 1,
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
          },
          {
            schemaVersion: 1,
            routeId,
            isoMonth,
            timestamp: "2026-03-02T08:00:00.000",
            dayOfWeek: "Monday",
            hourOfDay: 8,
            direction: "N",
            borough: "Manhattan",
            routeType: "Local",
            stopOrder: 2,
            timepointStopId: "B",
            timepointStopName: "B stop",
            timepointStopLatitude: 40.2,
            timepointStopLongitude: -73.2,
            nextTimepointStopId: "C",
            nextTimepointStopName: "C stop",
            nextTimepointStopLatitude: 40.3,
            nextTimepointStopLongitude: -73.3,
            roadDistanceMiles: 1,
            averageTravelTimeMinutes: 6,
            averageRoadSpeedMph: 10,
            busTripCount: 10,
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

describe("M1 ridership profile build", () => {
  test("summarizes peak ridership and slow crowded windows", async () => {
    await writeFixtureArtifacts();

    const result = await buildM1RidershipProfileFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--limit",
      "2",
    ]);
    const profile = await Bun.file(result.profilePath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        ridershipWindowCount: 2,
        slowCrowdedWindowCount: 1,
      }),
    );
    expect(profile.totalRidership).toBe(1400);
    expect(profile.peakRidershipWindow).toEqual(
      expect.objectContaining({
        dayOfWeek: "Monday",
        hourOfDay: 8,
        ridership: 1000,
        weightedAverageSpeedMph: 7.5,
        slowObservationShare: 0.5,
      }),
    );
    expect(profile.slowCrowdedWindows[0]).toEqual(
      expect.objectContaining({
        dayOfWeek: "Monday",
        hourOfDay: 8,
        busTripCount: 20,
      }),
    );
  });
});

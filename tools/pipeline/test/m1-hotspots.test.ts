import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildM1HotspotsFromCli } from "../src/jobs/build/m1-hotspots.js";
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

async function writeSegmentSpeedFixture(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(workingDir, { recursive: true });
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
            schemaVersion: 1,
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
        ],
      },
      null,
      2,
    )}\n`,
  );
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
            ridership: 100,
            transfers: 10,
          },
          {
            schemaVersion: 1,
            routeId,
            isoMonth,
            dayOfWeek: "Monday",
            hourOfDay: 9,
            ridership: 1000,
            transfers: 100,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

async function writeEmptySegmentSpeedFixture(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(workingDir, { recursive: true });
  await Bun.write(
    join(workingDir, "segment-speeds.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        isoMonth,
        rows: [],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(workingDir, "ridership.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        isoMonth,
        rows: [],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 hotspot artifact build", () => {
  test("builds limited hotspot and summary artifacts from normalized segment speeds", async () => {
    await writeSegmentSpeedFixture();

    const result = await buildM1HotspotsFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--limit",
      "1",
    ]);
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        hotspotCount: 1,
        topHotspotScore: 68,
        topRiderImpactScore: 79,
      }),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        ridershipWeighted: true,
        ridershipWindowCount: 2,
        segmentCount: 2,
        hotspotCount: 1,
      }),
    );
    expect(summary.topHotspots[0]).toEqual(
      expect.objectContaining({
        segmentId: "T1:2026-03:N:1:A:B",
        weightedAverageSpeedMph: 4,
        ridershipExposure: 100,
        riderImpactScore: 79,
      }),
    );
  });

  test("writes empty hotspot artifacts when no segment speeds are available", async () => {
    await writeEmptySegmentSpeedFixture();

    const result = await buildM1HotspotsFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
    ]);
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        hotspotCount: 0,
        topHotspotScore: 0,
      }),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        observationCount: 0,
        busTripCount: 0,
        segmentCount: 0,
        hotspotCount: 0,
        topHotspots: [],
      }),
    );
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildM1ScheduleComparisonFromCli } from "../src/jobs/build/m1-schedule-comparison.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/route-slices/t1-2026-03"));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-03"));

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
    join(workingDir, "schedules.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: "bus_schedules_2026",
        routeId: "T1",
        isoMonth: "2026-03",
        fetchedAt: "2026-04-27T12:00:00.000Z",
        rows: [
          {
            schemaVersion: 1,
            routeId: "T1",
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
            schemaVersion: 1,
            routeId: "T1",
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
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "hotspots.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: "2026-04-27T12:00:00.000Z",
        result: {
          routeId: "T1",
          isoMonth: "2026-03",
          hotspots: [
            {
              segmentId: "T1:2026-03:N:1:A:B",
              direction: "N",
              timepointStopId: "A",
              timepointStopName: "A stop",
              nextTimepointStopId: "B",
              nextTimepointStopName: "B stop",
              weightedAverageTravelTimeMinutes: 14,
              weightedAverageSpeedMph: 4,
              busTripCount: 100,
              hotspotScore: 68,
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 schedule comparison build", () => {
  test("joins scheduled timepoint-pair medians to hotspot pairs", async () => {
    await writeFixtureArtifacts();

    const result = await buildM1ScheduleComparisonFromCli([
      "--route",
      "T1",
      "--year",
      "2026",
      "--month",
      "3",
    ]);
    const comparison = await Bun.file(result.comparisonPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        scheduledPairCount: 1,
        matchedHotspotCount: 1,
      }),
    );
    expect(comparison.hotspotComparisons[0]).toEqual(
      expect.objectContaining({
        scheduledMedianTravelTimeMinutes: 10,
        observedMinusScheduledMinutes: 4,
        scheduledSampleCount: 1,
      }),
    );
  });
});

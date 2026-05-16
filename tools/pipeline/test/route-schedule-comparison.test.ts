import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteHotspots, replaceRouteSchedules } from "@bp/db/local";
import { buildRouteScheduleComparisonFromCli } from "../src/jobs/build/route-secondary-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/route-slices/t1-2026-03"));
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-03"));
const dbPath = join(workingDir, "pipeline.sqlite");

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
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteSchedules(local.db, "T1", "2026-03", [
      {
        routeId: "T1",
        isoMonth: "2026-03",
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
        routeId: "T1",
        isoMonth: "2026-03",
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
    await replaceRouteHotspots(
      local.db,
      {
        routeId: "T1",
        isoMonth: "2026-03",
        generatedAt: "2026-04-27T12:00:00.000Z",
        routeWeightedAverageSpeedMph: 4,
        observationCount: 1,
        busTripCount: 100,
        ridershipWeighted: false,
        ridershipWindowCount: 0,
        ridershipMatchedObservationCount: 0,
        ridershipExposure: 0,
        segmentCount: 1,
        hotspotCount: 1,
      },
      [
        {
          routeId: "T1",
          isoMonth: "2026-03",
          segmentId: "T1:2026-03:N:1:A:B",
          direction: "N",
          stopOrder: 1,
          timepointStopId: "A",
          timepointStopName: "A stop",
          nextTimepointStopId: "B",
          nextTimepointStopName: "B stop",
          observationCount: 1,
          weightedAverageTravelTimeMinutes: 14,
          weightedAverageSpeedMph: 4,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 1,
          speedSeverity: 0.5,
          busTripCount: 100,
          hotspotScore: 68,
        },
      ],
    );
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route schedule comparison build", () => {
  test("joins scheduled timepoint-pair medians to hotspot pairs", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteScheduleComparisonFromCli([
      "--route",
      "T1",
      "--year",
      "2026",
      "--month",
      "3",
      "--db",
      dbPath,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        scheduledPairCount: 1,
        matchedHotspotCount: 1,
      }),
    );
  });
});

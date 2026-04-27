import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteComparisonFromCli } from "../src/jobs/build/route-comparison.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-04";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));

function routeDir(routeId: string): string {
  return fromRepoRoot(join("data/artifacts/route-slices", `${routeId.toLowerCase()}-${isoMonth}`));
}

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(routeDir("T1"), { force: true, recursive: true }),
    rm(routeDir("T2"), { force: true, recursive: true }),
  ]);
}

async function writeBrief(
  routeId: string,
  routeScore: number,
  averageSpeedMph: number,
  coverageStatus: "full" | "no_observed_speed" = "full",
) {
  const dir = routeDir(routeId);
  await mkdir(dir, { recursive: true });
  await Bun.write(
    join(dir, "route-brief-input.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        analysisPeriod: isoMonth,
        metrics: {
          routeScore,
          coverageStatus,
          observedSpeedAvailable: coverageStatus === "full",
          averageSpeedMph,
          hotspotCount: 3,
          segmentCount: 5,
          observationCount: 100,
          busTripCount: 1000,
          ridershipWindowCount: 2,
          totalRidership: 5000,
          totalTransfers: 500,
          scheduledPairCount: 3,
          scheduleMatchedHotspotCount: 2,
        },
        interventionStatus: {
          aceRouteMatched: true,
          aceActiveDuringAnalysisPeriod: routeId === "T2",
          aceViolationCount: routeId === "T2" ? 25 : 0,
          aceViolationGroupedRowCount: routeId === "T2" ? 2 : 0,
          busLaneMatchedLaneCount: 4,
          busLaneMatchedStreetCount: 2,
        },
        ridershipProfile: {
          peakRidershipWindow: {
            dayOfWeek: "Monday",
            hourOfDay: 8,
            ridership: 1000,
          },
          slowCrowdedWindows: [{ dayOfWeek: "Monday", hourOfDay: 8 }],
        },
        speedProfile: {
          directionProfiles: [],
          daypartProfiles: [],
          slowestDayHourWindows: [{ dayOfWeek: "Tuesday", hourOfDay: 12 }],
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(batchDir, { recursive: true });
  await Bun.write(
    join(batchDir, "batch-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        routeCount: 2,
        routes: [
          {
            routeId: "T1",
            isoMonth,
            segmentSpeedRows: 100,
            ridershipWindows: 2,
            scheduleTimepoints: 20,
            hotspotCount: 3,
            routeScore: 40,
            artifactCount: 9,
            manifestPath: "/tmp/t1.json",
          },
          {
            routeId: "T2",
            isoMonth,
            segmentSpeedRows: 100,
            ridershipWindows: 2,
            scheduleTimepoints: 20,
            hotspotCount: 3,
            routeScore: 20,
            artifactCount: 9,
            manifestPath: "/tmp/t2.json",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeBrief("T1", 40, 8);
  await writeBrief("T2", 20, 6);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route comparison build", () => {
  test("ranks route brief metrics from a batch summary", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteComparisonFromCli(["--year", "2026", "--month", "4"]);
    const comparison = await Bun.file(result.comparisonPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 2,
        worstRouteId: "T2",
      }),
    );
    expect(comparison.rankedRoutes.map((route: { routeId: string }) => route.routeId)).toEqual([
      "T2",
      "T1",
    ]);
    expect(comparison.rankedRoutes[0]).toEqual(
      expect.objectContaining({
        routeId: "T2",
        routeScore: 20,
        scheduleMatchRate: 0.6667,
        aceActiveDuringAnalysisPeriod: true,
        aceViolationCount: 25,
      }),
    );
  });

  test("excludes routes without observed speed coverage from ranking", async () => {
    await writeFixtureArtifacts();
    await writeBrief("T2", 20, 0, "no_observed_speed");

    const result = await buildRouteComparisonFromCli(["--year", "2026", "--month", "4"]);
    const comparison = await Bun.file(result.comparisonPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 2,
        worstRouteId: "T1",
      }),
    );
    expect(comparison.rankedRoutes.map((route: { routeId: string }) => route.routeId)).toEqual([
      "T1",
    ]);
  });
});

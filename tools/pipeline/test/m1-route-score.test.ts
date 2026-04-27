import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { RouteScorecardSchema } from "@bp/domain";
import { buildM1RouteScoreFromCli } from "../src/jobs/build/m1-route-score.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(artifactDir, { force: true, recursive: true });
}

async function writeHotspotSummaryFixture(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(artifactDir, { recursive: true });
  await Bun.write(
    join(artifactDir, "summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        routeWeightedAverageSpeedMph: 6,
        observationCount: 20,
        busTripCount: 200,
        ridershipWeighted: true,
        ridershipWindowCount: 2,
        ridershipExposure: 1000,
        segmentCount: 4,
        hotspotCount: 2,
        topHotspots: [],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 route score artifact build", () => {
  test("builds a validated scorecard from a hotspot summary artifact", async () => {
    await writeHotspotSummaryFixture();

    const result = await buildM1RouteScoreFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
    ]);
    const scorecard = RouteScorecardSchema.parse(await Bun.file(result.scorecardPath).json());

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        routeScore: 40,
        coverageStatus: "full",
        averageSpeedMph: 6,
        hotspotCount: 2,
      }),
    );
    expect(scorecard).toEqual(
      expect.objectContaining({
        routeId,
        month: isoMonth,
        routeScore: 40,
        coverageStatus: "full",
        averageSpeedMph: 6,
        hotspotCount: 2,
      }),
    );
    expect(scorecard.citations.map((citation) => citation.sourceId)).toEqual([
      "mta_bus_route_segment_speeds",
      "mta_bus_hourly_ridership",
    ]);
  });
});

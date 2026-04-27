import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { backfillRouteRidershipTrends } from "../src/jobs/ingest/backfill-route-ridership-trends.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/fixtures/backfill-route-ridership-trends"));
const trendPath = join(workingDir, "route-month-trends-2026-01_through_2026-02.json");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

async function writeFixtureTrends(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(workingDir, { recursive: true });
  await Bun.write(
    trendPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        startMonth: "2026-01",
        endMonth: "2026-02",
        fetchedAt: "2026-04-27T00:00:00.000Z",
        rows: [
          {
            schemaVersion: 1,
            routeId: "T1",
            isoMonth: "2026-01",
            speedObservationCount: 10,
            speedBusTripCount: 100,
            averageSpeedMph: 7.5,
            ridership: null,
            transfers: null,
            trendCoverage: { speed: true, ridership: false },
          },
          {
            schemaVersion: 1,
            routeId: "T1",
            isoMonth: "2026-02",
            speedObservationCount: 12,
            speedBusTripCount: 120,
            averageSpeedMph: 7.8,
            ridership: 900,
            transfers: 90,
            trendCoverage: { speed: true, ridership: true },
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

describe("route ridership trend backfill", () => {
  test("fills missing route/month ridership chunks into an existing trend artifact", async () => {
    await writeFixtureTrends();

    const result = await backfillRouteRidershipTrends({
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 2,
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      workingDir,
      fetcher: async (input) => {
        const url = new URL(String(input));

        expect(url.searchParams.get("$where")).toContain("bus_route='T1'");
        expect(url.searchParams.get("$where")).toContain("2026-01-01T00:00:00");

        return Response.json([{ ridership: "1000", transfers: "125" }]);
      },
    });
    const trends = await Bun.file(result.trendPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        attemptedChunkCount: 1,
        updatedRowCount: 1,
        remainingRidershipMissingCount: 0,
      }),
    );
    expect(trends.rows[0]).toEqual(
      expect.objectContaining({
        ridership: 1000,
        transfers: 125,
        trendCoverage: { speed: true, ridership: true },
      }),
    );
    expect(summary.sourceReadiness).toEqual(
      expect.objectContaining({
        ridershipTrends: "available",
      }),
    );
  });
});

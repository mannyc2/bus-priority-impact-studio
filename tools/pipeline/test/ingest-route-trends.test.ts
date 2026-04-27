import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ingestRouteTrends } from "../src/jobs/ingest/ingest-route-trends.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/fixtures/ingest-route-trends"));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route trends ingestion", () => {
  test("fetches route/month speed and ridership trend rows", async () => {
    await removeFixtureArtifacts();

    const result = await ingestRouteTrends({
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 2,
      routes: ["T1"],
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      workingDir,
      fetcher: async (input) => {
        const url = new URL(String(input));

        if (url.pathname.includes("kufs-yh3x")) {
          expect(url.searchParams.get("$where")).toContain("route_id in('T1')");
          return Response.json([
            {
              route_id: "T1",
              year: "2026",
              month: "1",
              observation_count: "10",
              bus_trip_count: "100",
              average_speed_mph: "7.5",
            },
          ]);
        }

        expect(url.searchParams.get("$where")).toContain("bus_route in('T1')");
        return Response.json([
          {
            bus_route: "T1",
            year: "2026",
            month: "1",
            ridership: "1000",
            transfers: "100",
          },
          {
            bus_route: "T1",
            year: "2026",
            month: "2",
            ridership: "1200",
            transfers: "120",
          },
        ]);
      },
    });
    const trends = await Bun.file(result.trendPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        startMonth: "2026-01",
        endMonth: "2026-02",
        routeCount: 1,
        monthCount: 2,
        rowCount: 2,
      }),
    );
    expect(trends.rows).toEqual([
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-01",
        averageSpeedMph: 7.5,
        ridership: 1000,
        trendCoverage: { speed: true, ridership: true },
      }),
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-02",
        averageSpeedMph: null,
        ridership: 1200,
        trendCoverage: { speed: false, ridership: true },
      }),
    ]);
    expect(summary).toEqual(
      expect.objectContaining({
        speedRowCount: 1,
        ridershipRowCount: 2,
        completeTrendRowCount: 1,
      }),
    );
  });
});

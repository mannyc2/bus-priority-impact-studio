import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteMonthTrends } from "@bp/db/local";
import { ingestRouteTrends } from "../src/jobs/ingest/ingest-route-trends.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/fixtures/ingest-route-trends"));
const dbPath = join(workingDir, "pipeline.sqlite");

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
      dbPath,
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
    const local = await openLocalPipelineDb(dbPath);
    const trends = await listRouteMonthTrends(local.db);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        startMonth: "2026-01",
        endMonth: "2026-02",
        routeCount: 1,
        monthCount: 2,
        rowCount: 2,
        speedRowCount: 1,
        ridershipRowCount: 2,
        completeTrendRowCount: 1,
      }),
    );
    expect(trends).toEqual([
      expect.objectContaining({
        routeId: "T1",
        month: "2026-01",
        averageSpeedMph: 7.5,
        ridership: 1000,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      }),
      expect.objectContaining({
        routeId: "T1",
        month: "2026-02",
        averageSpeedMph: null,
        ridership: 1200,
        hasSpeedTrend: false,
        hasRidershipTrend: true,
      }),
    ]);
  });

  test("splits historical and current trend queries across source datasets", async () => {
    await removeFixtureArtifacts();

    const calledDatasets: string[] = [];
    const result = await ingestRouteTrends({
      startYear: 2024,
      startMonth: 12,
      endYear: 2025,
      endMonth: 1,
      routes: ["T1"],
      dbPath,
      fetcher: async (input) => {
        const url = new URL(String(input));
        const dataset = url.pathname.split("/").at(-1)?.replace(".json", "") ?? "";
        calledDatasets.push(dataset);

        if (dataset === "58t6-89vi") {
          expect(url.searchParams.get("$where")).toContain("year = 2024");
          return Response.json([
            {
              route_id: "T1",
              year: "2024",
              month: "12",
              observation_count: "8",
              bus_trip_count: "80",
              average_speed_mph: "6.5",
            },
          ]);
        }

        if (dataset === "kufs-yh3x") {
          expect(url.searchParams.get("$where")).toContain("year = 2025");
          return Response.json([
            {
              route_id: "T1",
              year: "2025",
              month: "1",
              observation_count: "10",
              bus_trip_count: "100",
              average_speed_mph: "7.5",
            },
          ]);
        }

        if (dataset === "kv7t-n8in") {
          expect(url.searchParams.get("$where")).toContain("2024-12-01T00:00:00");
          return Response.json([
            {
              bus_route: "T1",
              year: "2024",
              month: "12",
              ridership: "900",
              transfers: "90",
            },
          ]);
        }

        expect(dataset).toBe("gxb3-akrn");
        expect(url.searchParams.get("$where")).toContain("2025-01-01T00:00:00");
        return Response.json([
          {
            bus_route: "T1",
            year: "2025",
            month: "1",
            ridership: "1000",
            transfers: "100",
          },
        ]);
      },
    });

    expect(calledDatasets.sort()).toEqual(["58t6-89vi", "gxb3-akrn", "kufs-yh3x", "kv7t-n8in"]);
    expect(result).toEqual(
      expect.objectContaining({
        startMonth: "2024-12",
        endMonth: "2025-01",
        rowCount: 2,
        speedRowCount: 2,
        ridershipRowCount: 2,
        completeTrendRowCount: 2,
      }),
    );
  });
});

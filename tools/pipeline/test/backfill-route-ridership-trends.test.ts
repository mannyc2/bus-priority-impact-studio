import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteMonthTrends, replaceRouteMonthTrends } from "@bp/db/local";
import { backfillRouteRidershipTrends } from "../src/jobs/ingest/backfill-route-ridership-trends.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/test-backfill-route-ridership-trends"));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

async function writeFixtureTrends(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteMonthTrends(local.db, [
      {
        routeId: "T1",
        month: "2024-12",
        speedObservationCount: 9,
        speedBusTripCount: 90,
        averageSpeedMph: 7.1,
        ridership: null,
        transfers: null,
        hasSpeedTrend: true,
        hasRidershipTrend: false,
      },
      {
        routeId: "T1",
        month: "2026-01",
        speedObservationCount: 10,
        speedBusTripCount: 100,
        averageSpeedMph: 7.5,
        ridership: null,
        transfers: null,
        hasSpeedTrend: true,
        hasRidershipTrend: false,
      },
      {
        routeId: "T1",
        month: "2026-02",
        speedObservationCount: 12,
        speedBusTripCount: 120,
        averageSpeedMph: 7.8,
        ridership: 900,
        transfers: 90,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
    ]);
  } finally {
    local.sqlite.close();
  }
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
      dbPath,
      fetcher: async (input) => {
        const url = new URL(String(input));

        expect(url.searchParams.get("$where")).toContain("bus_route in('T1')");
        expect(url.searchParams.get("$where")).toContain("2026-01-01T00:00:00");

        return Response.json([{ bus_route: "T1", ridership: "1000", transfers: "125" }]);
      },
    });
    const local = await openLocalPipelineDb(dbPath);
    const trends = await listRouteMonthTrends(local.db);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        attemptedChunkCount: 1,
        updatedRowCount: 1,
        failedRowCount: 0,
        remainingRidershipMissingCount: 0,
      }),
    );
    expect(trends.find((row) => row.month === "2026-01")).toEqual(
      expect.objectContaining({
        ridership: 1000,
        transfers: 125,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      }),
    );
  });

  test("uses historical and current ridership datasets for the matching month", async () => {
    await writeFixtureTrends();

    const calledDatasets: string[] = [];
    const result = await backfillRouteRidershipTrends({
      startYear: 2024,
      startMonth: 12,
      endYear: 2026,
      endMonth: 1,
      routes: ["T1"],
      limit: 2,
      dbPath,
      fetcher: async (input) => {
        const url = new URL(String(input));
        const dataset = url.pathname.split("/").at(-1)?.replace(".json", "") ?? "";
        calledDatasets.push(dataset);

        if (dataset === "kv7t-n8in") {
          expect(url.searchParams.get("$where")).toContain("2024-12-01T00:00:00");
          return Response.json([{ bus_route: "T1", ridership: "800", transfers: "80" }]);
        }

        expect(dataset).toBe("gxb3-akrn");
        expect(url.searchParams.get("$where")).toContain("2026-01-01T00:00:00");
        return Response.json([{ bus_route: "T1", ridership: "1000", transfers: "100" }]);
      },
    });

    expect(calledDatasets.sort()).toEqual(["gxb3-akrn", "kv7t-n8in"]);
    expect(result).toEqual(
      expect.objectContaining({
        attemptedChunkCount: 2,
        updatedRowCount: 2,
        failedRowCount: 0,
        remainingRidershipMissingCount: 0,
      }),
    );
  });

  test("persists successful ridership rows when one source request fails", async () => {
    await writeFixtureTrends();

    const result = await backfillRouteRidershipTrends({
      startYear: 2024,
      startMonth: 12,
      endYear: 2026,
      endMonth: 1,
      routes: ["T1"],
      limit: 2,
      concurrency: 1,
      dbPath,
      fetcher: async (input) => {
        const url = new URL(String(input));
        if (url.searchParams.get("$where")?.includes("2024-12-01T00:00:00")) {
          throw new Error("transient source failure");
        }
        return Response.json([{ bus_route: "T1", ridership: "1000", transfers: "100" }]);
      },
    });
    const local = await openLocalPipelineDb(dbPath);
    const trends = await listRouteMonthTrends(local.db);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        attemptedChunkCount: 2,
        updatedRowCount: 1,
        failedRowCount: 1,
        remainingRidershipMissingCount: 1,
      }),
    );
    expect(trends.find((row) => row.month === "2024-12")).toEqual(
      expect.objectContaining({ hasRidershipTrend: false }),
    );
    expect(trends.find((row) => row.month === "2026-01")).toEqual(
      expect.objectContaining({ hasRidershipTrend: true, ridership: 1000 }),
    );
  });
});

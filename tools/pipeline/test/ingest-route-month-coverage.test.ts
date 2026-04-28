import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteMonthCoverage } from "@bp/db/local";
import { ingestRouteMonthCoverage } from "../src/jobs/ingest/ingest-route-month-coverage.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const dbPath = fromRepoRoot(join("data/working/test-route-month-coverage/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(fromRepoRoot(join("data/working/test-route-month-coverage")), {
    force: true,
    recursive: true,
  });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route month coverage ingestion", () => {
  test("fetches all-route speed and schedule coverage for a month", async () => {
    const result = await ingestRouteMonthCoverage({
      year: 2026,
      month: 3,
      dbPath,
      fetcher: async (input) => {
        const url = new URL(String(input));

        if (url.pathname.includes("kufs-yh3x")) {
          return Response.json([
            {
              route_id: "M1",
              observation_count: "20",
              bus_trip_count: "200",
              average_speed_mph: "6.5",
            },
          ]);
        }

        return Response.json([
          {
            route_id: "M1",
            timepoint_count: "100",
          },
          {
            route_id: "M2",
            timepoint_count: "80",
          },
        ]);
      },
    });
    const local = await openLocalPipelineDb(dbPath);
    const localCoverage = await listRouteMonthCoverage(local.db, "2026-03");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 2,
        speedRouteCount: 1,
        scheduleRouteCount: 2,
        completeCoverageRouteCount: 1,
      }),
    );
    expect(localCoverage).toEqual([
      expect.objectContaining({
        routeId: "M1",
        isoMonth: "2026-03",
        speedObservationCount: 20,
        scheduleTimepointCount: 100,
        hasSpeedData: true,
        hasScheduleData: true,
      }),
      expect.objectContaining({
        routeId: "M2",
        isoMonth: "2026-03",
        speedObservationCount: 0,
        scheduleTimepointCount: 80,
        hasSpeedData: false,
        hasScheduleData: true,
      }),
    ]);
  });
});

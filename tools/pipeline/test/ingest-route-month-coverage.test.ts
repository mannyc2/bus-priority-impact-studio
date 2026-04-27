import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ingestRouteMonthCoverage } from "../src/jobs/ingest/ingest-route-month-coverage.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/fixtures/ingest-route-month-coverage/network"));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route month coverage ingestion", () => {
  test("fetches all-route speed and schedule coverage for a month", async () => {
    const result = await ingestRouteMonthCoverage({
      year: 2026,
      month: 3,
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      workingDir,
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
    const coverage = await Bun.file(result.workingPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 2,
        speedRouteCount: 1,
        scheduleRouteCount: 2,
      }),
    );
    expect(coverage.rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        speedObservationCount: 20,
        scheduleTimepointCount: 100,
        hasSpeedData: true,
        hasScheduleData: true,
      }),
      expect.objectContaining({
        routeId: "M2",
        speedObservationCount: 0,
        scheduleTimepointCount: 80,
        hasSpeedData: false,
        hasScheduleData: true,
      }),
    ]);
    expect(summary.completeCoverageRouteCount).toBe(1);
  });
});

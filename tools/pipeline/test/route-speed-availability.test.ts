import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { checkRouteSpeedAvailability } from "../src/jobs/check/route-speed-availability.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const artifactRoot = fromRepoRoot(join("data/working/test-route-speed-availability/artifacts"));

afterEach(async () => {
  await rm(fromRepoRoot(join("data/working/test-route-speed-availability")), {
    force: true,
    recursive: true,
  });
});

describe("route speed availability check", () => {
  test("reports latest published speed month and missing requested month", async () => {
    const result = await checkRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      year: 2026,
      month: 4,
      lastBuiltYear: 2026,
      lastBuiltMonth: 2,
      minSpeedRoutes: 2,
      artifactRoot,
      fetcher: async () =>
        Response.json([
          {
            year: "2026",
            month: "3",
            route_id: "M1",
            row_count: "20",
            bus_trip_count: "200",
          },
          {
            year: "2026",
            month: "3",
            route_id: "M2",
            row_count: "10",
            bus_trip_count: "150",
          },
          {
            year: "2026",
            month: "2",
            route_id: "M1",
            row_count: "15",
            bus_trip_count: "175",
          },
        ]),
    });

    expect(result.latestSpeedMonth).toEqual(
      expect.objectContaining({
        isoMonth: "2026-03",
        routeCount: 2,
        rowCount: 30,
        busTripCount: 350,
        status: "complete",
      }),
    );
    expect(result.requestedMonth).toEqual(
      expect.objectContaining({
        isoMonth: "2026-04",
        routeCount: 0,
        rowCount: 0,
        status: "missing_speed",
      }),
    );
    expect(result.months.map((month) => [month.isoMonth, month.status])).toEqual([
      ["2026-03", "complete"],
      ["2026-02", "insufficient_speed_routes"],
    ]);
    expect(result.releaseDecision).toEqual({
      status: "new_complete_month_available",
      latestCompleteMonth: "2026-03",
      lastBuiltMonth: "2026-02",
      shouldRebuild: true,
      reason: "Latest complete speed month 2026-03 is newer than last built month 2026-02.",
    });
    expect(result.artifactPath).toBe(
      join(artifactRoot, "source-availability", "route-speed-availability.json"),
    );
    if (result.artifactPath === undefined) {
      throw new Error("Expected route-speed availability artifact path.");
    }
    await expect(Bun.file(result.artifactPath).json()).resolves.toEqual(result);
  });

  test("reports no rebuild when latest complete month is already built", async () => {
    const result = await checkRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      lastBuiltYear: 2026,
      lastBuiltMonth: 3,
      minSpeedRoutes: 1,
      artifactRoot,
      fetcher: async () =>
        Response.json([
          {
            year: "2026",
            month: "3",
            route_id: "M1",
            row_count: "20",
            bus_trip_count: "200",
          },
        ]),
    });

    expect(result.releaseDecision).toEqual({
      status: "no_new_complete_month",
      latestCompleteMonth: "2026-03",
      lastBuiltMonth: "2026-03",
      shouldRebuild: false,
      reason: "Latest complete speed month 2026-03 is not newer than last built month 2026-03.",
    });
  });
});

import { describe, expect, test } from "bun:test";
import { checkRouteSpeedAvailability } from "../src/jobs/check/route-speed-availability.js";

describe("route speed availability check", () => {
  test("reports latest published speed month and missing requested month", async () => {
    const result = await checkRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      year: 2026,
      month: 4,
      minSpeedRoutes: 2,
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
  });
});

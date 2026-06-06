import { describe, expect, test } from "bun:test";
import { routeSpeedAvailabilityArtifactPath } from "../src/artifacts";
import {
  buildRouteSpeedAvailabilityResult,
  requestedRouteSpeedAvailability,
  routeSpeedAvailabilityReleaseDecision,
  summarizeRouteSpeedAvailabilityMonths,
} from "../src/evaluation";

describe("route speed availability evaluation", () => {
  test("summarizes grouped speed rows by normalized route and month", () => {
    const months = summarizeRouteSpeedAvailabilityMonths({
      minSpeedRoutes: 2,
      rows: [
        { year: 2026, month: 3, route_id: " b41 ", row_count: 100, bus_trip_count: 10 },
        { year: 2026, month: 3, route_id: "B41", row_count: 20, bus_trip_count: 2 },
        { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
        { year: 2026, month: 2, route_id: "B41", row_count: 90, bus_trip_count: 9 },
      ],
    });

    expect(months).toEqual([
      {
        isoMonth: "2026-03",
        year: 2026,
        month: 3,
        routeCount: 2,
        rowCount: 200,
        busTripCount: 20,
        status: "complete",
      },
      {
        isoMonth: "2026-02",
        year: 2026,
        month: 2,
        routeCount: 1,
        rowCount: 90,
        busTripCount: 9,
        status: "insufficient_speed_routes",
      },
    ]);
  });

  test("builds requested-month and release-decision outputs", () => {
    const result = buildRouteSpeedAvailabilityResult({
      rows: [
        { year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 },
        { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
      ],
      checkedAt: "2026-06-06T00:00:00.000Z",
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      artifactPath: "data/artifacts/source-availability/route-speed-availability.json",
      requestedYear: 2026,
      requestedMonth: 4,
      lastBuiltYear: 2026,
      lastBuiltMonth: 2,
    });

    expect(result.latestSpeedMonth?.isoMonth).toBe("2026-03");
    expect(result.requestedMonth).toEqual({
      isoMonth: "2026-04",
      year: 2026,
      month: 4,
      routeCount: 0,
      rowCount: 0,
      busTripCount: 0,
      status: "missing_speed",
    });
    expect(result.releaseDecision).toMatchObject({
      status: "new_complete_month_available",
      latestCompleteMonth: "2026-03",
      lastBuiltMonth: "2026-02",
      shouldRebuild: true,
    });
  });

  test("handles absent complete months and package-owned path naming", () => {
    expect(
      routeSpeedAvailabilityReleaseDecision({
        latestSpeedMonth: null,
        lastBuiltYear: undefined,
        lastBuiltMonth: undefined,
      }),
    ).toMatchObject({
      status: "no_complete_speed_month",
      shouldRebuild: false,
    });
    expect(
      requestedRouteSpeedAvailability({
        months: [],
        year: 2026,
        month: 5,
      }).status,
    ).toBe("missing_speed");
    expect(routeSpeedAvailabilityArtifactPath("data/artifacts")).toBe(
      "data/artifacts/source-availability/route-speed-availability.json",
    );
  });
});

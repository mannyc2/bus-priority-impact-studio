import { describe, expect, test } from "bun:test";
import type { LocalRouteCatalogEntry, LocalRouteMonthCoverage } from "@bp/db/local";
import {
  buildReadinessRows,
  missingRouteReadinessInputs,
  routeReadinessStatus,
  scoreReadiness,
} from "../src/local-db";

function route(overrides: Partial<LocalRouteCatalogEntry>): LocalRouteCatalogEntry {
  return {
    routeId: "M15",
    routeShortName: "M15",
    routeLongName: "Select Bus Service",
    routeTypes: ["local"],
    directions: ["0", "1"],
    shapeCount: 2,
    stopCount: 20,
    timepointStopCount: 8,
    latitudeMin: null,
    latitudeMax: null,
    longitudeMin: null,
    longitudeMax: null,
    ...overrides,
  };
}

function coverage(overrides: Partial<LocalRouteMonthCoverage>): LocalRouteMonthCoverage {
  return {
    routeId: "M15",
    isoMonth: "2026-03",
    speedObservationCount: 100,
    speedBusTripCount: 50,
    averageSpeedMph: 8.5,
    scheduleTimepointCount: 200,
    hasSpeedData: true,
    hasScheduleData: true,
    ...overrides,
  };
}

describe("route readiness", () => {
  test("scores complete route coverage as ready", () => {
    const catalogRoute = route({});
    const monthCoverage = coverage({});

    expect(scoreReadiness({ route: catalogRoute, coverage: monthCoverage })).toBe(100);
    expect(missingRouteReadinessInputs({ route: catalogRoute, coverage: monthCoverage })).toEqual(
      [],
    );
    expect(routeReadinessStatus([])).toBe("ready");
  });

  test("builds sorted readiness rows with explicit missing inputs", () => {
    const rows = buildReadinessRows(
      [
        route({ routeId: "B1", routeShortName: "B1", shapeCount: 0, stopCount: 0 }),
        route({ routeId: "M15", routeShortName: "M15" }),
        route({ routeId: "Q44", routeShortName: "Q44" }),
      ],
      [
        coverage({ routeId: "M15", averageSpeedMph: 7.5 }),
        coverage({
          routeId: "Q44",
          speedObservationCount: 0,
          speedBusTripCount: 0,
          averageSpeedMph: null,
          hasSpeedData: false,
        }),
      ],
      "2026-03",
    );

    expect(rows.map((row) => [row.routeId, row.readinessStatus, row.readinessScore])).toEqual([
      ["M15", "ready", 100],
      ["Q44", "missing_speed", 60],
      ["B1", "missing_geometry", 15],
    ]);
    expect(rows.find((row) => row.routeId === "Q44")?.missingInputs).toEqual([
      "segment_speeds",
      "speed_bus_trips",
    ]);
    expect(rows.find((row) => row.routeId === "B1")?.missingInputs).toEqual([
      "segment_speeds",
      "speed_bus_trips",
      "schedules",
      "route_shapes",
      "stops",
    ]);
  });
});

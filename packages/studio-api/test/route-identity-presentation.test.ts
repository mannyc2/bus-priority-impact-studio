import { describe, expect, test } from "bun:test";
import type { StudioRouteIndexSourceRow } from "@bp/db/d1";
import {
  buildStudioRouteCardFromIndexRow,
  normalizeStudioRouteIndexSourceRow,
} from "../src/studio/route-index-read-model.js";

function schoolRouteSource(
  tripTypes: string[],
  routeTypes: string[] = ["School"],
): StudioRouteIndexSourceRow {
  return {
    routeId: "B70",
    routeShortName: "B70",
    routeLongName: "School service",
    routeTypes,
    tripTypes,
    shapeCount: 2,
    stopCount: 12,
    timepointStopCount: 4,
    readiness: null,
    summary: null,
    artifactNames: [],
    historyCoverage: {
      startMonth: null,
      endMonth: null,
      pointCount: 0,
      speedMonthCount: 0,
      ridershipMonthCount: 0,
    },
    historyStats: {
      firstSpeedMonth: null,
      firstAverageSpeedMph: null,
      latestSpeedMonth: null,
      latestAverageSpeedMph: null,
      speedChangeMph: null,
      firstRidershipMonth: null,
      firstRidership: null,
      latestRidershipMonth: null,
      latestRidership: null,
      ridershipChange: null,
      speedMovement6mPct: null,
      speedMovement12mPct: null,
    },
    speedHistoryCoverage: null,
  };
}

describe("Studio API exact route identity presentation", () => {
  test("preserves plural School service designations from official trip_type literals", () => {
    const route = buildStudioRouteCardFromIndexRow(
      normalizeStudioRouteIndexSourceRow(schoolRouteSource(["11", "10"])),
      undefined,
      null,
    );

    expect(route).toMatchObject({
      routeId: "B70",
      displayLabel: "B70",
      routeTypes: ["School"],
      tripTypes: ["10", "11"],
      designationLiterals: ["route_type:School", "trip_type:10", "trip_type:11"],
      serviceModes: ["school_limited", "school_local"],
      sbs: false,
    });
  });

  test("fails closed when School has no school trip_type designation", () => {
    expect(() =>
      buildStudioRouteCardFromIndexRow(
        normalizeStudioRouteIndexSourceRow(schoolRouteSource(["1"])),
        undefined,
        null,
      ),
    ).toThrow(/School requires trip_type 10 and\/or 11/);
  });

  test("fails closed on an unknown future official trip_type literal", () => {
    expect(() =>
      buildStudioRouteCardFromIndexRow(
        normalizeStudioRouteIndexSourceRow(schoolRouteSource(["15"])),
        undefined,
        null,
      ),
    ).toThrow();
  });
});

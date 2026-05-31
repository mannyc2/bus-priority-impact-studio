import { describe, expect, test } from "bun:test";
import { classifyPublicRouteVisibility } from "../src/index.js";

const visibleRoute = {
  routeId: "M1",
  routeLongName: "M1 Corridor",
  routeTypes: ["Local"],
  shapeCount: 1,
  coverageStatus: "full" as const,
  ridershipWindowCount: 168,
  totalRidership: 10_000,
};

describe("public route visibility", () => {
  test("requires rider-hours inputs for public Studio routes", () => {
    expect(
      classifyPublicRouteVisibility({
        ...visibleRoute,
        ridershipWindowCount: 0,
        totalRidership: 0,
      }),
    ).toEqual({
      publicVisible: false,
      reason: "missing_ridership_exposure",
    });
  });

  test("keeps sourced standard routes public", () => {
    expect(classifyPublicRouteVisibility(visibleRoute)).toEqual({
      publicVisible: true,
      reason: "standard_route",
    });
  });
});

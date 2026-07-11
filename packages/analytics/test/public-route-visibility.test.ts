import { describe, expect, test } from "bun:test";
import { classifyPublicRouteVisibility } from "@bp/analytics/public-route-visibility";

const visibleRoute = {
  routeId: "M1",
  routeLongName: "M1 Corridor",
  routeTypes: ["Local"],
  shapeCount: 1,
  coverageStatus: "full" as const,
};

describe("public route visibility", () => {
  test("hides placeholder routes without public metadata", () => {
    expect(
      classifyPublicRouteVisibility({
        routeId: "UNKNOWN",
        routeLongName: null,
        routeTypes: [],
        shapeCount: 0,
        coverageStatus: "full",
      }),
    ).toEqual({
      publicVisible: false,
      reason: "placeholder_without_public_metadata",
    });
  });

  test("keeps sourced standard routes public", () => {
    expect(classifyPublicRouteVisibility(visibleRoute)).toEqual({
      publicVisible: true,
      reason: "standard_route",
    });
  });
});

import { describe, expect, test } from "bun:test";
import { routeLionLinkBufferDegrees, routeLionLinkRouteRowsQuery } from "../src/local-db";

describe("route LION link local DB builder", () => {
  test("converts meter buffers to the spatial degree approximation used by local matching", () => {
    expect(routeLionLinkBufferDegrees(25)).toBeCloseTo(0.0002717391304, 12);
    expect(routeLionLinkBufferDegrees(50)).toBeCloseTo(0.0005434782608, 12);
  });

  test("builds a route allowlist query only when routes are supplied", () => {
    expect(routeLionLinkRouteRowsQuery(undefined)).toEqual({
      sql: "SELECT DISTINCT route_id FROM local_route_shape_geom ORDER BY route_id",
      bindings: [],
    });

    expect(routeLionLinkRouteRowsQuery(["M15", "Bx12"])).toEqual({
      sql: "SELECT DISTINCT route_id FROM local_route_shape_geom WHERE route_id IN (?,?)",
      bindings: ["M15", "Bx12"],
    });
  });
});

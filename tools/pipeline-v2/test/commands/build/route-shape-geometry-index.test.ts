import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/build/route-shape-geometry-index.ts",
);

describe("route shape geometry index command boundary", () => {
  test("keeps geometry grouping and local writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runBuildRouteShapeGeometryIndexFromShapes({");
    expect(source).toContain("normalizeRouteShapeRows");
    expect(source).not.toContain("function extractLineStrings");
    expect(source).not.toContain("function buildMultiLineString");
    expect(source).not.toContain("INSERT INTO local_route_shape_geom");
    expect(source).not.toContain("SetSRID(GeomFromGeoJSON");
  });
});

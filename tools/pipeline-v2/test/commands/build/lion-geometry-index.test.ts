import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/lion-geometry-index.ts");

describe("build lion-geometry-index command boundary", () => {
  test("keeps LION geometry materialization and spatial table helpers in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runBuildLionGeometryIndex({");
    expect(source).not.toContain("GeomFromText");
    expect(source).not.toContain("GeomFromGeoJSON");
    expect(source).not.toContain("local_lion_segment_geom");
    expect(source).not.toContain("ensureLionSegmentGeomColumn");
    expect(source).not.toContain("unwrapGeoJsonGeometry");
  });
});

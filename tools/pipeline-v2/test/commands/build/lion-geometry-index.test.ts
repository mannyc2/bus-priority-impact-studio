import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/lion-geometry-index.ts");

describe("build lion-geometry-index command boundary", () => {
  test("keeps LION geometry materialization and spatial table helpers in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/build-local-db.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runBuildLionGeometryIndexCommand({");
    expect(source).toContain("makeBuildLocalDbCommandLayer({");
    expect(source).toContain("localDbOptions: { spatial: true }");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain("GeomFromText");
    expect(source).not.toContain("GeomFromGeoJSON");
    expect(source).not.toContain("local_lion_segment_geom");
    expect(source).not.toContain("ensureLionSegmentGeomColumn");
    expect(source).not.toContain("unwrapGeoJsonGeometry");
  });
});

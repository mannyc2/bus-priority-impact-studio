import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/route-lion-link.ts");

describe("build route-lion-link command boundary", () => {
  test("keeps route/LION spatial matching and local writes in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/build-local-db.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runBuildRouteLionLinkCommand({");
    expect(source).toContain("makeBuildLocalDbCommandLayer({");
    expect(source).toContain("localDbOptions: { spatial: true }");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain("ST_Buffer");
    expect(source).not.toContain("local_route_lion_link");
    expect(source).not.toContain("local_route_shape_geom");
    expect(source).not.toContain("SpatialIndex");
    expect(source).not.toContain("BEGIN");
  });
});

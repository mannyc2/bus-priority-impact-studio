import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/route-lion-link.ts");

describe("build route-lion-link command boundary", () => {
  test("keeps route/LION spatial matching and local writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runBuildRouteLionLink({");
    expect(source).not.toContain("ST_Buffer");
    expect(source).not.toContain("local_route_lion_link");
    expect(source).not.toContain("local_route_shape_geom");
    expect(source).not.toContain("SpatialIndex");
    expect(source).not.toContain("BEGIN");
  });
});

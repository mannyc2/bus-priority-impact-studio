import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/observed-headways.ts");

describe("build observed-headways command boundary", () => {
  test("keeps GTFS-RT headway derivation and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runBuildObservedHeadways({");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("maxHeadwaySeconds");
    expect(source).not.toContain("function vehicleKey");
    expect(source).not.toContain("headwayGroupKey");
    expect(source).not.toContain("replaceObservedHeadwayRows");
  });
});

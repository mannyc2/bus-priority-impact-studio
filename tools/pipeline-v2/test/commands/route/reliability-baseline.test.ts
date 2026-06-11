import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/reliability-baseline.ts");

describe("route reliability-baseline command boundary", () => {
  test("keeps scheduled-headway baseline construction and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runRouteReliabilityBaseline({");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listRouteSchedules");
    expect(source).not.toContain("replaceRouteReliabilityRows");
    expect(source).not.toContain("longGapThresholdMinutes");
    expect(source).not.toContain("function quantile");
    expect(source).not.toContain("buildHeadwayGroups(");
  });
});

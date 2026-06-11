import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/equity-context.ts");

describe("route equity-context command boundary", () => {
  test("keeps county-proxy equity aggregation and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runRouteEquityContext({");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listCensusTractEquityContext");
    expect(source).not.toContain("replaceRouteEquityRows");
    expect(source).not.toContain("routePrefixCountyRules");
    expect(source).not.toContain("function weightedMean");
    expect(source).not.toContain("buildCountyAggregates(");
  });
});

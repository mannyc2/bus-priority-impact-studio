import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/audit/local-db-query-baselines.ts",
);

describe("local-db-query-baselines command boundary", () => {
  test("keeps hot query baseline SQL ownership in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("buildLocalDbHotQueryBaselines({");
    expect(source).not.toContain("EXPLAIN QUERY PLAN");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("local_route_month_trend");
    expect(source).not.toContain("local_route_intervention_comparison");
  });
});

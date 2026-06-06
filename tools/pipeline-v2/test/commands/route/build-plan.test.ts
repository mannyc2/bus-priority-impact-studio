import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/build-plan.ts");

describe("route build-plan command boundary", () => {
  test("keeps route build-plan ranking and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runRouteBuildPlan({");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listRouteReadiness");
    expect(source).not.toContain("replaceRouteBuildPlan");
    expect(source).not.toContain("function priorityScore");
    expect(source).not.toContain("function compareCandidates");
    expect(source).not.toContain("planStatusPriority");
  });
});

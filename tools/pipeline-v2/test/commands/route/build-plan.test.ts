import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/build-plan.ts");

describe("route build-plan command boundary", () => {
  test("runs route build-plan through the Effect service boundary", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/route-build-plan.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runRouteBuildPlanCommand({");
    expect(source).toContain("makeRouteBuildPlanCommandLayer({");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listRouteReadiness");
    expect(source).not.toContain("replaceRouteBuildPlan");
    expect(source).not.toContain("function priorityScore");
    expect(source).not.toContain("function compareCandidates");
    expect(source).not.toContain("planStatusPriority");
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/readiness.ts");

describe("route readiness command boundary", () => {
  test("keeps readiness scoring and local DB writes in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/route-local-db.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runRouteReadinessCommand({");
    expect(source).toContain("makeRouteLocalDbCommandLayer({");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listRouteCatalog");
    expect(source).not.toContain("replaceRouteReadiness");
    expect(source).not.toContain("function scoreReadiness");
    expect(source).not.toContain("function missingInputs");
    expect(source).not.toContain("statusPriority");
  });
});

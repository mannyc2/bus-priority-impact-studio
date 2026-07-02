import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/observed-reliability.ts");

describe("route observed-reliability command boundary", () => {
  test("keeps observed reliability metrics and local DB writes in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/route-local-db.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runRouteObservedReliabilityCommand({");
    expect(source).toContain("makeRouteLocalDbCommandLayer({");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listObservedHeadwaySamples");
    expect(source).not.toContain("replaceRouteObservedReliabilityRows");
    expect(source).not.toContain("fallbackBunchingThresholdMinutes");
    expect(source).not.toContain("function quantile");
    expect(source).not.toContain("canonicalRouteId");
  });
});

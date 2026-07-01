import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/observed-headways.ts");

describe("build observed-headways command boundary", () => {
  test("keeps GTFS-RT headway derivation and local DB writes in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/build-local-db.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runBuildObservedHeadwaysCommand({");
    expect(source).toContain("makeBuildLocalDbCommandLayer({");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("maxHeadwaySeconds");
    expect(source).not.toContain("function vehicleKey");
    expect(source).not.toContain("headwayGroupKey");
    expect(source).not.toContain("replaceObservedHeadwayRows");
  });
});

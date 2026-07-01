import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/segment-daypart-panel.ts");

describe("build segment-daypart-panel command boundary", () => {
  test("keeps path policy and panel artifact construction in analytics", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/feature-history"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("loadSegmentDaypartHistoryLocalDbRows({");
    expect(source).toContain("buildSegmentDaypartPanelArtifact({");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new BunDatabase");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("hour_of_day BETWEEN");
  });
});

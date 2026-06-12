import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/segment-daypart-panel.ts");

describe("build segment-daypart-panel command boundary", () => {
  test("keeps panel SQL and artifact construction in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/feature-history"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("loadSegmentDaypartHistoryLocalDbRows({");
    expect(source).toContain("buildSegmentDaypartPanelArtifact({");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("hour_of_day BETWEEN");
  });
});

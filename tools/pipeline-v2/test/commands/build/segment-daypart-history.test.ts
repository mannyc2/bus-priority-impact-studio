import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/segment-daypart-history.ts");

describe("build segment-daypart-history command boundary", () => {
  test("keeps segment-speed SQL and feature artifact construction in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/feature-history"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("loadSegmentDaypartHistoryLocalDbRows({");
    expect(source).toContain("buildSegmentDaypartHistoryArtifact({");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("hour_of_day BETWEEN");
    expect(source).not.toContain("segment_daypart_history");
  });
});

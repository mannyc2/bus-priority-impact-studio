import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/audit/studio-coverage.ts",
);

describe("audit studio-coverage command boundary", () => {
  test("delegates Studio route and brief coverage policy to applied research", async () => {
    const source = await readFile(commandPath, "utf8");

    expect(source).toContain("withLocalDb({ readonly: true })");
    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain("auditRouteBriefInputHourlyBins");
    expect(source).toContain("auditProjectionSegmentHourBins");
    expect(source).not.toContain("StudioAiPublicNoteSchema");
    expect(source).not.toContain("function hasCompleteScheduleComparison");
    expect(source).not.toContain("function hasDotLaneGeometryEvidence");
    expect(source).not.toContain("function hasRouteSegmentCoverageMetadata");
    expect(source).not.toContain("function hasValidPublicAiNote");
    expect(source).not.toContain("function routePublicAiNoteLimit");
  });
});

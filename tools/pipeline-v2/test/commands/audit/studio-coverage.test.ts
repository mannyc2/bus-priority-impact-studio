import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/studio-coverage.ts");

describe("audit studio-coverage command boundary", () => {
  test("keeps filesystem-backed Studio route and brief coverage policy in pipeline lib", async () => {
    const source = await readFile(commandPath, "utf8");

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
    expect(source).toContain('from "../../lib/studio-coverage-evaluation.ts"');
    expect(source).not.toContain('from "@bp/applied-research/evaluation"');
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

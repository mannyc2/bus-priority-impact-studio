import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL("../../../src/commands/audit/detector-closure.ts", import.meta.url);

describe("analysis dependency closure audit boundary", () => {
  test("keeps dependency closure construction and markdown rendering in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain("buildAnalysisDependencyClosure({");
    expect(source).toContain("renderAnalysisDependencyClosureMarkdown(artifact)");
    expect(source).not.toContain("@bp/analytics/registry");
    expect(source).not.toContain("PLANNED_ANALYSIS_UNITS");
    expect(source).not.toContain("productCompletenessStatusMap");
    expect(source).not.toContain("detectorUsesInterventionEvidence");
  });
});

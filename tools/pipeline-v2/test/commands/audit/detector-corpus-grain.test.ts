import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/audit/detector-corpus-grain.ts",
  import.meta.url,
);

describe("detector corpus grain audit command boundary", () => {
  test("keeps audit construction and markdown rendering in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain("buildDetectorCorpusGrainAudit({");
    expect(source).toContain("renderDetectorCorpusGrainAuditMarkdown(audit)");
    expect(source).not.toContain("listAnalyticsDetectors");
    expect(source).not.toContain("FEATURE_GRAIN_PROFILES");
    expect(source).not.toContain("ROUTE_MONTH_RECLASSIFICATIONS");
    expect(source).not.toContain("function buildFeatureGrainAudit");
    expect(source).not.toContain("function releaseChecksForDetector");
  });
});

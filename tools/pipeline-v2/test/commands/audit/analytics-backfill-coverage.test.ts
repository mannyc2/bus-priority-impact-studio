import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/audit/analytics-backfill-coverage.ts",
  import.meta.url,
);

describe("analytics backfill coverage audit boundary", () => {
  test("keeps backfill row loading and artifact construction in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("buildAppliedAnalyticsBackfillCoverageAudit({");
    expect(source).toContain("loadAnalyticsBackfillCoverageLocalDbRows({");
    expect(source).not.toContain("BACKFILL_SURFACES");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("sqlite.query");
    expect(source).not.toContain("monthRange");
  });
});

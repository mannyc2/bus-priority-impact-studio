import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/audit/analytics-corpus-profile.ts",
  import.meta.url,
);

describe("analytics corpus profile audit boundary", () => {
  test("keeps corpus profile row loading and artifact construction in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("buildAnalyticsCorpusProfile({");
    expect(source).toContain("loadAnalyticsCorpusProfileLocalDbRows({");
    expect(source).not.toContain("@bp/analytics/corpus");
    expect(source).not.toContain("summarizeCorpusProfile");
    expect(source).not.toContain("OBSERVATION_QUERIES");
    expect(source).not.toContain("local_route_month_trend");
  });
});

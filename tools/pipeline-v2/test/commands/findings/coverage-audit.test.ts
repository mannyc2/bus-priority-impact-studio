import { describe, expect, test } from "bun:test";

describe("findings coverage-audit boundary", () => {
  test("keeps detector coverage artifact construction and row loading out of the command", async () => {
    const text = await Bun.file(
      new URL("../../../src/commands/findings/coverage-audit.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/evaluation");
    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).not.toContain("local_finding_candidate");
    expect(text).not.toContain("local_finding_evidence_link");
    expect(text).not.toContain("local_finding_coverage_audit");
    expect(text).not.toContain("detector_score");
    expect(text).not.toContain("candidate_reason");
  });
});

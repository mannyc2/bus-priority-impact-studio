import { describe, expect, test } from "bun:test";

describe("findings review-packets boundary", () => {
  test("keeps local finding row loading out of the pipeline command", async () => {
    const text = await Bun.file(
      new URL("../src/commands/findings/review-packets.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).toContain("@bp/applied-research/review-packets");
    expect(text).not.toContain("@bp/domain/findings");
    expect(text).not.toContain("local_finding_candidate");
    expect(text).not.toContain("local_finding_evidence_link");
    expect(text).not.toContain("local_finding_coverage_audit");
    expect(text).not.toContain("FindingCandidateSchema");
    expect(text).not.toContain("FindingEvidenceLinkSchema");
    expect(text).not.toContain("FindingCoverageAuditSchema");
  });
});

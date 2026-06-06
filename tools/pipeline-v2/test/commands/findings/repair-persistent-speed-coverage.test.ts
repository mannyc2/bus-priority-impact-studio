import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/findings/repair-persistent-speed-coverage.ts",
);

describe("findings repair-persistent-speed-coverage boundary", () => {
  test("keeps repair construction and row loading out of the command", () => {
    const text = readFileSync(commandPath, "utf8");

    expect(text).toContain('from "@bp/applied-research/evaluation"');
    expect(text).toContain('from "@bp/applied-research/local-db"');
    expect(text).toContain("PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID");
    expect(text).not.toContain("@bp/analytics");
    expect(text).not.toContain("local_finding_candidate c");
    expect(text).not.toContain("local_finding_evidence_link");
    expect(text).not.toContain("FindingCoverageAuditSchema");
    expect(text).not.toContain("stableId");
    expect(text).not.toContain("parseEvidenceRef");
  });
});

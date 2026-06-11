import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/review-packet-coverage.ts");

describe("audit review-packet-coverage boundary", () => {
  test("keeps review packet coverage gate policy in applied-research", async () => {
    const source = await readFile(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain("evaluateReviewPacketCoverageGate({");

    expect(source).not.toContain("function numberValue");
    expect(source).not.toContain("function text");
    expect(source).not.toContain("missingPacketCount > 0");
    expect(source).not.toContain("packetsWithoutPrimaryEvidence > 0");
    expect(source).not.toContain("packetsWithoutCoverage > 0");
    expect(source).not.toContain('status === "partial"');
  });
});

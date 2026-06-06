import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/evidence-corpus.ts");

describe("audit evidence-corpus boundary", () => {
  test("keeps evidence corpus audit policy in applied-research", async () => {
    const source = await readFile(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain("buildEvidenceCorpusAudit({");

    expect(source).not.toContain("function asRecord");
    expect(source).not.toContain("function numberField");
    expect(source).not.toContain("primaryEvidenceAllowedCount =");
    expect(source).not.toContain("detectorCandidateCount =");
    expect(source).not.toContain("reviewUnlinked =");
    expect(source).not.toContain("no source is currently eligible for primary evidence");
    expect(source).not.toContain("detector candidates have no evidence links");
  });
});

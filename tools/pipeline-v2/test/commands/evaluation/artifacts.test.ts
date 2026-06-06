import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("evaluation artifacts command boundary", () => {
  test("keeps payload, manifest, hashing, and verification policy in applied-research", () => {
    const source = readFileSync("tools/pipeline-v2/src/commands/evaluation/artifacts.ts", "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).not.toContain("createHash");
    expect(source).not.toContain("function hashBytes");
    expect(source).not.toContain("function payloadContractIssues");
    expect(source).not.toContain("function verifyArtifactFile");
    expect(source).not.toContain("function isEvaluationArtifactManifest");
    expect(source).not.toContain("export type EvaluationArtifactManifest =");
  });
});

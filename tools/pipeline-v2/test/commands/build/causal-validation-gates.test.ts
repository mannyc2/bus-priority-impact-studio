import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/causal-validation-gates.ts");

describe("build causal-validation-gates command boundary", () => {
  test("keeps causal gate derivation in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/causal"');
    expect(source).toContain("buildCausalValidationGatesArtifact({");
    expect(source).not.toContain("gateStatusCounts");
    expect(source).not.toContain("preTrendStatus");
  });
});

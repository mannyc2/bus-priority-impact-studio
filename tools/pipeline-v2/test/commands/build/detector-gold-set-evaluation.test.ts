import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/build/detector-gold-set-evaluation.ts",
  import.meta.url,
);

describe("build detector-gold-set-evaluation boundary", () => {
  test("keeps gold-set evaluation assembly in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain("buildDetectorGoldSetEvaluationArtifact({");
    expect(source).not.toContain("@bp/analytics/calibration");
    expect(source).not.toContain("evaluateGoldSet");
    expect(source).not.toContain("GoldSetExpectation");
    expect(source).not.toContain("function shouldFlag");
    expect(source).not.toContain("falseNegativeDiscoveryScopes =");
  });
});

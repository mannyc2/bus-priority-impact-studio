import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectorEvaluationLabelsPath } from "../../../src/commands/build/detector-evaluation-labels";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/build/detector-evaluation-labels.ts",
);

describe("build detector evaluation labels command boundary", () => {
  test("keeps local coverage SQL and path naming in applied-research", () => {
    const text = readFileSync(commandPath, "utf8");

    expect(text).toContain('from "@bp/applied-research/artifacts"');
    expect(text).toContain('from "@bp/applied-research/evaluation"');
    expect(text).toContain('from "@bp/applied-research/local-db"');
    expect(text).not.toContain("local_finding_coverage_audit");
    expect(text).not.toContain("ROW_NUMBER()");
    expect(text).not.toContain("DetectorEvaluationCoverageRow");
  });

  test("uses the package-owned detector evaluation labels path", () => {
    expect(
      detectorEvaluationLabelsPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation-labels.json",
    );
  });
});

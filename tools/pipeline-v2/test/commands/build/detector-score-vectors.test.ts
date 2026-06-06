import { describe, expect, test } from "bun:test";
import { detectorScoreVectorsPath } from "../../../src/commands/build/detector-score-vectors.ts";

describe("build detector-score-vectors boundary", () => {
  test("keeps score-vector research logic out of the pipeline command", async () => {
    const text = await Bun.file(
      new URL("../../../src/commands/build/detector-score-vectors.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).toContain("@bp/applied-research/score-vectors");
    expect(text).not.toContain("local_finding_coverage_audit");
    expect(text).not.toContain("local_finding_candidate");
    expect(text).not.toContain("buildGenericDetectorScoreVectorArtifact");
  });

  test("uses the applied-research detector score-vector artifact namespace", () => {
    expect(
      detectorScoreVectorsPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/detector-score-vectors/2023-04_to_2026-03/2026-03/detector-score-vectors.json",
    );
  });
});

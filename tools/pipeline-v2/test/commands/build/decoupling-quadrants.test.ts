import { describe, expect, test } from "bun:test";
import { decouplingQuadrantsArtifactPath } from "../../../src/commands/build/decoupling-quadrants.ts";

describe("build decoupling-quadrants", () => {
  test("uses the decoupling quadrants model artifact namespace", () => {
    expect(
      decouplingQuadrantsArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/decoupling-quadrants-v1/2023-04_to_2026-03/2026-03/decoupling-quadrants.json",
    );
  });
});

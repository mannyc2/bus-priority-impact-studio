import { describe, expect, test } from "bun:test";
import {
  treatmentDetectorReviewArtifactPath,
  treatmentDetectorReviewMarkdownPath,
} from "../../../src/commands/findings/treatment-review.ts";

describe("findings treatment-review", () => {
  test("uses the detector-preview artifact namespace", () => {
    expect(
      treatmentDetectorReviewArtifactPath({
        artifactRoot: "data/artifacts",
        month: "2026-03",
      }),
    ).toBe("data/artifacts/detector-previews/2026-03/treatment-review.json");
    expect(
      treatmentDetectorReviewMarkdownPath({
        artifactRoot: "data/artifacts",
        month: "2026-03",
      }),
    ).toBe("data/artifacts/detector-previews/2026-03/treatment-review.md");
  });
});


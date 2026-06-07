import { describe, expect, test } from "bun:test";
import {
  treatmentEventCandidateCausalReviewPath,
  treatmentEventPanelArtifactPath,
} from "../../../src/commands/build/treatment-event-panel.ts";

describe("build treatment-event-panel", () => {
  test("uses the treatment event model artifact namespace", () => {
    expect(
      treatmentEventPanelArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/treatment-event-panel.json",
    );
    expect(
      treatmentEventCandidateCausalReviewPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/candidate-causal-review.json",
    );
  });
});

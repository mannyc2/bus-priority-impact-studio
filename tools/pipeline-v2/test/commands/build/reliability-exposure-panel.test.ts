import { describe, expect, test } from "bun:test";
import { reliabilityExposurePanelArtifactPath } from "../../../src/commands/build/reliability-exposure-panel.ts";

describe("build reliability-exposure-panel", () => {
  test("uses the reliability exposure model artifact namespace", () => {
    expect(
      reliabilityExposurePanelArtifactPath({
        artifactRoot: "data/artifacts",
        releaseMonth: "2026-03",
        runId: "bus-observatory-2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/reliability-exposure-panel-v1/2026-03/bus-observatory-2026-03/reliability-exposure-panel.json",
    );
  });
});

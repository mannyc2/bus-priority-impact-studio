import { describe, expect, test } from "bun:test";
import { pulseFingerprintArtifactPath } from "../../../src/commands/build/pulse-fingerprint.ts";

describe("build pulse-fingerprint", () => {
  test("uses the pulse fingerprint model artifact namespace", () => {
    expect(
      pulseFingerprintArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/pulse-fingerprint-v1/2023-04_to_2026-03/2026-03/pulse-fingerprint.json",
    );
  });
});

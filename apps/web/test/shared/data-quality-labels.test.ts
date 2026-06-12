import { describe, expect, test } from "bun:test";
import {
  completenessStatusLabel,
  releaseLayerDescription,
  releaseLayerLabel,
} from "../../src/components/route/data-quality-labels";
import type { StudioQuality } from "../../src/studio/api-contract";

describe("data quality display labels", () => {
  test("renders the ADR-0017 release labels without leaking snake_case", () => {
    const expected: Record<StudioQuality["releaseLayer"], string> = {
      baseline_release: "Baseline Release",
      current_signal: "Current Signal",
      pending_publication: "Pending Publication",
      observed_release: "Observed Release",
    };

    for (const [layer, label] of Object.entries(expected) as Array<
      [StudioQuality["releaseLayer"], string]
    >) {
      expect(releaseLayerLabel(layer)).toBe(label);
      expect(releaseLayerDescription(layer).length).toBeGreaterThan(20);
      expect(releaseLayerDescription(layer)).not.toContain("_");
    }
  });

  test("renders completeness status labels without raw enum separators", () => {
    const statuses: StudioQuality["completenessStatus"][] = [
      "complete",
      "partial_public_monthly_only",
      "missing_realtime",
      "insufficient_samples",
      "source_lag_expected",
      "unavailable",
    ];

    for (const status of statuses) {
      expect(completenessStatusLabel(status)).not.toContain("_");
    }
  });
});

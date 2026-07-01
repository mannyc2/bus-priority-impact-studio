import { describe, expect, test } from "bun:test";
import {
  type AnalyticsDetector,
  type FeatureResolver,
  runAnalyticsDetector,
} from "@bp/analytics/core";
import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "@bp/analytics/detectors";
import { getFindingDetectorSpec } from "@bp/analytics/registry";

describe("analytics detector runner", () => {
  test("runs a detector through a resolver port and returns structured feature satisfaction", () => {
    type FixtureInput = { readonly values: readonly number[] };

    const spec = getFindingDetectorSpec(SPEED_PACE_HOTSPOT_DETECTOR_ID);
    if (spec === null) throw new Error("Missing speed pace detector spec fixture.");

    const detector: AnalyticsDetector<FixtureInput> = {
      detectorId: spec.detectorId,
      version: "fixture",
      spec,
      featureGrains: ["segment_daypart", "feed_health"],
      scope: { kind: "segment", description: "Fixture segment detector." },
      run: (detectorInput) => {
        expect(detectorInput.values).toEqual([1, 2, 3]);
        return { candidates: [], evidence: [], coverage: [] };
      },
    };

    const resolver: FeatureResolver<FixtureInput> = {
      resolverId: "fixture.in_memory",
      resolve: (request) => {
        expect(request.detector.detectorId).toBe(spec.detectorId);
        expect(request.featureGrains).toEqual(["segment_daypart", "feed_health"]);
        expect(request.context.month).toBe("2026-03");
        return {
          detectorInput: { values: [1, 2, 3] },
          inputSummary: { featureCount: 3 },
          featureContracts: [
            {
              featureGrain: "segment_daypart",
              resolverId: "fixture.in_memory",
              status: "resolved",
              reason: "Fixture rows supplied by the in-memory resolver.",
            },
            {
              featureGrain: "feed_health",
              resolverId: "fixture.quality",
              status: "satisfied_by_feature_quality",
              reason: "Fixture quality fields satisfy the embedded feed-health gate.",
            },
          ],
        };
      },
    };

    const result = runAnalyticsDetector({
      detector,
      resolver,
      context: {
        detectorRunId: "speed_pace_hotspot-2026-03-fixture",
        month: "2026-03",
        generatedAt: "2026-06-09T00:00:00.000Z",
        scope: { kind: "segment", scopeId: "M15:N:1" },
      },
    });

    expect(result.output).toEqual({ candidates: [], evidence: [], coverage: [] });
    expect(result.inputSummary).toEqual({ featureCount: 3 });
    expect(result.featureContracts).toEqual([
      expect.objectContaining({ featureGrain: "segment_daypart", status: "resolved" }),
      expect.objectContaining({
        featureGrain: "feed_health",
        status: "satisfied_by_feature_quality",
      }),
    ]);
  });

  test("requires resolver satisfaction for every declared feature grain", () => {
    type FixtureInput = { readonly values: readonly number[] };

    const spec = getFindingDetectorSpec(SPEED_PACE_HOTSPOT_DETECTOR_ID);
    if (spec === null) throw new Error("Missing speed pace detector spec fixture.");

    const detector: AnalyticsDetector<FixtureInput> = {
      detectorId: spec.detectorId,
      version: "fixture",
      spec,
      featureGrains: ["segment_daypart", "feed_health"],
      scope: { kind: "segment", description: "Fixture segment detector." },
      run: () => ({ candidates: [], evidence: [], coverage: [] }),
    };

    const resolver: FeatureResolver<FixtureInput> = {
      resolverId: "fixture.incomplete",
      resolve: () => ({
        detectorInput: { values: [1, 2, 3] },
        featureContracts: [
          {
            featureGrain: "segment_daypart",
            resolverId: "fixture.incomplete",
            status: "resolved",
            reason: "Fixture rows supplied by the in-memory resolver.",
          },
        ],
      }),
    };

    expect(() =>
      runAnalyticsDetector({
        detector,
        resolver,
        context: {
          detectorRunId: "speed_pace_hotspot-2026-03-fixture",
          month: "2026-03",
          generatedAt: "2026-06-09T00:00:00.000Z",
        },
      }),
    ).toThrow("grain(s): feed_health");
  });
});

import { describe, expect, test } from "bun:test";
import { detectPositiveDeviance, type PositiveDevianceDetectorInput } from "../src/index.js";
import type { FeatureQuality, PositiveDevianceFeature } from "@bp/analytics/features";

const GENERATED_AT = "2026-05-30T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "positivedeviance0123456789";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 3,
    expectedCount: 3,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 3,
    minSampleCount: 2,
    sampleStatus: "supported",
    ...over,
  };
}

function feature(over: Partial<PositiveDevianceFeature> = {}): PositiveDevianceFeature {
  return {
    scopeKind: "route",
    scopeId: "M15",
    routeId: "M15",
    metricName: "average_speed_mph",
    peerGroupId: "manhattan_local",
    peerGroupLabel: "Manhattan local routes",
    peerCount: 12,
    minPeerCount: 8,
    covariates: { borough: "Manhattan", routeType: "local", lengthMiles: 6.2 },
    periods: [
      {
        period: "2026-01",
        value: 8.8,
        performancePercentile: 0.93,
        adjustedResidual: 1.2,
        reciprocalMetricWarnings: [],
        coverageStatus: "complete",
      },
      {
        period: "2026-02",
        value: 9.1,
        performancePercentile: 0.95,
        adjustedResidual: 1.5,
        reciprocalMetricWarnings: [],
        coverageStatus: "complete",
      },
      {
        period: "2026-03",
        value: 9.4,
        performancePercentile: 0.97,
        adjustedResidual: 1.8,
        reciprocalMetricWarnings: [],
        coverageStatus: "complete",
      },
    ],
    quality: quality(),
    ...over,
  };
}

function runPositiveDeviance(
  row: PositiveDevianceFeature,
  over: Partial<PositiveDevianceDetectorInput> = {},
) {
  return detectPositiveDeviance({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [row],
    ...over,
  });
}

describe("detectPositiveDeviance", () => {
  test("emits persistent top-decile peer residual candidates", () => {
    const out = runPositiveDeviance(feature());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("positive_deviance");
    expect(out.candidates[0]?.reasonCode as string).toBe("positive_deviance");
    expect(out.candidates[0]?.category as string).toBe("speed");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("skips when peer group support is too small", () => {
    const out = runPositiveDeviance(feature({ peerCount: 4 }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("insufficient_peers");
  });

  test("blocks reciprocal metric warnings", () => {
    const out = runPositiveDeviance(
      feature({
        periods: [
          {
            period: "2026-03",
            value: 9.4,
            performancePercentile: 0.97,
            adjustedResidual: 1.8,
            reciprocalMetricWarnings: ["high_excess_wait"],
            coverageStatus: "complete",
          },
        ],
      }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.reasonCode as string).toBe("reciprocal_metric_warning");
  });
});

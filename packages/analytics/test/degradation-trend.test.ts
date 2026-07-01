import { describe, expect, test } from "bun:test";
import type { FeatureQuality, RouteMetricHistoryFeature } from "@bp/analytics/features";
import { type DegradationTrendDetectorInput, detectDegradationTrends } from "../src/index.js";

const GENERATED_AT = "2026-05-30T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "trenddetector0123456789abcdef";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 8,
    expectedCount: 8,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 8,
    minSampleCount: 8,
    sampleStatus: "supported",
    ...over,
  };
}

function historyFeature(over: Partial<RouteMetricHistoryFeature> = {}): RouteMetricHistoryFeature {
  return {
    scopeKind: "route",
    scopeId: "M15",
    metricName: "excess_wait_minutes",
    historyWindowMonths: 8,
    points: [
      { month: "2025-08", value: 10, coverageStatus: "complete", routeVersion: null },
      { month: "2025-09", value: 10.5, coverageStatus: "complete", routeVersion: null },
      { month: "2025-10", value: 11, coverageStatus: "complete", routeVersion: null },
      { month: "2025-11", value: 10.8, coverageStatus: "complete", routeVersion: null },
      { month: "2025-12", value: 11.2, coverageStatus: "complete", routeVersion: null },
      { month: "2026-01", value: 11.1, coverageStatus: "complete", routeVersion: null },
      { month: "2026-02", value: 11.5, coverageStatus: "complete", routeVersion: null },
      { month: "2026-03", value: 18, coverageStatus: "complete", routeVersion: null },
    ],
    routeVersionBreaks: [],
    quality: quality(),
    ...over,
  };
}

function runTrend(
  feature: RouteMetricHistoryFeature,
  over: Partial<DegradationTrendDetectorInput> = {},
) {
  return detectDegradationTrends({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

describe("detectDegradationTrends", () => {
  test("emits worsening trend candidates with robust z and Theil-Sen evidence", () => {
    const out = runTrend(historyFeature());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("degradation_trend");
    expect(out.candidates[0]?.reasonCode as string).toBe("worsening_trend");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("issue_needs_review");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("handles lower-is-worse metrics like speed by direction-normalizing the series", () => {
    const out = runTrend(
      historyFeature({
        metricName: "average_speed_mph",
        points: [
          { month: "2025-08", value: 12, coverageStatus: "complete", routeVersion: null },
          { month: "2025-09", value: 11.8, coverageStatus: "complete", routeVersion: null },
          { month: "2025-10", value: 11.5, coverageStatus: "complete", routeVersion: null },
          { month: "2025-11", value: 11.7, coverageStatus: "complete", routeVersion: null },
          { month: "2025-12", value: 11.4, coverageStatus: "complete", routeVersion: null },
          { month: "2026-01", value: 11.3, coverageStatus: "complete", routeVersion: null },
          { month: "2026-02", value: 11.1, coverageStatus: "complete", routeVersion: null },
          { month: "2026-03", value: 7, coverageStatus: "complete", routeVersion: null },
        ],
      }),
    );

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.category as string).toBe("speed");
  });

  test("emits clean coverage when the current point is not a worsening outlier", () => {
    const out = runTrend(
      historyFeature({
        points: [
          { month: "2025-08", value: 10, coverageStatus: "complete", routeVersion: null },
          { month: "2025-09", value: 10.5, coverageStatus: "complete", routeVersion: null },
          { month: "2025-10", value: 11, coverageStatus: "complete", routeVersion: null },
          { month: "2025-11", value: 10.8, coverageStatus: "complete", routeVersion: null },
          { month: "2025-12", value: 11.2, coverageStatus: "complete", routeVersion: null },
          { month: "2026-01", value: 11.1, coverageStatus: "complete", routeVersion: null },
          { month: "2026-02", value: 11.5, coverageStatus: "complete", routeVersion: null },
          { month: "2026-03", value: 11.4, coverageStatus: "complete", routeVersion: null },
        ],
      }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("skips version-broken series instead of manufacturing a trend", () => {
    const out = runTrend(historyFeature({ routeVersionBreaks: ["2026-01"] }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("series_break_versioned");
  });
});

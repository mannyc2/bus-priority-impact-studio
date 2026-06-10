import { describe, expect, test } from "bun:test";
import {
  CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID,
  type CustomerJourneyShortfallThresholds,
  detectCustomerJourneyShortfall,
} from "@bp/analytics/detectors";
import type { CustomerJourneyFeature, FeatureQuality } from "@bp/analytics/features";

const QUALITY: FeatureQuality = {
  coverageStatus: "complete",
  observedCount: 1,
  expectedCount: 1,
  coverageShare: 1,
  freshnessStatus: "fresh",
  sampleCount: 1000,
  minSampleCount: 1,
  sampleStatus: "supported",
};

const THRESHOLDS: Partial<CustomerJourneyShortfallThresholds> = {
  minCustomers: 100,
  maxJourneyTimePerformance: 0.7,
  bottomPercentile: 0.34,
  minCohortPeers: 3,
  minPersistentPoorMonths: 2,
  minHistoryMonths: 2,
  candidateLimit: 10,
};

function feature(
  routeId: string,
  month: string,
  performance: number,
  extra: Partial<CustomerJourneyFeature> = {},
): CustomerJourneyFeature {
  return {
    routeId,
    month,
    period: "Peak",
    tripType: "LCL/LTD",
    customers: 1000,
    additionalWaitMinutes: 3,
    additionalTravelMinutes: 1,
    journeyTimePerformance: performance,
    quality: QUALITY,
    ...extra,
  };
}

describe("customer journey shortfall detector", () => {
  test("emits persistent low-CJTP candidates with wait/travel decomposition", () => {
    const output = detectCustomerJourneyShortfall({
      detectorRunId: "customer-journey-2026-04-test",
      month: "2026-04",
      generatedAt: "2026-06-07T00:00:00.000Z",
      thresholds: THRESHOLDS,
      features: [
        feature("B41", "2026-03", 0.5),
        feature("M15", "2026-03", 0.8),
        feature("Q44", "2026-03", 0.9),
        feature("B41", "2026-04", 0.48),
        feature("M15", "2026-04", 0.78),
        feature("Q44", "2026-04", 0.88),
      ],
    });

    expect(output.candidates).toHaveLength(1);
    expect(output.candidates[0]?.detectorId as string).toBe(CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID);
    expect(output.candidates[0]?.routeId as string).toBe("B41");
    const primary = JSON.parse(output.evidence[0]?.evidenceRef ?? "{}") as Record<string, unknown>;
    expect(primary).toMatchObject({
      dominantSide: "wait",
      journeyTimePerformancePercent: 48,
    });
    expect(primary).toHaveProperty("note");
  });

  test("keeps route-filtered runs cohort-safe", () => {
    const features = [
      feature("B41", "2026-03", 0.5),
      feature("M15", "2026-03", 0.8),
      feature("Q44", "2026-03", 0.9),
      feature("B41", "2026-04", 0.48),
      feature("M15", "2026-04", 0.78),
      feature("Q44", "2026-04", 0.88),
    ];
    const allRoutes = detectCustomerJourneyShortfall({
      detectorRunId: "customer-journey-2026-04-all",
      month: "2026-04",
      generatedAt: "2026-06-07T00:00:00.000Z",
      thresholds: THRESHOLDS,
      features,
    });
    const routeOnly = detectCustomerJourneyShortfall({
      detectorRunId: "customer-journey-2026-04-route",
      month: "2026-04",
      generatedAt: "2026-06-07T00:00:00.000Z",
      thresholds: THRESHOLDS,
      requestedRouteId: "B41",
      features,
    });

    expect(routeOnly.candidates).toHaveLength(1);
    const allPrimary = JSON.parse(allRoutes.evidence[0]?.evidenceRef ?? "{}") as {
      percentileRank: number;
    };
    const routePrimary = JSON.parse(routeOnly.evidence[0]?.evidenceRef ?? "{}") as Record<
      string,
      unknown
    >;
    expect(routePrimary).toMatchObject({
      percentileRank: allPrimary.percentileRank,
    });
  });

  test("emits skipped coverage for low exposure and insufficient history", () => {
    const output = detectCustomerJourneyShortfall({
      detectorRunId: "customer-journey-2026-04-skips",
      month: "2026-04",
      generatedAt: "2026-06-07T00:00:00.000Z",
      thresholds: THRESHOLDS,
      features: [
        feature("B41", "2026-04", 0.48, { customers: 10 }),
        feature("M15", "2026-04", 0.49, { additionalWaitMinutes: 0, additionalTravelMinutes: 4 }),
        feature("Q44", "2026-04", 0.88),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage.map((row) => row.reasonCode as string | null)).toEqual(
      expect.arrayContaining([
        "low_customer_exposure",
        "insufficient_customer_journey_history",
        null,
      ]),
    );
  });

  test("does not let adjacent-month persistence promote short history", () => {
    const output = detectCustomerJourneyShortfall({
      detectorRunId: "customer-journey-2026-04-short-history",
      month: "2026-04",
      generatedAt: "2026-06-07T00:00:00.000Z",
      thresholds: {
        ...THRESHOLDS,
        minHistoryMonths: 4,
        minPersistentPoorMonths: 3,
      },
      features: [
        feature("B41", "2026-03", 0.5),
        feature("M15", "2026-03", 0.8),
        feature("Q44", "2026-03", 0.9),
        feature("B41", "2026-04", 0.48),
        feature("M15", "2026-04", 0.78),
        feature("Q44", "2026-04", 0.88),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    const b41Coverage = output.coverage.find((row) => row.scopeId === "B41:2026-04:Peak:LCL/LTD");
    expect(b41Coverage?.reasonCode as string | null).toBe("insufficient_customer_journey_history");
  });

  test("uses the default exposure floor to block sparse denominator candidates", () => {
    const output = detectCustomerJourneyShortfall({
      detectorRunId: "customer-journey-2026-04-default-exposure",
      month: "2026-04",
      generatedAt: "2026-06-07T00:00:00.000Z",
      thresholds: {
        maxJourneyTimePerformance: 0.7,
        bottomPercentile: 0.34,
        minCohortPeers: 3,
        minPersistentPoorMonths: 2,
        minHistoryMonths: 2,
        candidateLimit: 10,
      },
      features: [
        feature("QM65", "2026-03", 0.4, { customers: 2000 }),
        feature("M15", "2026-03", 0.8, { customers: 10_000 }),
        feature("Q44", "2026-03", 0.9, { customers: 10_000 }),
        feature("QM65", "2026-04", 0.35, { customers: 2000 }),
        feature("M15", "2026-04", 0.8, { customers: 10_000 }),
        feature("Q44", "2026-04", 0.9, { customers: 10_000 }),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    const sparseCoverage = output.coverage.find(
      (row) => row.scopeId === "QM65:2026-04:Peak:LCL/LTD",
    );
    expect(sparseCoverage?.reasonCode as string | null).toBe("low_customer_exposure");
  });
});

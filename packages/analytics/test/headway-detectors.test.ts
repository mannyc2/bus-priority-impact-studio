import { describe, expect, test } from "bun:test";
import {
  detectBunchingHotspots,
  detectHeadwayReliabilityEwt,
  detectRiderWeightedExcessWait,
  type BunchingHotspotsDetectorInput,
  type HeadwayReliabilityEwtDetectorInput,
  type RiderWeightedExcessWaitDetectorInput,
} from "../src/index.js";
import type {
  FeatureQuality,
  RiderWeightedExcessWaitFeature,
  StopDirectionHourFeature,
} from "@bp/analytics/features";

const GENERATED_AT = "2026-05-30T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "headway0123456789abcdef01234567";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 30,
    expectedCount: 30,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 30,
    minSampleCount: 10,
    sampleStatus: "supported",
    ...over,
  };
}

function stopHour(over: Partial<StopDirectionHourFeature> = {}): StopDirectionHourFeature {
  return {
    routeId: "M15",
    stopId: "401234",
    stopName: "1 Av/E 42 St",
    direction: "N",
    serviceDate: "2026-03-05",
    localHour: 8,
    timezone: "America/New_York",
    scheduledHeadwayMinutes: 10,
    scheduledBusesPerHour: 6,
    observedHeadwaysMinutes: [3, 3, 3, 3, 3, 15, 15, 18, 18, 24],
    observedPairCount: 10,
    bunchingPairCount: 0,
    gapPairCount: 1,
    quality: quality(),
    ...over,
  };
}

function riderWeightedEwt(
  over: Partial<RiderWeightedExcessWaitFeature> = {},
): RiderWeightedExcessWaitFeature {
  return {
    routeId: "M15",
    stopId: "401234",
    stopName: "1 Av/E 42 St",
    direction: "N",
    serviceDate: "2026-03-05",
    localHour: 8,
    timezone: "America/New_York",
    excessWaitTimeMinutes: 3.2,
    boardings: 80,
    boardingsSource: "apc",
    ridershipSnapshotId: "apc-2026-03",
    ewtDetectorVersion: "1.0.0",
    quality: quality(),
    ridershipQuality: quality(),
    ...over,
  };
}

function runEwt(
  feature: StopDirectionHourFeature,
  over: Partial<HeadwayReliabilityEwtDetectorInput> = {},
) {
  return detectHeadwayReliabilityEwt({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

function runRiderWeightedEwt(
  feature: RiderWeightedExcessWaitFeature,
  over: Partial<RiderWeightedExcessWaitDetectorInput> = {},
) {
  return detectRiderWeightedExcessWait({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

function runBunching(
  feature: StopDirectionHourFeature,
  over: Partial<BunchingHotspotsDetectorInput> = {},
) {
  return detectBunchingHotspots({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

describe("detectHeadwayReliabilityEwt", () => {
  test("emits descriptive EWT candidates with primary and counter evidence", () => {
    const out = runEwt(stopHour());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("headway_reliability_ewt");
    expect(out.candidates[0]?.reasonCode as string).toBe("excess_wait_time");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("issue_clean");
    expect(out.candidates[0]?.scopeId).toBe("M15:N:401234:2026-03-05:08");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("emits clean coverage when excess wait and LOS do not clear thresholds", () => {
    const out = runEwt(
      stopHour({
        observedHeadwaysMinutes: Array.from({ length: 10 }, () => 10),
        observedPairCount: 10,
      }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("ranks well-observed cells above thin-sample cells at equal raw severity", () => {
    // Same headway pattern (equal raw severity); the thin cell repeats it once (10 headways at
    // fractional coverage), the dense cell three times (30 headways at full coverage).
    const pattern = [3, 3, 3, 3, 3, 15, 15, 18, 18, 24];
    const thin = stopHour({
      stopId: "100001",
      observedHeadwaysMinutes: pattern,
      quality: quality({ observedCount: 10, expectedCount: 30, coverageShare: 0.3333 }),
    });
    const dense = stopHour({
      stopId: "100002",
      observedHeadwaysMinutes: [...pattern, ...pattern, ...pattern],
      quality: quality({ observedCount: 30, expectedCount: 30, coverageShare: 1 }),
    });

    const out = runEwt(thin, {
      features: [thin, dense],
      thresholds: { candidateLimit: 1 },
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.physicalId).toBe("100002");

    const both = runEwt(thin, { features: [thin, dense] });
    const thinScore = both.candidates.find((c) => c.physicalId === "100001")?.detectorScore;
    const denseScore = both.candidates.find((c) => c.physicalId === "100002")?.detectorScore;
    expect(thinScore).toBeDefined();
    expect(denseScore).toBeDefined();
    expect(denseScore as number).toBeGreaterThan(thinScore as number);
  });

  test("skips instead of scoring low-coverage cells as clean", () => {
    const out = runEwt(
      stopHour({
        quality: quality({ coverageStatus: "low_coverage", coverageShare: 0.4 }),
      }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("low_coverage");
  });
});

describe("detectRiderWeightedExcessWait", () => {
  test("emits associational rider-minute excess-wait candidates when APC support is present", () => {
    const out = runRiderWeightedEwt(riderWeightedEwt());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("rider_weighted_excess_wait");
    expect(out.candidates[0]?.reasonCode as string).toBe("rider_weighted_excess_wait");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("issue_needs_review");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("skips when ridership/APC proxy coverage is unavailable", () => {
    const out = runRiderWeightedEwt(
      riderWeightedEwt({
        boardings: null,
        ridershipQuality: quality({
          coverageStatus: "missing",
          observedCount: 0,
          coverageShare: 0,
          sampleCount: 0,
          sampleStatus: "missing_samples",
        }),
      }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("ridership_proxy_unavailable");
  });
});

describe("detectBunchingHotspots", () => {
  test("emits descriptive bunching hotspot candidates from headway ratios", () => {
    const out = runBunching(
      stopHour({
        observedHeadwaysMinutes: [
          2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 25, 25, 25, 25, 25,
        ],
        observedPairCount: 20,
        bunchingPairCount: 5,
        gapPairCount: 5,
        quality: quality({ sampleCount: 20, minSampleCount: 20 }),
      }),
    );

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("bunching_hotspots");
    expect(out.candidates[0]?.reasonCode as string).toBe("bunching_hotspot");
    expect(out.candidates[0]?.category as string).toBe("reliability");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("ranks well-observed cells above thin-pair cells at equal raw severity", () => {
    const pattern = [2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 25, 25, 25, 25, 25];
    const thin = stopHour({
      stopId: "200001",
      observedHeadwaysMinutes: pattern,
      quality: quality({
        sampleCount: 20,
        minSampleCount: 20,
        observedCount: 20,
        expectedCount: 60,
        coverageShare: 0.3333,
      }),
    });
    const dense = stopHour({
      stopId: "200002",
      observedHeadwaysMinutes: [...pattern, ...pattern, ...pattern],
      quality: quality({
        sampleCount: 60,
        minSampleCount: 20,
        observedCount: 60,
        expectedCount: 60,
        coverageShare: 1,
      }),
    });

    const out = runBunching(thin, {
      features: [thin, dense],
      thresholds: { candidateLimit: 1 },
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.physicalId).toBe("200002");

    const both = runBunching(thin, { features: [thin, dense] });
    const thinScore = both.candidates.find((c) => c.physicalId === "200001")?.detectorScore;
    const denseScore = both.candidates.find((c) => c.physicalId === "200002")?.detectorScore;
    expect(denseScore as number).toBeGreaterThan(thinScore as number);
  });

  test("skips bunching cells without enough headway pairs", () => {
    const out = runBunching(stopHour({ observedHeadwaysMinutes: [2, 2, 25] }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("insufficient_headway_pairs");
  });
});

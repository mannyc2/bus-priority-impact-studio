import { describe, expect, test } from "bun:test";
import {
  detectScheduleMismatch,
  detectSpeedPaceHotspots,
  detectTravelTimeVariability,
  type ScheduleMismatchDetectorInput,
  type SpeedPaceHotspotDetectorInput,
  type TravelTimeVariabilityDetectorInput,
} from "../src/index.js";
import type {
  FeatureQuality,
  RouteDirectionDaypartFeature,
  SegmentDaypartFeature,
} from "@bp/analytics/features";

const GENERATED_AT = "2026-05-30T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "r3detectors0123456789abcdef0123";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 60,
    expectedCount: 60,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 60,
    minSampleCount: 15,
    sampleStatus: "supported",
    ...over,
  };
}

function segmentFeature(over: Partial<SegmentDaypartFeature> = {}): SegmentDaypartFeature {
  return {
    routeId: "M15",
    month: MONTH,
    segmentId: "M15:N:10",
    direction: "N",
    daypart: "am_peak",
    traversalCount: 42,
    segmentLengthFeet: 900,
    minSegmentLengthFeet: 300,
    medianSpeedMph: 5,
    medianPaceMinutesPerMile: 12,
    freeFlowPaceMinutesPerMile: 7,
    systematicDelayMinutesPerMile: 5,
    stochasticDelayMinutesPerMile: 1.5,
    spatialConfidence: 0.9,
    quality: quality(),
    ...over,
  };
}

function routeDaypart(over: Partial<RouteDirectionDaypartFeature> = {}): RouteDirectionDaypartFeature {
  return {
    routeId: "M15",
    month: MONTH,
    direction: "N",
    daypart: "am_peak",
    servicePatternVersion: "2026-03-gtfs",
    scheduledRuntimeMinutes: 50,
    observedRuntimeP50Minutes: 60,
    observedRuntimeP95Minutes: 95,
    observedTripCount: 60,
    quality: quality({ minSampleCount: 30 }),
    ...over,
  };
}

function runSpeedPace(
  feature: SegmentDaypartFeature,
  over: Partial<SpeedPaceHotspotDetectorInput> = {},
) {
  return detectSpeedPaceHotspots({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

function runVariability(
  feature: RouteDirectionDaypartFeature,
  over: Partial<TravelTimeVariabilityDetectorInput> = {},
) {
  return detectTravelTimeVariability({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

function runSchedule(
  feature: RouteDirectionDaypartFeature,
  over: Partial<ScheduleMismatchDetectorInput> = {},
) {
  return detectScheduleMismatch({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [feature],
    ...over,
  });
}

describe("detectSpeedPaceHotspots", () => {
  test("emits descriptive segment pace hotspots with systematic/stochastic evidence", () => {
    const out = runSpeedPace(segmentFeature());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("speed_pace_hotspot");
    expect(out.candidates[0]?.reasonCode as string).toBe("slow_pace_hotspot");
    expect(out.candidates[0]?.scopeKind as string).toBe("segment");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("skips speed pace cells with uncertain spatial joins", () => {
    const out = runSpeedPace(segmentFeature({ spatialConfidence: 0.4 }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("spatial_join_uncertain");
  });
});

describe("detectTravelTimeVariability", () => {
  test("emits route-direction-daypart candidates when P95 runtime is far above P50", () => {
    const out = runVariability(routeDaypart());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("travel_time_variability");
    expect(out.candidates[0]?.reasonCode as string).toBe("high_travel_time_variability");
    expect(out.candidates[0]?.category as string).toBe("reliability");
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("emits clean coverage when buffer index stays below threshold", () => {
    const out = runVariability(routeDaypart({ observedRuntimeP50Minutes: 50, observedRuntimeP95Minutes: 65 }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });
});

describe("detectScheduleMismatch", () => {
  test("flags tight schedules with neutral schedule-review language", () => {
    const out = runSchedule(routeDaypart({ observedRuntimeP50Minutes: 60, scheduledRuntimeMinutes: 50 }));

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("schedule_mismatch");
    expect(out.candidates[0]?.reasonCode as string).toBe("schedule_too_tight");
    expect(out.candidates[0]?.claimText).toContain("suggesting schedule review");
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("flags schedule-padding review candidates when observed runtime is far shorter", () => {
    const out = runSchedule(routeDaypart({ observedRuntimeP50Minutes: 40, scheduledRuntimeMinutes: 50 }));

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.reasonCode as string).toBe("schedule_padding_review");
  });

  test("skips schedule mismatch when scheduled runtime is missing", () => {
    const out = runSchedule(routeDaypart({ scheduledRuntimeMinutes: null }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("baseline_unavailable");
  });
});

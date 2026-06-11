import { describe, expect, test } from "bun:test";
import type {
  FeatureQuality,
  RouteDirectionDaypartFeature,
  SegmentDaypartFeature,
} from "@bp/analytics/features";
import {
  detectScheduleMismatch,
  detectSpeedPaceHotspots,
  detectTravelTimeVariability,
  type ScheduleMismatchDetectorInput,
  type SpeedPaceHotspotDetectorInput,
  type TravelTimeVariabilityDetectorInput,
} from "../src/index.js";

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
    isTerminal: false,
    quality: quality(),
    ...over,
  };
}

function routeDaypart(
  over: Partial<RouteDirectionDaypartFeature> = {},
): RouteDirectionDaypartFeature {
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

  test("gates first/last terminal segments so terminal/layover dwell is not a slow-pace candidate", () => {
    const out = runSpeedPace(segmentFeature({ isTerminal: true }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("terminal_or_layover");
  });

  test("skips express/highway segments longer than the max length gate", () => {
    const out = runSpeedPace(segmentFeature({ segmentId: "X1:N:5", segmentLengthFeet: 30_000 }));

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("segment_too_long");
  });

  test("caps candidates per route so no single route monopolizes output", () => {
    // Three qualifying segments each on two routes; with a per-route cap of 2 every route keeps its
    // own worst two, so a high-scoring route cannot crowd out another route entirely.
    const seg = (routeId: string, n: number, pace: number): SegmentDaypartFeature =>
      segmentFeature({
        routeId,
        segmentId: `${routeId}:N:${n}`,
        medianPaceMinutesPerMile: pace,
      });
    const out = detectSpeedPaceHotspots({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      thresholds: { candidateLimitPerRoute: 2 },
      features: [
        // Route M15 has the most extreme slowness across the board.
        seg("M15", 1, 30),
        seg("M15", 2, 28),
        seg("M15", 3, 26),
        // Route B46 is slower than the floor but less extreme than M15.
        seg("B46", 1, 16),
        seg("B46", 2, 15),
        seg("B46", 3, 14),
      ],
    });

    expect(out.candidates).toHaveLength(4); // 2 per route, not 4 from M15 + 0 from B46
    const byRoute = new Map<string, number>();
    for (const candidate of out.candidates) {
      const routeId = candidate.routeId as string;
      byRoute.set(routeId, (byRoute.get(routeId) ?? 0) + 1);
    }
    expect(byRoute.get("M15")).toBe(2);
    expect(byRoute.get("B46")).toBe(2);
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
    const out = runVariability(
      routeDaypart({ observedRuntimeP50Minutes: 50, observedRuntimeP95Minutes: 65 }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });
});

describe("detectScheduleMismatch", () => {
  test("flags tight schedules with neutral schedule-review language", () => {
    const out = runSchedule(
      routeDaypart({ observedRuntimeP50Minutes: 60, scheduledRuntimeMinutes: 50 }),
    );

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("schedule_mismatch");
    expect(out.candidates[0]?.reasonCode as string).toBe("schedule_too_tight");
    expect(out.candidates[0]?.claimText).toContain("suggesting schedule review");
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("flags schedule-padding review candidates when observed runtime is far shorter", () => {
    const out = runSchedule(
      routeDaypart({ observedRuntimeP50Minutes: 40, scheduledRuntimeMinutes: 50 }),
    );

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

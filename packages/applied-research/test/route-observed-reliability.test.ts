import { describe, expect, it } from "bun:test";
import type { LocalObservedHeadwaySample, LocalRouteReliabilityBaseline } from "@bp/db/local";
import { buildSummary } from "../src/local-db";

function sample(
  routeId: string,
  headwayMinutes: number,
  index: number,
): LocalObservedHeadwaySample {
  return {
    runId: "run-1",
    sampleRank: index,
    routeId,
    sourceRouteId: routeId,
    directionId: 0,
    stopId: `stop-${index % 3}`,
    previousVehicleKey: `v${index - 1}`,
    vehicleKey: `v${index}`,
    previousObservedTimestamp: 0,
    observedTimestamp: 0,
    headwaySeconds: Math.round(headwayMinutes * 60),
    headwayMinutes,
  };
}

function baseline(medianScheduled: number | null): LocalRouteReliabilityBaseline {
  return {
    routeId: "B41",
    month: "2026-03",
    reliabilityStatus: "available",
    scheduledTimepointCount: 0,
    stopHeadwayGroupCount: 0,
    headwaySampleCount: 0,
    medianScheduledHeadwayMinutes: medianScheduled,
    p90ScheduledHeadwayMinutes: null,
    maxScheduledHeadwayMinutes: null,
    scheduledShortHeadwayShare: null,
    scheduledLongGapShare: null,
  };
}

describe("route observed reliability summary", () => {
  it("returns insufficient status with null metrics for empty samples", () => {
    const summary = buildSummary({
      routeId: "B41",
      month: "2026-03",
      runId: "run-1",
      samples: [],
      baseline: undefined,
      minSampleThreshold: 30,
    });

    expect(summary.reliabilityStatus).toBe("insufficient_gtfs_rt_samples");
    expect(summary.sampleCount).toBe(0);
    expect(summary.averageObservedHeadwayMinutes).toBeNull();
    expect(summary.medianObservedHeadwayMinutes).toBeNull();
    expect(summary.expectedWaitMinutes).toBeNull();
    expect(summary.observedBunchingShare).toBeNull();
    expect(summary.observedLongGapShare).toBeNull();
  });

  it("marks routes below minSampleThreshold as insufficient but still computes metrics", () => {
    const samples = [5, 6, 7].map((headway, index) => sample("B41", headway, index));
    const summary = buildSummary({
      routeId: "B41",
      month: "2026-03",
      runId: "run-1",
      samples,
      baseline: undefined,
      minSampleThreshold: 30,
    });

    expect(summary.reliabilityStatus).toBe("insufficient_gtfs_rt_samples");
    expect(summary.sampleCount).toBe(3);
    expect(summary.averageObservedHeadwayMinutes).toBe(6);
    expect(summary.medianObservedHeadwayMinutes).toBe(6);
  });

  it("uses fallback bunching/long-gap thresholds when no baseline is provided", () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample("B41", 6, index));
    const summary = buildSummary({
      routeId: "B41",
      month: "2026-03",
      runId: "run-1",
      samples,
      baseline: undefined,
      minSampleThreshold: 30,
    });

    expect(summary.reliabilityStatus).toBe("observed");
    expect(summary.bunchingThresholdMinutes).toBe(3);
    expect(summary.longGapThresholdMinutes).toBe(20);
    expect(summary.scheduledMedianHeadwayMinutes).toBeNull();
    expect(summary.scheduledExpectedWaitMinutes).toBeNull();
  });

  it("derives bunching/long-gap thresholds from scheduled median when baseline is present", () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample("B41", 6, index));
    const summary = buildSummary({
      routeId: "B41",
      month: "2026-03",
      runId: "run-1",
      samples,
      baseline: baseline(10),
      minSampleThreshold: 30,
    });

    expect(summary.bunchingThresholdMinutes).toBe(5);
    expect(summary.longGapThresholdMinutes).toBe(20);
    expect(summary.scheduledMedianHeadwayMinutes).toBe(10);
    expect(summary.scheduledExpectedWaitMinutes).toBe(5);
  });

  it("computes expected wait via E[H^2]/(2*E[H])", () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample("B41", 10, index));
    const summary = buildSummary({
      routeId: "B41",
      month: "2026-03",
      runId: "run-1",
      samples,
      baseline: undefined,
      minSampleThreshold: 30,
    });

    expect(summary.expectedWaitMinutes).toBe(5);
  });

  it("computes excess wait and ratio against scheduled expected wait", () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample("B41", 12, index));
    const summary = buildSummary({
      routeId: "B41",
      month: "2026-03",
      runId: "run-1",
      samples,
      baseline: baseline(8),
      minSampleThreshold: 30,
    });

    expect(summary.expectedWaitMinutes).toBe(6);
    expect(summary.scheduledExpectedWaitMinutes).toBe(4);
    expect(summary.excessWaitMinutes).toBe(2);
    expect(summary.waitReliabilityRatio).toBe(1.5);
  });
});

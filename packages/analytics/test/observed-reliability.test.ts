import { describe, expect, test } from "bun:test";
import { detectObservedReliability, type ObservedReliabilityRouteInput } from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "reliability0123456789abcdef0123";

function baseRoute(
  over: Partial<ObservedReliabilityRouteInput> = {},
): ObservedReliabilityRouteInput {
  return {
    routeId: "M15",
    reliabilityStatus: "observed",
    sampleCount: 1200,
    minSampleThreshold: 100,
    observedLongGapShare: 0.35,
    waitReliabilityRatio: 2.4,
    excessWaitMinutes: 7.2,
    scheduledBaselineHeadwaySampleCount: 500,
    busWaitAssessmentTripCount: 1000,
    busWaitAssessment: 0.62,
    ...over,
  };
}

describe("detectObservedReliability", () => {
  test("emits a route candidate when GTFS-RT, scheduled baseline, and Bus Wait Assessment agree", () => {
    const out = detectObservedReliability({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("observed_reliability");
    expect(out.candidates[0]?.scopeKind as string).toBe("route");
    expect(out.candidates[0]?.reasonCode as string).toBe("high_long_gap_share");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("issue_needs_review");
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0]?.evidenceKind as string).toBe("metric");
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("emits clean coverage when observed reliability is acceptable", () => {
    const out = detectObservedReliability({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ observedLongGapShare: 0.1, waitReliabilityRatio: 1.2 })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("skips when GTFS-RT samples are insufficient", () => {
    const out = detectObservedReliability({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          reliabilityStatus: "insufficient_gtfs_rt_samples",
          sampleCount: 20,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("insufficient_gtfs_rt_samples");
  });

  test("skips when Bus Wait Assessment corroboration is missing", () => {
    const out = detectObservedReliability({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ busWaitAssessmentTripCount: 0, busWaitAssessment: null })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("missing_bus_wait_assessment");
  });
});

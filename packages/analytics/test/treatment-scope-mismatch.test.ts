import { describe, expect, test } from "bun:test";
import {
  detectTreatmentScopeMismatch,
  type TreatmentScopeMismatchSegmentInput,
} from "../src/index.js";

const GENERATED_AT = "2026-06-06T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "treatment_scope_mismatch_test";

function segment(
  over: Partial<TreatmentScopeMismatchSegmentInput> = {},
): TreatmentScopeMismatchSegmentInput {
  return {
    routeId: "M96",
    segmentId: "M96:2026-03:W:10:401965:903004",
    directionId: "W",
    segmentOrder: 10,
    directionMaxSegmentOrder: 20,
    treatmentType: "bus_lane",
    treatmentStatus: "current_confirmed",
    matchMethod: "route_shape_overlap",
    overlapShare: 0.7,
    treatmentConfidence: "high",
    treatmentSourceRefs: ["local_route_segment_speed_segment:M96:2026-03:W:10:401965:903004"],
    laneTypes: ["Curbside"],
    averageSpeedMph: 4.9,
    segmentLengthFeet: 500,
    observationCount: 90,
    busTripCount: 300,
    daypartSpeeds: [
      {
        daypart: "am_peak",
        averageSpeedMph: 4.3,
        observationCount: 8,
        busTripCount: 80,
      },
      {
        daypart: "midday",
        averageSpeedMph: 5.5,
        observationCount: 12,
        busTripCount: 120,
      },
    ],
    slowestDaypart: "am_peak",
    slowestDaypartAverageSpeedMph: 4.3,
    historicalSpeedContext: {
      monthCount: 13,
      priorMonthAverageSpeedMph: 5.8,
      prior12MedianSpeedMph: 6.1,
      releaseVsPrior12DeltaMph: -1.2,
      slowestMonth: "2026-03",
      slowestMonthAverageSpeedMph: 4.9,
    },
    routeMedianSegmentSpeedMph: 7.2,
    routeSegmentSpeedRank: 2,
    routeSegmentCount: 20,
    routeSlownessPercentile: 0.95,
    networkMedianSegmentSpeedMph: 8.1,
    networkSegmentSpeedRank: 100,
    networkSegmentCount: 4000,
    networkSlownessPercentile: 0.98,
    ...over,
  };
}

describe("detectTreatmentScopeMismatch", () => {
  test("emits a segment candidate for slow bus-lane-overlap segment", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [segment()],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({
      detectorId: "treatment_scope_mismatch",
      scopeKind: "segment",
      routeId: "M96",
      reasonCode: "bus_lane_slow_segment",
      claimSafeLabel: "issue_needs_review",
    });
    expect(out.evidence.map((row) => row.evidenceRole as string).sort()).toEqual([
      "context",
      "counter_evidence",
      "primary",
    ]);
    expect(JSON.parse(out.evidence[1]?.evidenceRef ?? "{}")).toMatchObject({
      slowestDaypart: "am_peak",
      routePeerContext: {
        speedRankAscending: 2,
        segmentCount: 20,
      },
      historicalSpeedContext: {
        prior12MedianSpeedMph: 6.1,
        releaseVsPrior12DeltaMph: -1.2,
      },
    });
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("does not flag slow segments without confirmed bus-lane overlap", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          treatmentStatus: "not_found",
          matchMethod: "not_matched",
          overlapShare: 0,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("spatial_join_uncertain");
  });

  test("does not count Enhanced Bus Stop-only lane types as bus-lane mismatch evidence", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          treatmentSourceRefs: [
            "local_route_segment_speed_segment:Q24:2026-03:W:35:301973:307238",
            "nyc_dot_bus_lane_type:Enhanced bus stop",
            "nyc_dot_bus_lanes_geometry:route_shape_overlap",
          ],
          laneTypes: ["Enhanced bus stop"],
          overlapShare: 0.2585,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("treatment_segment_gap");
  });

  test("skips tiny segments that make speed review unstable", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [segment({ segmentLengthFeet: 20 })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("segment_too_short");
  });

  test("suppresses terminal-like first segments unless they have enough length and daypart contrast", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [segment({ segmentOrder: 1, segmentLengthFeet: 500 })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("terminal_or_layover");
  });

  test("suppresses first segments even when length and daypart contrast look plausible", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          segmentOrder: 1,
          segmentLengthFeet: 2200,
          daypartSpeeds: [
            { daypart: "am_peak", averageSpeedMph: 3.8, observationCount: 60, busTripCount: 180 },
            { daypart: "midday", averageSpeedMph: 6.1, observationCount: 60, busTripCount: 190 },
          ],
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("terminal_or_layover");
  });

  test("keeps chronically slow stable segments as context instead of mismatch candidates", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          averageSpeedMph: 5.4,
          historicalSpeedContext: {
            monthCount: 13,
            priorMonthAverageSpeedMph: 5.3,
            prior12MedianSpeedMph: 5.2,
            releaseVsPrior12DeltaMph: 0.2,
            slowestMonth: "2025-10",
            slowestMonthAverageSpeedMph: 4.8,
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("historically_stable_slow_segment");
  });

  test("requires usable prior history before emitting mismatch candidates", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          historicalSpeedContext: {
            monthCount: 2,
            priorMonthAverageSpeedMph: 4.8,
            prior12MedianSpeedMph: 5.2,
            releaseVsPrior12DeltaMph: -0.4,
            slowestMonth: "2026-03",
            slowestMonthAverageSpeedMph: 4.8,
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("insufficient_history");
  });

  test("suppresses short-history segments that are slow but not worsening", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          historicalSpeedContext: {
            monthCount: 3,
            priorMonthAverageSpeedMph: 5.4,
            prior12MedianSpeedMph: 5.5,
            releaseVsPrior12DeltaMph: 0.1,
            slowestMonth: "2026-02",
            slowestMonthAverageSpeedMph: 5.4,
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("historically_stable_slow_segment");
  });

  test("suppresses residual-modeled slow segments that are not worse than expected", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          historicalSpeedContext: {
            monthCount: 13,
            priorMonthAverageSpeedMph: 6.1,
            prior12MedianSpeedMph: 6.4,
            releaseVsPrior12DeltaMph: -1.5,
            slowestMonth: "2026-03",
            slowestMonthAverageSpeedMph: 4.9,
          },
          speedResidualContext: {
            expectedSpeedMph: 4.7,
            speedResidualMph: 0.2,
            residualPercentileWithinMonth: 0.8,
            residualRankWithinMonth: 3200,
            residualMonthCount: 4000,
            segmentHistoryMeanSpeedMph: 4.8,
            segmentHistoryMedianSpeedMph: 4.7,
            segmentHistoryMonthCount: 24,
            routeMonthMeanSpeedMph: 6.9,
            routeHistoryMeanSpeedMph: 7,
            modelId: "segment_speed_residuals_v1",
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("residual_not_worse_than_expected");
  });

  test("dedupes the same physical node-pair across co-located routes", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({ routeId: "M96", segmentId: "M96:2026-03:W:10:401965:903004" }),
        segment({ routeId: "M106", segmentId: "M106:2026-03:W:10:401965:903004" }),
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.coverage.filter((row) => row.outcome === "hit")).toHaveLength(1);
  });

  test("does not backfill a physical node-pair with a slower sibling when the best sibling is history-blocked", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          routeId: "M4",
          segmentId: "M4:2026-03:S:59:400124:400518",
          averageSpeedMph: 5.3,
          historicalSpeedContext: {
            monthCount: 10,
            priorMonthAverageSpeedMph: 5.1,
            prior12MedianSpeedMph: 5.2,
            releaseVsPrior12DeltaMph: 0.1,
            slowestMonth: "2025-12",
            slowestMonthAverageSpeedMph: 4.4,
          },
        }),
        segment({
          routeId: "M1",
          segmentId: "M1:2026-03:S:34:400124:400518",
          averageSpeedMph: 5.5,
          historicalSpeedContext: {
            monthCount: 14,
            priorMonthAverageSpeedMph: 5.7,
            prior12MedianSpeedMph: 5.7,
            releaseVsPrior12DeltaMph: -0.2,
            slowestMonth: "2025-12",
            slowestMonthAverageSpeedMph: 4.9,
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage.find((row) => row.scopeId.startsWith("M4:"))?.reasonCode as string).toBe(
      "historically_stable_slow_segment",
    );
    expect(out.coverage.find((row) => row.scopeId.startsWith("M1:"))?.outcome as string).toBe(
      "clean_no_hit",
    );
  });

  test("keeps a faster viable physical sibling when a slower co-located route is history-blocked", () => {
    const out = detectTreatmentScopeMismatch({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          routeId: "M4",
          segmentId: "M4:2026-03:S:59:400124:400518",
          averageSpeedMph: 5.8,
          historicalSpeedContext: {
            monthCount: 10,
            priorMonthAverageSpeedMph: 5.6,
            prior12MedianSpeedMph: 5.7,
            releaseVsPrior12DeltaMph: 0.1,
            slowestMonth: "2025-12",
            slowestMonthAverageSpeedMph: 5.4,
          },
        }),
        segment({
          routeId: "M1",
          segmentId: "M1:2026-03:S:34:400124:400518",
          averageSpeedMph: 5.2,
          historicalSpeedContext: {
            monthCount: 14,
            priorMonthAverageSpeedMph: 5.5,
            prior12MedianSpeedMph: 5.6,
            releaseVsPrior12DeltaMph: -0.4,
            slowestMonth: "2026-03",
            slowestMonthAverageSpeedMph: 5.2,
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.routeId as string).toBe("M1");
    expect(out.coverage.find((row) => row.scopeId.startsWith("M4:"))?.reasonCode as string).toBe(
      "historically_stable_slow_segment",
    );
    expect(out.coverage.find((row) => row.scopeId.startsWith("M1:"))?.outcome as string).toBe(
      "hit",
    );
  });
});

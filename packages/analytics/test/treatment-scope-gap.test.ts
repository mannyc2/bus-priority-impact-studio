import { describe, expect, test } from "bun:test";
import { detectTreatmentScopeGaps, type TreatmentScopeGapSegmentInput } from "../src/index.js";

const GENERATED_AT = "2026-06-07T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "treatment_scope_gap_test";

function segment(over: Partial<TreatmentScopeGapSegmentInput> = {}): TreatmentScopeGapSegmentInput {
  return {
    routeId: "B41",
    segmentId: "B41:2026-03:N:12:301001:301002",
    directionId: "N",
    segmentOrder: 12,
    directionMaxSegmentOrder: 22,
    averageSpeedMph: 4.8,
    segmentLengthFeet: 900,
    observationCount: 120,
    busTripCount: 450,
    daypartSpeeds: [
      { daypart: "am_peak", averageSpeedMph: 4.2, observationCount: 12, busTripCount: 100 },
    ],
    slowestDaypart: "am_peak",
    slowestDaypartAverageSpeedMph: 4.2,
    routeMedianSegmentSpeedMph: 7.1,
    routeSegmentSpeedRank: 1,
    routeSegmentCount: 22,
    routeSlownessPercentile: 1,
    networkMedianSegmentSpeedMph: 8.2,
    networkSegmentSpeedRank: 90,
    networkSegmentCount: 4100,
    networkSlownessPercentile: 0.98,
    treatmentType: "bus_lane",
    treatmentStatus: "not_found",
    matchMethod: "not_matched",
    overlapShare: 0,
    routeTreatmentSourceRefs: ["tier2:bus_lane:B41"],
    segmentTreatmentSourceRefs: [],
    positiveRouteTreatmentCount: 2,
    positiveSegmentTreatmentCount: 0,
    ...over,
  };
}

describe("detectTreatmentScopeGaps", () => {
  test("emits one candidate for the slowest uncovered segment on a treated route", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment(),
        segment({
          segmentId: "B41:2026-03:N:13:301002:301003",
          segmentOrder: 13,
          averageSpeedMph: 5.2,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({
      detectorId: "treatment_scope_gap",
      routeId: "B41",
      reasonCode: "treated_route_uncovered_slow_segment",
      claimSafeLabel: "issue_needs_review",
    });
    expect(out.evidence.map((row) => row.evidenceRole as string).sort()).toEqual([
      "context",
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage.filter((row) => row.outcome === "hit")).toHaveLength(1);
  });

  test("accepts true-uncovered scope-fit context as candidate-eligible", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          treatmentScopeFitContext: {
            fitStatus: "true_uncovered",
            sourceGapCount: 0,
            sourceGapKinds: [],
            blocksClaims: [],
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("suppresses uncovered claims when scope-fit context says a source gap blocks them", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          treatmentScopeFitContext: {
            fitStatus: "source_gap_blocked",
            sourceGapCount: 1,
            sourceGapKinds: ["current_inventory_missing"],
            blocksClaims: ["absence"],
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("treatment_source_gap");
  });

  test("does not duplicate covered positive bus-lane segments", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          treatmentType: "bus_lane",
          treatmentStatus: "current_confirmed",
          matchMethod: "route_shape_overlap",
          overlapShare: 0.7,
          positiveSegmentTreatmentCount: 1,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("spatial_join_uncertain");
  });

  test("routes partial confirmed coverage to context instead of uncovered-claim candidates", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          treatmentType: "bus_lane",
          treatmentStatus: "current_confirmed",
          matchMethod: "route_shape_overlap",
          overlapShare: 0.1,
          positiveSegmentTreatmentCount: 1,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("partial_confirmed_coverage");
  });

  test("routes source-only geometry to audit instead of uncovered-claim candidates", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [segment({ matchMethod: "source_only", overlapShare: null })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("geometry_unavailable");
  });

  test("suppresses terminal-like first segments unless they have enough length and daypart contrast", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [segment({ segmentOrder: 1, segmentLengthFeet: 700 })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("terminal_or_layover");
  });

  test("suppresses first segments even when length and daypart contrast look plausible", () => {
    const out = detectTreatmentScopeGaps({
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

  test("dedupes the same physical node-pair across co-located routes", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({ routeId: "B41", segmentId: "B41:2026-03:N:12:301001:301002" }),
        segment({ routeId: "B41LTD", segmentId: "B41LTD:2026-03:N:12:301001:301002" }),
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.coverage.filter((row) => row.outcome === "hit")).toHaveLength(1);
  });

  test("suppresses residual-modeled uncovered segments that are not worse than expected", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          speedResidualContext: {
            expectedSpeedMph: 4.7,
            speedResidualMph: 0.2,
            residualPercentileWithinMonth: 0.8,
            residualRankWithinMonth: 3200,
            residualMonthCount: 4000,
            segmentHistoryMeanSpeedMph: 4.8,
            segmentHistoryMedianSpeedMph: 4.7,
            segmentHistoryMonthCount: 24,
            routeMonthMeanSpeedMph: 5.8,
            routeHistoryMeanSpeedMph: 5.7,
            modelId: "segment_speed_residuals_v1",
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_failed_join");
    expect(out.coverage[0]?.reasonCode as string).toBe("residual_not_worse_than_expected");
  });

  test("keeps expected-slow uncovered segments when the route history is not chronically slow", () => {
    const out = detectTreatmentScopeGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      segments: [
        segment({
          speedResidualContext: {
            expectedSpeedMph: 4.2,
            speedResidualMph: 0.2,
            residualPercentileWithinMonth: 0.8,
            residualRankWithinMonth: 3200,
            residualMonthCount: 4000,
            segmentHistoryMeanSpeedMph: 4.3,
            segmentHistoryMedianSpeedMph: 4.2,
            segmentHistoryMonthCount: 24,
            routeMonthMeanSpeedMph: 8.1,
            routeHistoryMeanSpeedMph: 8,
            modelId: "segment_speed_residuals_v1",
          },
        }),
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });
});

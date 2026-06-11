import { describe, expect, test } from "bun:test";
import {
  bootstrapMeanInterval,
  buildEwtRouteMonthScoreVectorArtifact,
  compareDetectorVersions,
  type DetectorScoreVectorEntry,
  evaluateGoldSet,
  evaluateRangePrecisionRecall,
  flaggedSet,
  getCalibrationWindowConfig,
  getDetectorCalibrationPolicy,
  jaccardOverlap,
  listDetectorCalibrationPolicies,
  recommendDetectorRetirement,
  requiredBackfillSurfacesForDetector,
  segmentedRegressionSummary,
  summarizeDetectorReviewCycle,
  summarizeFalsePositiveRootCauses,
  summarizeReviewerDecisions,
  summarizeScoreVector,
} from "@bp/analytics/calibration";

describe("detector calibration helpers", () => {
  test("summarizes score vectors and overlap", () => {
    const entries: DetectorScoreVectorEntry[] = [
      { scopeId: "M15", score: 92, flagged: true },
      { scopeId: "M14", score: 50, flagged: false },
      { scopeId: "B44", score: 87, flagged: true },
    ];

    expect(summarizeScoreVector(entries)).toEqual({
      scopeCount: 3,
      flaggedCount: 2,
      flaggedShare: 2 / 3,
      minScore: 50,
      maxScore: 92,
    });
    expect(jaccardOverlap(flaggedSet(entries), new Set(["B44", "Q44"]))).toBe(1 / 3);
  });

  test("evaluates gold-set expectations without hiding unreviewed false positives", () => {
    expect(
      evaluateGoldSet({
        expectations: [
          { scopeId: "M15", shouldFlag: true },
          { scopeId: "M14", shouldFlag: false },
          { scopeId: "B44", shouldFlag: true },
        ],
        flaggedScopes: new Set(["M15", "M14", "Q44"]),
      }),
    ).toEqual({
      truePositive: 1,
      falsePositive: 2,
      trueNegative: 0,
      falseNegative: 1,
    });
  });

  test("summarizes reviewer decisions by detector", () => {
    expect(
      summarizeReviewerDecisions([
        { detectorId: "source_gap", decision: "approved" },
        { detectorId: "source_gap", decision: "rejected" },
        { detectorId: "delay_concentration", decision: "approved" },
      ]),
    ).toEqual([
      {
        detectorId: "delay_concentration",
        reviewedCount: 1,
        approvedCount: 1,
        approvalShare: 1,
      },
      {
        detectorId: "source_gap",
        reviewedCount: 2,
        approvedCount: 1,
        approvalShare: 0.5,
      },
    ]);
  });

  test("evaluates range-based precision and recall for window detectors", () => {
    expect(
      evaluateRangePrecisionRecall({
        predictedRanges: [
          { id: "pred-a", start: 10, end: 20 },
          { id: "pred-b", start: 40, end: 50 },
        ],
        expectedRanges: [
          { id: "gold-a", start: 15, end: 25 },
          { id: "gold-b", start: 60, end: 70 },
        ],
      }),
    ).toEqual({
      predictedCount: 2,
      expectedCount: 2,
      existencePrecision: 0.5,
      existenceRecall: 0.5,
      overlapPrecision: 0.25,
      overlapRecall: 0.25,
    });
  });

  test("compares detector versions and recommends retirement from confirmed rate", () => {
    expect(compareDetectorVersions("1.2.3", "2.0.0").changeKind).toBe("major");
    expect(compareDetectorVersions("1.2.3", "1.3.0").changeKind).toBe("minor");
    expect(compareDetectorVersions("1.2.3", "1.2.4").changeKind).toBe("patch");
    expect(compareDetectorVersions("1.2.3", "1.2.2").changeKind).toBe("regression");

    const summary = summarizeDetectorReviewCycle({
      detectorId: "bunching_hotspots",
      detectorVersion: "1.0.0",
      reviewedCount: 20,
      confirmedCount: 8,
    });

    expect(summary.confirmedRate).toBe(0.4);
    expect(
      recommendDetectorRetirement(summary, { minReviewedCount: 10, minConfirmedRate: 0.5 })
        .recommendation,
    ).toBe("retire_candidate");
  });

  test("summarizes false-positive root causes by detector version", () => {
    expect(
      summarizeFalsePositiveRootCauses([
        { detectorId: "speed_pace_hotspot", detectorVersion: "1.0.0", rootCause: "gps_noise" },
        { detectorId: "speed_pace_hotspot", detectorVersion: "1.0.0", rootCause: "gps_noise" },
        {
          detectorId: "speed_pace_hotspot",
          detectorVersion: "1.0.0",
          rootCause: "short_segment",
        },
      ]),
    ).toEqual([
      {
        detectorId: "speed_pace_hotspot",
        detectorVersion: "1.0.0",
        rootCause: "gps_noise",
        count: 2,
      },
      {
        detectorId: "speed_pace_hotspot",
        detectorVersion: "1.0.0",
        rootCause: "short_segment",
        count: 1,
      },
    ]);
  });

  test("computes seeded bootstrap mean intervals deterministically", () => {
    const left = bootstrapMeanInterval({
      values: [1, 2, 3, 4, 5],
      resamples: 50,
      confidenceLevel: 0.8,
      seed: 123,
    });
    const right = bootstrapMeanInterval({
      values: [1, 2, 3, 4, 5],
      resamples: 50,
      confidenceLevel: 0.8,
      seed: 123,
    });

    expect(left).toEqual(right);
    expect(left.estimate).toBe(3);
    expect(left.lower).not.toBeNull();
    expect(left.upper).not.toBeNull();
  });

  test("fits segmented regression level and slope changes", () => {
    const points = Array.from({ length: 10 }, (_, time) => {
      const post = time >= 5 ? 1 : 0;
      return {
        time,
        value: 10 + time + 5 * post + (post === 1 ? 2 * (time - 5) : 0),
      };
    });
    const summary = segmentedRegressionSummary({ points, interventionTime: 5 });

    expect(summary?.intercept).toBeCloseTo(10);
    expect(summary?.baselineSlope).toBeCloseTo(1);
    expect(summary?.levelChange).toBeCloseTo(5);
    expect(summary?.slopeChange).toBeCloseTo(2);
  });

  test("declares baseline-window and history gates for core detector calibration", () => {
    const policies = listDetectorCalibrationPolicies();
    expect(policies.map((policy) => policy.detectorId).sort()).toEqual([
      "bunching_hotspots",
      "customer_journey_shortfall",
      "degradation_trend",
      "delay_concentration",
      "headway_reliability_ewt",
      "intervention_event_study",
      "intervention_gap",
      "intervention_underperformance",
      "multi_month_speed_peer",
      "observed_reliability",
      "permit_correlated_slowdown",
      "persistent_speed_hotspot",
      "positive_deviance",
      "rider_weighted_excess_wait",
      "schedule_mismatch",
      "service_request_context",
      "source_gap",
      "speed_pace_hotspot",
      "travel_time_variability",
      "treatment_scope_gap",
      "treatment_scope_mismatch",
    ]);

    expect(getCalibrationWindowConfig("lookback36")).toMatchObject({
      defaultMonths: 36,
      minimumCompleteMonths: 24,
    });

    expect(getDetectorCalibrationPolicy("speed_pace_hotspot")).toMatchObject({
      baselineWindowIds: ["releaseMonth", "lookback12", "lookback36", "seasonalPeerWindow"],
    });

    expect(requiredBackfillSurfacesForDetector("source_gap")).toEqual([
      "gtfs_schedule_runtime",
      "observed_headways",
      "route_segment_speeds",
    ]);
    expect(requiredBackfillSurfacesForDetector("observed_reliability")).toEqual([
      "bus_wait_assessment",
      "gtfs_schedule_runtime",
      "observed_headways",
    ]);
    expect(requiredBackfillSurfacesForDetector("bunching_hotspots")).toEqual([
      "gtfs_schedule_runtime",
      "observed_headways",
    ]);
    expect(requiredBackfillSurfacesForDetector("rider_weighted_excess_wait")).toEqual([
      "gtfs_schedule_runtime",
      "observed_headways",
      "route_hourly_ridership",
    ]);
    expect(requiredBackfillSurfacesForDetector("customer_journey_shortfall")).toEqual([
      "customer_journey_metrics",
    ]);
    expect(requiredBackfillSurfacesForDetector("intervention_event_study")).toEqual([
      "intervention_comparisons",
      "route_segment_speeds",
    ]);
    expect(requiredBackfillSurfacesForDetector("intervention_gap")).toEqual([
      "intervention_comparisons",
      "route_segment_speeds",
    ]);
    expect(requiredBackfillSurfacesForDetector("permit_correlated_slowdown")).toEqual([
      "dot_permit_route_touches",
      "route_segment_speeds",
    ]);
    expect(requiredBackfillSurfacesForDetector("service_request_context")).toEqual([
      "route_segment_speeds",
      "service_request_route_touches",
    ]);
    expect(requiredBackfillSurfacesForDetector("unknown_detector")).toEqual([]);
  });

  test("builds EWT route-month score vectors against the pre-release baseline window", () => {
    const artifact = buildEwtRouteMonthScoreVectorArtifact({
      rows: [
        routeMonth("R1", "2026-01", 2),
        routeMonth("R1", "2026-02", 6),
        routeMonth("R1", "2026-03", 9),
        routeMonth("R2", "2026-01", 8),
        routeMonth("R2", "2026-02", 10),
        routeMonth("R2", "2026-03", 11),
        routeMonth("R3", "2026-03", 4),
        routeMonth("R4", "2026-02", 5, { reliabilityStatus: "insufficient_gtfs_rt_samples" }),
        routeMonth("R5", "2026-02", 5, { sampleCount: 4 }),
        routeMonth("R6", "2026-02", null),
      ],
      startMonth: "2026-01",
      endMonth: "2026-03",
      releaseMonth: "2026-03",
      generatedAt: "2026-05-30T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/ewt.json",
      minSampleCount: 30,
      fleetFlagQuantile: 0.75,
    });

    expect(artifact.detectorId).toBe("headway_reliability_ewt");
    expect(artifact.thresholds.fleetFlagCutoffScoreExcessWaitMinutes).toBe(8.5);
    expect(artifact.summary).toMatchObject({
      rawRowCount: 10,
      usableRowCount: 7,
      baselineUsableRowCount: 4,
      excludedRowCount: 3,
      releaseUsableRouteCount: 3,
      releaseFlaggedRouteCount: 2,
      scoreBasisCounts: {
        mta_abst_customer_journey_metric: 7,
        observed_regularity_excess_wait: 0,
        schedule_excess_wait: 0,
      },
    });
    expect(artifact.excludedRowsByReason).toEqual({
      insufficient_samples: 1,
      missing_score_wait_metric: 1,
      not_observed: 1,
    });

    const r1 = artifact.scoreVectors.releaseMonth.find((entry) => entry.routeId === "R1");
    const r2 = artifact.scoreVectors.releaseMonth.find((entry) => entry.routeId === "R2");
    const r3 = artifact.scoreVectors.releaseMonth.find((entry) => entry.routeId === "R3");
    expect(r1).toMatchObject({
      scoreExcessWaitMinutes: 9,
      mtaAbstMinutes: 9,
      scheduleExcessWaitMinutes: 9,
      scoreBasis: "mta_abst_customer_journey_metric",
      fleetHistoricalPercentile: 0.75,
      routeHistoricalPercentile: 1,
      score: 75,
      flagged: true,
    });
    expect(r2).toMatchObject({ score: 100, flagged: true });
    expect(r3).toMatchObject({
      fleetHistoricalPercentile: 0.25,
      routeHistoricalPercentile: null,
      score: 25,
      flagged: false,
    });

    const r3Baseline = artifact.baselines.routes.find((route) => route.routeId === "R3");
    expect(r3Baseline).toMatchObject({
      baselineMonthCount: 0,
      releaseMonth: { month: "2026-03", scoreExcessWaitMinutes: 4 },
    });
  });
});

function routeMonth(
  routeId: string,
  month: string,
  excessWaitMinutes: number | null,
  overrides: Partial<
    Parameters<typeof buildEwtRouteMonthScoreVectorArtifact>[0]["rows"][number]
  > = {},
): Parameters<typeof buildEwtRouteMonthScoreVectorArtifact>[0]["rows"][number] {
  return {
    routeId,
    month,
    runId: "test-run",
    reliabilityStatus: "observed",
    sampleCount: 50,
    stopCount: 20,
    directionCount: 2,
    averageObservedHeadwayMinutes: excessWaitMinutes === null ? null : 10,
    expectedWaitMinutes: excessWaitMinutes === null ? null : 5 + excessWaitMinutes,
    scheduledExpectedWaitMinutes: 6,
    excessWaitMinutes,
    mtaAbstMinutes: excessWaitMinutes,
    waitReliabilityRatio: excessWaitMinutes === null ? null : 1 + excessWaitMinutes / 10,
    ...overrides,
  };
}

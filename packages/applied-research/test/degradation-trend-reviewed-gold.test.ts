import { describe, expect, test } from "bun:test";
import {
  buildDegradationTrendReadinessProjection,
  buildDegradationTrendReviewedGoldArtifact,
  type DegradationTrendReviewedDecision,
  evaluateDegradationTrendReviewedGold,
} from "../src/evaluation/degradation-trend-reviewed-gold";

const DETECTOR_ID = "degradation_trend";

const DECISIONS: DegradationTrendReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15-dt",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: ["true_worsening_trend", "history_supported", "strong_robust_z"],
    reviewBatch: "degradation_trend_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Sustained multi-month speed decline with strong robust-z and supported history.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44-dt",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["route_version_break_confound", "not_actionable_as_claim"],
    reviewBatch: "degradation_trend_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Apparent trend straddles a route redesign; not a real degradation.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44-dt",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_worsening_trend", "single_metric_not_corroborated"],
    reviewBatch: "degradation_trend_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Real decline on one metric only; route-page context until corroborated.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79-dt",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_history", "short_baseline", "near_threshold"],
    reviewBatch: "degradation_trend_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin history and short prior baseline near threshold; needs more months.",
  },
];

describe("degradation trend reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects readiness buckets", () => {
    const gold = buildDegradationTrendReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "M15-dt", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "B44-dt", routeId: "B44" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED-dt", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90-dt",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "insufficient_history",
      },
    ];

    const evaluation = evaluateDegradationTrendReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildDegradationTrendReadinessProjection({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
      coverage,
    });

    expect(gold.summary).toMatchObject({
      labelCount: 4,
      primaryFindingCount: 1,
      routeContextCount: 1,
      needsMoreEvidenceCount: 1,
      suppressCount: 1,
    });
    expect(gold.summary.byCalibrationTag).toMatchObject({
      true_worsening_trend: 2,
      route_version_break_confound: 1,
    });
    expect(gold.labels.find((label) => label.expectedFrontendUse === "suppress")).toMatchObject({
      shouldEmitSignal: false,
      shouldPromotePrimary: false,
    });

    expect(evaluation.summary).toMatchObject({
      primaryExpectedCount: 1,
      primarySurvivedCount: 1,
      suppressExpectedCount: 1,
      suppressStillEmittedCount: 1,
      contextOrReviewerStillEmittedCount: 0,
      unreviewedEmittedCount: 1,
    });

    expect(projection.summary.byBucket).toEqual({
      public_finding_candidate: 1,
      route_context: 1,
      review_queue: 2,
      suppressed: 1,
    });
    expect(projection.summary).toMatchObject({
      reviewedSuppressedCount: 1,
      coverageSkippedCount: 1,
      unreviewedSuppressedCoverageCount: 1,
    });
  });
});

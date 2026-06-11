import { describe, expect, test } from "bun:test";
import {
  buildObservedReliabilityReadinessProjection,
  buildObservedReliabilityReviewedGoldArtifact,
  evaluateObservedReliabilityReviewedGold,
  type ObservedReliabilityReviewedDecision,
} from "../src/evaluation/observed-reliability-reviewed-gold";

const DECISIONS: ObservedReliabilityReviewedDecision[] = [
  {
    detectorId: "observed_reliability",
    scopeId: "B1",
    routeId: "B1",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: [
      "true_reliability_shortfall",
      "gtfs_rt_sample_supported",
      "schedule_baseline_supported",
      "bwa_corroborated",
    ],
    reviewBatch: "observed_reliability_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "High long-gap share with supporting scheduled baseline and BWA context.",
  },
  {
    detectorId: "observed_reliability",
    scopeId: "B103",
    routeId: "B103",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["direction_or_time_window_aggregation", "not_actionable_as_claim"],
    reviewBatch: "observed_reliability_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Route-month rollup is too coarse for a public finding.",
  },
  {
    detectorId: "observed_reliability",
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "clean_no_hit_control",
    expectedFrontendUse: "route_context",
    calibrationTags: ["route_month_rollup", "near_threshold"],
    reviewBatch: "observed_reliability_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Useful context for route pages but not a finding candidate.",
  },
  {
    detectorId: "observed_reliability",
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "skipped_control",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["missing_bus_wait_assessment"],
    reviewBatch: "observed_reliability_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Skipped route needs missing BWA context before promotion.",
  },
];

describe("observed reliability reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects route-level readiness buckets", () => {
    const gold = buildObservedReliabilityReviewedGoldArtifact({
      generatedAt: "2026-06-09T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      {
        detectorId: "observed_reliability",
        scopeId: "B1",
        routeId: "B1",
      },
      {
        detectorId: "observed_reliability",
        scopeId: "B103",
        routeId: "B103",
      },
      {
        detectorId: "observed_reliability",
        scopeId: "UNREVIEWED",
        routeId: "UNREVIEWED",
      },
    ];
    const coverage = [
      {
        detectorId: "observed_reliability",
        scopeId: "M15",
        routeId: "M15",
        outcome: "skipped_missing_input",
        reasonCode: "missing_bus_wait_assessment",
      },
    ];

    const evaluation = evaluateObservedReliabilityReviewedGold({
      generatedAt: "2026-06-09T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildObservedReliabilityReadinessProjection({
      generatedAt: "2026-06-09T00:00:00.000Z",
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
      true_reliability_shortfall: 1,
      missing_bus_wait_assessment: 1,
      not_actionable_as_claim: 1,
    });
    expect(
      gold.labels.find((label) => label.expectedFrontendUse === "route_context"),
    ).toMatchObject({
      shouldEmitSignal: true,
      shouldEmitFindingCandidate: false,
      shouldPromotePrimary: false,
    });
    expect(
      gold.labels.find((label) => label.expectedFrontendUse === "primary_finding"),
    ).toMatchObject({
      shouldEmitSignal: true,
      shouldEmitFindingCandidate: true,
      shouldPromotePrimary: true,
    });
    expect(evaluation.summary).toMatchObject({
      primarySurvivedCount: 1,
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
      unreviewedSuppressedCoverageCount: 0,
    });
  });
});

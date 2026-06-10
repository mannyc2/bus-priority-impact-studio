import { describe, expect, test } from "bun:test";
import {
  buildHeadwayReliabilityEwtReadinessProjection,
  buildHeadwayReliabilityEwtReviewedGoldArtifact,
  evaluateHeadwayReliabilityEwtReviewedGold,
  type HeadwayReliabilityEwtReviewedDecision,
} from "../src/evaluation/headway-reliability-ewt-reviewed-gold";

const DETECTOR_ID = "headway_reliability_ewt";

const DECISIONS: HeadwayReliabilityEwtReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15:stop-a:0:8",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: [
      "true_excess_wait_shortfall",
      "frequent_service_supported",
      "high_headway_samples",
    ],
    reviewBatch: "headway_reliability_ewt_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Sustained excess wait at a frequent-service cell with ample headway samples.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "BX10:stop-b:1:6",
    routeId: "BX10",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["extreme_variability_los_f", "feed_gap_or_coverage_artifact"],
    reviewBatch: "headway_reliability_ewt_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "LoS F is driven by a sparse-feed gap, not a real reliability shortfall.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44:stop-c:0:9",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["stop_direction_hour_cell", "single_cell_not_route_generalizable"],
    reviewBatch: "headway_reliability_ewt_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Useful route-page context but one stop-hour cell, not a standalone finding.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79:stop-d:0:7",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_headway_samples", "near_threshold"],
    reviewBatch: "headway_reliability_ewt_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin headway samples near threshold; needs more observed coverage.",
  },
];

describe("headway reliability ewt reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects stop-cell readiness buckets", () => {
    const gold = buildHeadwayReliabilityEwtReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "M15:stop-a:0:8", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "BX10:stop-b:1:6", routeId: "BX10" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED:stop-z:0:0", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90:stop-e:0:10",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "insufficient_headways",
      },
    ];

    const evaluation = evaluateHeadwayReliabilityEwtReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildHeadwayReliabilityEwtReadinessProjection({
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
      true_excess_wait_shortfall: 1,
      feed_gap_or_coverage_artifact: 1,
      single_cell_not_route_generalizable: 1,
    });
    expect(
      gold.labels.find((label) => label.expectedFrontendUse === "primary_finding"),
    ).toMatchObject({
      shouldEmitSignal: true,
      shouldEmitFindingCandidate: true,
      shouldPromotePrimary: true,
    });
    expect(gold.labels.find((label) => label.expectedFrontendUse === "suppress")).toMatchObject({
      shouldEmitSignal: false,
      shouldEmitFindingCandidate: false,
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

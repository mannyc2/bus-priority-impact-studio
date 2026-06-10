import { describe, expect, test } from "bun:test";
import {
  buildMultiMonthSpeedPeerReadinessProjection,
  buildMultiMonthSpeedPeerReviewedGoldArtifact,
  evaluateMultiMonthSpeedPeerReviewedGold,
  type MultiMonthSpeedPeerReviewedDecision,
} from "../src/evaluation/multi-month-speed-peer-reviewed-gold";

const DETECTOR_ID = "multi_month_speed_peer";

const DECISIONS: MultiMonthSpeedPeerReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: ["true_peer_speed_deficit", "multi_month_persistent", "strong_peer_group"],
    reviewBatch: "multi_month_speed_peer_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Persistent multi-month deficit below a strong matched-peer median.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["reciprocal_metric_artifact", "not_actionable_as_claim"],
    reviewBatch: "multi_month_speed_peer_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Deficit is an mph-vs-pace reciprocal artifact, not a real peer shortfall.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["fallback_peer_group", "not_a_causal_peer_control"],
    reviewBatch: "multi_month_speed_peer_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Real but on a fallback peer group; route-page context until peers are validated.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_observed_months", "near_threshold"],
    reviewBatch: "multi_month_speed_peer_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Few observed months near threshold; needs more trend support.",
  },
];

describe("multi-month speed peer reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects readiness buckets", () => {
    const gold = buildMultiMonthSpeedPeerReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "M15", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "B44", routeId: "B44" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "insufficient_trend_months",
      },
    ];

    const evaluation = evaluateMultiMonthSpeedPeerReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildMultiMonthSpeedPeerReadinessProjection({
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
      true_peer_speed_deficit: 1,
      fallback_peer_group: 1,
      reciprocal_metric_artifact: 1,
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

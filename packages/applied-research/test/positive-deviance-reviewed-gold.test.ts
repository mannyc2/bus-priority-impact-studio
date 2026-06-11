import { describe, expect, test } from "bun:test";
import {
  buildPositiveDevianceReadinessProjection,
  buildPositiveDevianceReviewedGoldArtifact,
  evaluatePositiveDevianceReviewedGold,
  type PositiveDevianceReviewedDecision,
} from "../src/evaluation/positive-deviance-reviewed-gold";

const DETECTOR_ID = "positive_deviance";

// Wave 4 inverted/internal-only vocabulary: learning_candidate / watchlist / reviewer_only / suppress
// ("suppress" = false deviant). No public bucket exists for this detector.
const DECISIONS: PositiveDevianceReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15-pd",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "learning_candidate",
    calibrationTags: ["true_positive_deviance", "multi_period_persistent", "peer_group_supported"],
    reviewBatch: "positive_deviance_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Genuine top-decile outperformer, persistent across periods; worth internal study.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44-pd",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "watchlist",
    calibrationTags: ["true_positive_deviance", "fragile_persistence"],
    reviewBatch: "positive_deviance_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Promising but only the minimum qualifying periods; watch before internal study.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79-pd",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "reviewer_only",
    calibrationTags: ["thin_peer_group", "peer_construction_artifact"],
    reviewBatch: "positive_deviance_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin peer group makes the percentile fragile; reviewer context only.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44-pd",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["false_deviant_schedule_padding", "not_a_best_practice_proof"],
    reviewBatch: "positive_deviance_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Apparent outperformance is schedule padding, not real speed; a false deviant.",
  },
];

describe("positive deviance reviewed gold artifact (inverted, internal-only)", () => {
  test("grades learning candidates, treats suppress as false deviants, never reaches public buckets", () => {
    const gold = buildPositiveDevianceReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "M15-pd", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "Q44-pd", routeId: "Q44" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED-pd", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90-pd",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "insufficient_peers",
      },
    ];

    const evaluation = evaluatePositiveDevianceReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildPositiveDevianceReadinessProjection({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
      coverage,
    });

    expect(gold.internalOnly).toBe(true);
    expect(gold.summary).toMatchObject({
      labelCount: 4,
      learningCandidateCount: 1,
      watchlistCount: 1,
      reviewerOnlyCount: 1,
      suppressCount: 1,
    });
    expect(
      gold.labels.find((label) => label.expectedFrontendUse === "learning_candidate"),
    ).toMatchObject({
      shouldEmitSignal: true,
      shouldSurfaceAsLearningCandidate: true,
      shouldPromotePublic: false,
    });
    expect(gold.labels.find((label) => label.expectedFrontendUse === "suppress")).toMatchObject({
      shouldEmitSignal: false,
      shouldSurfaceAsLearningCandidate: false,
      shouldPromotePublic: false,
    });

    expect(evaluation.summary).toMatchObject({
      learningCandidateExpectedCount: 1,
      learningCandidateSurvivedCount: 1,
      suppressExpectedCount: 1,
      suppressStillEmittedCount: 0,
      watchlistOrReviewerExpectedCount: 2,
      watchlistOrReviewerStillEmittedCount: 1,
      unreviewedEmittedCount: 1,
      publicLeakageCount: 0,
    });

    // Internal-only: only review_queue + suppressed buckets are ever populated.
    expect(projection.internalOnly).toBe(true);
    expect(projection.summary.byBucket).toEqual({
      public_finding_candidate: 0,
      route_context: 0,
      review_queue: 4,
      suppressed: 1,
    });
    expect(projection.summary).toMatchObject({
      reviewedSuppressedCount: 1,
      coverageSkippedCount: 1,
      unreviewedSuppressedCoverageCount: 1,
    });
  });
});

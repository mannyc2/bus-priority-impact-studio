import { describe, expect, test } from "bun:test";
import {
  buildPermitCorrelatedSlowdownReadinessProjection,
  buildPermitCorrelatedSlowdownReviewedGoldArtifact,
  evaluatePermitCorrelatedSlowdownReviewedGold,
  type PermitCorrelatedSlowdownReviewedDecision,
} from "../src/evaluation/permit-correlated-slowdown-reviewed-gold";

const DETECTOR_ID = "permit_correlated_slowdown";

// Associational context: expected label mass is route_context/suppress; primary_finding rare.
const DECISIONS: PermitCorrelatedSlowdownReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_permit_correlation_context", "slow_route_supported"],
    reviewBatch: "permit_correlated_slowdown_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
    rationale: "Slow route with substantial permit touches; route-page context, not causal.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["high_route_fanout", "not_a_causal_attribution"],
    reviewBatch: "permit_correlated_slowdown_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Permits touch dozens of routes; the coincidence is not specific to this route.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["low_match_weight", "broad_street_context_not_specific"],
    reviewBatch: "permit_correlated_slowdown_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Low match weight; need a stronger permit-to-route join before context use.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "reviewer_only",
    calibrationTags: ["temporal_misalignment", "unrelated_work_type"],
    reviewBatch: "permit_correlated_slowdown_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Permit window does not align with the slow month; reviewer context only.",
  },
];

describe("permit correlated slowdown reviewed gold artifact", () => {
  test("expects context/suppress mass, reports findings leakage, projects readiness buckets", () => {
    const gold = buildPermitCorrelatedSlowdownReviewedGoldArtifact({
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
        reasonCode: "insufficient_permit_touches",
      },
    ];

    const evaluation = evaluatePermitCorrelatedSlowdownReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildPermitCorrelatedSlowdownReadinessProjection({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
      coverage,
    });

    expect(gold.summary).toMatchObject({
      labelCount: 4,
      primaryFindingCount: 0,
      routeContextCount: 1,
      reviewerOnlyCount: 1,
      needsMoreEvidenceCount: 1,
      suppressCount: 1,
    });

    // Associational context: no primary_finding expected; findings leakage is 0.
    expect(evaluation.summary).toMatchObject({
      primaryExpectedCount: 0,
      findingsLeakageCount: 0,
      suppressExpectedCount: 1,
      suppressStillEmittedCount: 1,
      contextOrReviewerExpectedCount: 3,
      contextOrReviewerStillEmittedCount: 1,
      unreviewedEmittedCount: 1,
    });

    expect(projection.summary.byBucket).toEqual({
      public_finding_candidate: 0,
      route_context: 1,
      review_queue: 3,
      suppressed: 1,
    });
    expect(projection.summary).toMatchObject({
      reviewedSuppressedCount: 1,
      coverageSkippedCount: 1,
      unreviewedSuppressedCoverageCount: 1,
    });
  });
});

import { describe, expect, test } from "bun:test";
import {
  buildServiceRequestContextReadinessProjection,
  buildServiceRequestContextReviewedGoldArtifact,
  evaluateServiceRequestContextReviewedGold,
  type ServiceRequestContextReviewedDecision,
} from "../src/evaluation/service-request-context-reviewed-gold";

const DETECTOR_ID = "service_request_context";

const DECISIONS: ServiceRequestContextReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_service_request_context", "high_confidence_311_touches"],
    reviewBatch: "service_request_context_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
    rationale: "Slow route with strong bus-relevant 311 context; route-page context, not causal.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["high_route_fanout", "not_a_causal_attribution"],
    reviewBatch: "service_request_context_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "311 touches fan out across many nearby routes; not specific to this route.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["complaint_type_not_bus_relevant", "broad_street_condition_not_specific"],
    reviewBatch: "service_request_context_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Complaint types are not clearly bus-relevant; needs allowlist review.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "reviewer_only",
    calibrationTags: ["reporting_bias", "low_match_weight"],
    reviewBatch: "service_request_context_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Likely reporting-bias driven with weak join; reviewer context only.",
  },
];

describe("service request context reviewed gold artifact", () => {
  test("expects context/suppress mass, reports findings leakage, projects readiness buckets", () => {
    const gold = buildServiceRequestContextReviewedGoldArtifact({
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
        reasonCode: "insufficient_service_request_context",
      },
    ];

    const evaluation = evaluateServiceRequestContextReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildServiceRequestContextReadinessProjection({
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

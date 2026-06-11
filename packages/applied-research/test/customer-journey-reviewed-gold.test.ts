import { describe, expect, test } from "bun:test";
import {
  buildCustomerJourneyReadinessProjection,
  buildCustomerJourneyReviewedGoldArtifact,
  type CustomerJourneyReviewedDecision,
  evaluateCustomerJourneyReviewedGold,
} from "../src/evaluation/customer-journey-reviewed-gold";

const DECISIONS: CustomerJourneyReviewedDecision[] = [
  {
    detectorId: "customer_journey_shortfall",
    scopeId: "BM2:2026-04:Off-Peak:EXP",
    routeId: "BM2",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    rootCauseTags: ["true_customer_impact", "in_vehicle_component_driven"],
    reviewBatch: "customer_journey_initial_2026_04",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Strong persistent CJTP shortfall with substantial exposure.",
  },
  {
    detectorId: "customer_journey_shortfall",
    scopeId: "S86:2026-04:Off-Peak:LCL/LTD",
    routeId: "S86",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    rootCauseTags: ["low_exposure"],
    reviewBatch: "customer_journey_initial_2026_04",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Sparse denominator is not safe as a finding.",
  },
  {
    detectorId: "customer_journey_shortfall",
    scopeId: "Q37:2026-04:Peak:LCL/LTD",
    routeId: "Q37",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    rootCauseTags: ["true_customer_impact", "composite_metric_ambiguous"],
    reviewBatch: "customer_journey_initial_2026_04",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
    rationale: "Useful context, but component attribution is ambiguous.",
  },
];

describe("customer journey reviewed gold artifact", () => {
  test("evaluates reviewed labels by detector/scope identity and projects readiness buckets", () => {
    const gold = buildCustomerJourneyReviewedGoldArtifact({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-04",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      {
        detectorId: "customer_journey_shortfall",
        scopeId: "BM2:2026-04:Off-Peak:EXP",
        routeId: "BM2",
      },
      {
        detectorId: "customer_journey_shortfall",
        scopeId: "S86:2026-04:Off-Peak:LCL/LTD",
        routeId: "S86",
      },
      {
        detectorId: "customer_journey_shortfall",
        scopeId: "UNREVIEWED:2026-04:Peak:LCL/LTD",
        routeId: "UNREVIEWED",
      },
    ];

    const evaluation = evaluateCustomerJourneyReviewedGold({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-04",
      gold,
      candidates,
    });
    const projection = buildCustomerJourneyReadinessProjection({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-04",
      gold,
      candidates,
      coverage: [],
    });

    expect(gold.summary).toMatchObject({
      labelCount: 3,
      primaryFindingCount: 1,
      routeContextCount: 1,
      suppressCount: 1,
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
      review_queue: 1,
      suppressed: 1,
    });
    expect(projection.summary).toMatchObject({
      reviewedSuppressedCount: 1,
      coverageSkippedCount: 0,
      unreviewedSuppressedCoverageCount: 0,
    });
  });
});

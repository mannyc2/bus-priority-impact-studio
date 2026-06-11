import { describe, expect, test } from "bun:test";
import {
  buildInterventionGapReadinessProjection,
  buildInterventionGapReviewedGoldArtifact,
  evaluateInterventionGapReviewedGold,
  type InterventionGapReviewedDecision,
} from "../src/evaluation/intervention-gap-reviewed-gold";

const DETECTOR_ID = "intervention_gap";

const DECISIONS: InterventionGapReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_intervention_gap", "absent_evidence", "high_pain_supported"],
    reviewBatch: "intervention_gap_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
    rationale:
      "High-pain route with no dated treatment; scope-review context, not proof of absence.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["future_or_undated_treatment_possible", "not_proof_of_absence"],
    reviewBatch: "intervention_gap_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "A dated bus lane exists in the agency record; the local inventory just missed it.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_source_gap_evidence", "treatment_inventory_incomplete"],
    reviewBatch: "intervention_gap_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin source-gap evidence; inventory completeness must be checked first.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "reviewer_only",
    calibrationTags: ["pain_threshold_borough_fairness", "single_route_context"],
    reviewBatch: "intervention_gap_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Pain threshold sits near a borough fairness boundary; reviewer context only.",
  },
];

describe("intervention gap reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects readiness buckets", () => {
    const gold = buildInterventionGapReviewedGoldArtifact({
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
        reasonCode: "missing_pain_signal",
      },
    ];

    const evaluation = evaluateInterventionGapReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildInterventionGapReadinessProjection({
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
    expect(gold.summary.byCalibrationTag).toMatchObject({
      true_intervention_gap: 1,
      thin_source_gap_evidence: 1,
      not_proof_of_absence: 1,
    });

    expect(evaluation.summary).toMatchObject({
      primaryExpectedCount: 0,
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

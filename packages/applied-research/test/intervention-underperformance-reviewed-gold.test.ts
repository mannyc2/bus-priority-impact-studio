import { describe, expect, test } from "bun:test";
import {
  buildInterventionUnderperformanceReadinessProjection,
  buildInterventionUnderperformanceReviewedGoldArtifact,
  evaluateInterventionUnderperformanceReviewedGold,
  type InterventionUnderperformanceReviewedDecision,
} from "../src/evaluation/intervention-underperformance-reviewed-gold";

const DETECTOR_ID = "intervention_underperformance";

const DECISIONS: InterventionUnderperformanceReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_treatment_underperformance", "evaluated_comparison_supported"],
    reviewBatch: "intervention_underperformance_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
    rationale: "Real non-positive peer-adjusted delta; descriptive, so route-page context only.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["route_change_or_window_confound", "not_a_causal_impact"],
    reviewBatch: "intervention_underperformance_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Delta straddles a route change; not a treatment underperformance signal.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: ["true_treatment_underperformance", "strong_peer_comparison"],
    reviewBatch: "intervention_underperformance_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Strong peer comparison, durable non-positive delta, complete treatment evidence.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_or_undated_treatment_evidence", "thin_comparison_peers"],
    reviewBatch: "intervention_underperformance_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Undated treatment evidence and thin peers; needs more inventory.",
  },
];

describe("intervention underperformance reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects readiness buckets", () => {
    const gold = buildInterventionUnderperformanceReviewedGoldArtifact({
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
      { detectorId: DETECTOR_ID, scopeId: "Q44", routeId: "Q44" },
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

    const evaluation = evaluateInterventionUnderperformanceReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildInterventionUnderperformanceReadinessProjection({
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
      true_treatment_underperformance: 2,
      route_change_or_window_confound: 1,
    });

    expect(evaluation.summary).toMatchObject({
      primaryExpectedCount: 1,
      primarySurvivedCount: 1,
      suppressExpectedCount: 1,
      suppressStillEmittedCount: 1,
      contextOrReviewerStillEmittedCount: 1,
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

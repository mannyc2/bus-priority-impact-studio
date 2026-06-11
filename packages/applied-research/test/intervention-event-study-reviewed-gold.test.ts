import { describe, expect, test } from "bun:test";
import {
  buildInterventionEventStudyReadinessProjection,
  buildInterventionEventStudyReviewedGoldArtifact,
  evaluateInterventionEventStudyReviewedGold,
  type InterventionEventStudyReviewedDecision,
} from "../src/evaluation/intervention-event-study-reviewed-gold";

const DETECTOR_ID = "intervention_event_study";

// Candidate-causal: internal/methodology-review-only vocabulary. No public bucket exists.
const DECISIONS: InterventionEventStudyReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "methodology_review_candidate",
    calibrationTags: ["candidate_causal_gates_pass"],
    reviewBatch: "intervention_event_study_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "All methodology gates tested and passed; eligible for human methodology review.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "BX12",
    routeId: "BX12",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "associational_context",
    calibrationTags: ["associational_only", "needs_gate_testing"],
    reviewBatch: "intervention_event_study_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Control-eligible but causal gates untested; internal context only.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["weak_or_no_controls", "effect_estimate_unstable"],
    reviewBatch: "intervention_event_study_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Weak controls and unstable estimate; panel needs more support.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["pre_trend_failure", "not_a_usable_panel"],
    reviewBatch: "intervention_event_study_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Pre-trend fails; not a usable event-study panel.",
  },
];

describe("intervention event study reviewed gold (internal/methodology-review only)", () => {
  test("grades panel quality, suppresses failed gates, never reaches a public bucket", () => {
    const gold = buildInterventionEventStudyReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "Q44", routeId: "Q44" },
      { detectorId: DETECTOR_ID, scopeId: "BX12", routeId: "BX12" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "no_counterfactual",
      },
    ];

    const evaluation = evaluateInterventionEventStudyReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildInterventionEventStudyReadinessProjection({
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
      methodologyReviewCandidateCount: 1,
      associationalContextCount: 1,
      needsMoreEvidenceCount: 1,
      suppressCount: 1,
    });
    expect(
      gold.labels.find((label) => label.expectedFrontendUse === "methodology_review_candidate"),
    ).toMatchObject({
      shouldEmitSignal: true,
      shouldSurfaceForMethodologyReview: true,
      shouldPromotePublic: false,
    });
    expect(gold.labels.find((label) => label.expectedFrontendUse === "suppress")).toMatchObject({
      shouldEmitSignal: false,
      shouldSurfaceForMethodologyReview: false,
      shouldPromotePublic: false,
    });

    expect(evaluation.summary).toMatchObject({
      methodologyReviewCandidateExpectedCount: 1,
      methodologyReviewCandidateSurvivedCount: 1,
      suppressExpectedCount: 1,
      suppressStillEmittedCount: 0,
      associationalOrNeedsMoreExpectedCount: 2,
      associationalOrNeedsMoreStillEmittedCount: 1,
      unreviewedEmittedCount: 1,
      publicLeakageCount: 0,
    });

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

import { describe, expect, test } from "bun:test";
import {
  buildDelayConcentrationReadinessProjection,
  buildDelayConcentrationReviewedGoldArtifact,
  type DelayConcentrationReviewedDecision,
  evaluateDelayConcentrationReviewedGold,
} from "../src/evaluation/delay-concentration-reviewed-gold";

const DETECTOR_ID = "delay_concentration";

const DECISIONS: DelayConcentrationReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: [
      "true_delay_concentration",
      "fleet_benchmark_supported",
      "segment_support_supported",
      "top_segments_plausible",
      "not_causal_claim",
    ],
    reviewBatch: "delay_concentration_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale:
      "Top segment evidence is plausible, segment support is sufficient, and the label remains descriptive.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["duplicate_or_stale_segment_rows", "not_actionable_as_claim"],
    reviewBatch: "delay_concentration_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Top delay is driven by stale duplicate segment rows in the source geometry.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: [
      "true_delay_concentration",
      "single_segment_dominant",
      "segment_length_mix_uncertain",
    ],
    reviewBatch: "delay_concentration_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale:
      "Concentration appears real, but one segment dominates enough to keep it contextual until geometry is reviewed.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q17",
    routeId: "Q17",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["near_threshold", "low_eligible_segment_count", "segment_count_sensitive"],
    reviewBatch: "delay_concentration_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Near threshold with limited eligible segment count; needs more supporting evidence.",
  },
];

describe("delay concentration reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects readiness buckets", () => {
    const gold = buildDelayConcentrationReviewedGoldArtifact({
      generatedAt: "2026-06-11T00:00:00.000Z",
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
        reasonCode: "insufficient_speed_observations",
      },
    ];

    const evaluation = evaluateDelayConcentrationReviewedGold({
      generatedAt: "2026-06-11T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildDelayConcentrationReadinessProjection({
      generatedAt: "2026-06-11T00:00:00.000Z",
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
      true_delay_concentration: 2,
      duplicate_or_stale_segment_rows: 1,
      segment_count_sensitive: 1,
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

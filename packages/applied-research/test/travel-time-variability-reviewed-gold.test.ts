import { describe, expect, test } from "bun:test";
import {
  buildTravelTimeVariabilityReadinessProjection,
  buildTravelTimeVariabilityReviewedGoldArtifact,
  evaluateTravelTimeVariabilityReviewedGold,
  type TravelTimeVariabilityReviewedDecision,
} from "../src/evaluation/travel-time-variability-reviewed-gold";

const DETECTOR_ID = "travel_time_variability";

const DECISIONS: TravelTimeVariabilityReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15:0:am_peak",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: ["true_travel_time_variability", "runtime_sample_supported"],
    reviewBatch: "travel_time_variability_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Sustained high P95-vs-P50 spread with strong observed-trip support.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44:0:am_peak",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["incident_driven_p95_outlier", "not_actionable_as_claim"],
    reviewBatch: "travel_time_variability_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Single incident inflated P95; not a durable variability claim.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44:0:am_peak",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_travel_time_variability", "single_cell_not_route_generalizable"],
    reviewBatch: "travel_time_variability_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Real spread but one daypart/direction; route-page context only.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79:0:am_peak",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_observed_trips", "near_threshold"],
    reviewBatch: "travel_time_variability_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin observed trips near the buffer-index threshold; needs more coverage.",
  },
];

describe("travel time variability reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects route-cell readiness buckets", () => {
    const gold = buildTravelTimeVariabilityReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "M15:0:am_peak", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "B44:0:am_peak", routeId: "B44" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED:0:pm_peak", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90:0:midday",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "insufficient_runtime_observations",
      },
    ];

    const evaluation = evaluateTravelTimeVariabilityReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildTravelTimeVariabilityReadinessProjection({
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
      true_travel_time_variability: 2,
      incident_driven_p95_outlier: 1,
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

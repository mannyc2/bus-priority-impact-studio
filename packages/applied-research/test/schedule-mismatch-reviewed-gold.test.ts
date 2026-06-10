import { describe, expect, test } from "bun:test";
import {
  buildScheduleMismatchReadinessProjection,
  buildScheduleMismatchReviewedGoldArtifact,
  evaluateScheduleMismatchReviewedGold,
  type ScheduleMismatchReviewedDecision,
} from "../src/evaluation/schedule-mismatch-reviewed-gold";

const DETECTOR_ID = "schedule_mismatch";

const DECISIONS: ScheduleMismatchReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "B44:0:am_peak",
    routeId: "B44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: ["true_schedule_too_tight", "runtime_sample_supported"],
    reviewBatch: "schedule_mismatch_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Observed median far above scheduled with strong trip support; schedule review warranted.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15:0:am_peak",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["congestion_or_incident_confound", "not_actionable_as_claim"],
    reviewBatch: "schedule_mismatch_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Deviation tracks a known incident window, not a schedule problem.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44:0:am_peak",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_schedule_padding", "single_cell_not_route_generalizable"],
    reviewBatch: "schedule_mismatch_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Real padding signal but one daypart/direction; route-page context only.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79:0:am_peak",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_observed_trips", "near_threshold"],
    reviewBatch: "schedule_mismatch_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin observed trips near the deviation threshold; needs more coverage.",
  },
];

describe("schedule mismatch reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects route-cell readiness buckets", () => {
    const gold = buildScheduleMismatchReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "B44:0:am_peak", routeId: "B44" },
      { detectorId: DETECTOR_ID, scopeId: "M15:0:am_peak", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED:0:pm_peak", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90:0:midday",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "baseline_unavailable",
      },
    ];

    const evaluation = evaluateScheduleMismatchReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildScheduleMismatchReadinessProjection({
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
      true_schedule_too_tight: 1,
      true_schedule_padding: 1,
      congestion_or_incident_confound: 1,
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

import { describe, expect, test } from "bun:test";
import {
  buildBunchingHotspotsReadinessProjection,
  buildBunchingHotspotsReviewedGoldArtifact,
  evaluateBunchingHotspotsReviewedGold,
  type BunchingHotspotsReviewedDecision,
} from "../src/evaluation/bunching-hotspots-reviewed-gold";

const DETECTOR_ID = "bunching_hotspots";

const DECISIONS: BunchingHotspotsReviewedDecision[] = [
  {
    detectorId: DETECTOR_ID,
    scopeId: "M15:stop-a:0:8",
    routeId: "M15",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "primary_finding",
    calibrationTags: ["true_bunching_hotspot", "high_pair_support"],
    reviewBatch: "bunching_hotspots_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Sustained bunching at a high-pair-support cell.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "BX10:stop-b:1:6",
    routeId: "BX10",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "suppress",
    calibrationTags: ["extreme_share", "gps_arrival_noise_artifact"],
    reviewBatch: "bunching_hotspots_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
    rationale: "Extreme short-headway share is GPS arrival noise at closely spaced stops.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "Q44:stop-c:0:9",
    routeId: "Q44",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "route_context",
    calibrationTags: ["true_headway_gap_hotspot", "single_cell_not_route_generalizable"],
    reviewBatch: "bunching_hotspots_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "medium",
    rationale: "Real long-gap cell but one stop-hour, route-page context only.",
  },
  {
    detectorId: DETECTOR_ID,
    scopeId: "S79:stop-d:0:7",
    routeId: "S79",
    sourceQueue: "candidate_review",
    expectedFrontendUse: "needs_more_evidence",
    calibrationTags: ["thin_pair_support", "near_threshold"],
    reviewBatch: "bunching_hotspots_initial_2026_03",
    reviewDepth: "light",
    reviewerConfidence: "low",
    rationale: "Thin headway-pair support near threshold; needs more observed coverage.",
  },
];

describe("bunching hotspots reviewed gold artifact", () => {
  test("evaluates suppress leakage and projects stop-cell readiness buckets", () => {
    const gold = buildBunchingHotspotsReviewedGoldArtifact({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      reviewQueuePath: "queue.json",
      decisionsPath: "decisions.json",
      decisions: DECISIONS,
    });
    const candidates = [
      { detectorId: DETECTOR_ID, scopeId: "M15:stop-a:0:8", routeId: "M15" },
      { detectorId: DETECTOR_ID, scopeId: "BX10:stop-b:1:6", routeId: "BX10" },
      { detectorId: DETECTOR_ID, scopeId: "UNREVIEWED:stop-z:0:0", routeId: "UNREVIEWED" },
    ];
    const coverage = [
      {
        detectorId: DETECTOR_ID,
        scopeId: "Q90:stop-e:0:10",
        routeId: "Q90",
        outcome: "skipped_missing_input",
        reasonCode: "insufficient_headway_pairs",
      },
    ];

    const evaluation = evaluateBunchingHotspotsReviewedGold({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      asOfMonth: "2026-03",
      gold,
      candidates,
    });
    const projection = buildBunchingHotspotsReadinessProjection({
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
      true_bunching_hotspot: 1,
      true_headway_gap_hotspot: 1,
      gps_arrival_noise_artifact: 1,
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

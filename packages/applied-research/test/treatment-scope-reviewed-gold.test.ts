import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  buildTreatmentScopeReadinessProjection,
  buildTreatmentScopeReviewedGoldArtifact,
  evaluateTreatmentScopeReviewedGold,
} from "../src/evaluation";

const FIXTURE_ROOT = join(import.meta.dir, "fixtures/treatment-scope-reviewed-gold");

function fixturePath(file: string): string {
  return join(FIXTURE_ROOT, file);
}

describe("treatment-scope reviewed gold artifact", () => {
  test("preserves adversarial labels and evaluates candidates by detector/scope identity", () => {
    const gold = buildTreatmentScopeReviewedGoldArtifact({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      decisionsPath: "decisions.json",
      packetIndexPath: "packets-index.json",
      packetIndex: [
        {
          candidateId: "old-candidate-1",
          detectorId: "treatment_scope_gap",
          routeId: "B8",
          scopeId: "B8:2026-03:W:33:300882:300893",
          file: "packets/old-candidate-1.json",
        },
        {
          candidateId: "old-candidate-2",
          detectorId: "treatment_scope_gap",
          routeId: "M79+",
          scopeId: "M79+:2026-03:E:1:403522:403523",
        },
      ],
      decisions: [
        {
          candidateId: "old-candidate-1",
          decision: "keep",
          action: "promote_primary",
          reviewerConfidence: "high",
          falsePositiveRootCause: "not_false_positive",
          frontendUse: "primary_finding",
          reviewBatch: "fixture_original",
          reviewDepth: "adversarial",
          calibrationTags: ["strong_segment_speed_evidence"],
        },
        {
          candidateId: "old-candidate-2",
          decision: "reject",
          action: "suppress",
          reviewerConfidence: "high",
          falsePositiveRootCause: "terminal_or_layover",
          frontendUse: "suppress",
          reviewBatch: "fixture_expansion",
          reviewDepth: "light",
          calibrationTags: ["terminal_or_layover"],
        },
      ],
    });

    expect(gold.summary).toMatchObject({
      labelCount: 2,
      primaryFindingCount: 1,
      suppressCount: 1,
      byReviewBatch: {
        fixture_expansion: 1,
        fixture_original: 1,
      },
      byReviewDepth: {
        adversarial: 1,
        light: 1,
      },
    });
    expect(gold.labels[0]?.identityKey).toBe("treatment_scope_gap\0B8:2026-03:W:33:300882:300893");

    const evaluation = evaluateTreatmentScopeReviewedGold({
      generatedAt: "2026-06-07T00:01:00.000Z",
      releaseMonth: "2026-03",
      gold,
      candidates: [
        {
          candidateId: "new-candidate-id",
          detectorId: "treatment_scope_gap",
          routeId: "B8",
          scopeId: "B8:2026-03:W:33:300882:300893",
        },
        {
          candidateId: "unreviewed",
          detectorId: "treatment_scope_gap",
          routeId: "B46",
          scopeId: "B46:2026-03:N:41:303630:303158",
        },
      ],
    });

    expect(evaluation.summary).toMatchObject({
      emittedReviewedCount: 1,
      droppedReviewedCount: 1,
      primaryExpectedCount: 1,
      primarySurvivedCount: 1,
      suppressExpectedCount: 1,
      suppressStillEmittedCount: 0,
      unreviewedEmittedCount: 1,
    });
    expect(evaluation.byReviewBatch["fixture_original"]).toMatchObject({
      expected: 1,
      emitted: 1,
      primaryExpected: 1,
      primarySurvived: 1,
    });
    expect(evaluation.byReviewBatch["fixture_expansion"]).toMatchObject({
      expected: 1,
      dropped: 1,
      suppressExpected: 1,
      suppressStillEmitted: 0,
    });
  });

  test("builds treatment-scope gold labels from tracked reviewed fixtures", async () => {
    const decisionsPath = fixturePath("original-decisions.json");
    const packetIndexPath = fixturePath("original-packets-index.json");
    const decisionsDoc = await Bun.file(decisionsPath).json();
    const packetIndex = await Bun.file(packetIndexPath).json();

    const gold = buildTreatmentScopeReviewedGoldArtifact({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      decisionsPath,
      packetIndexPath,
      decisions: decisionsDoc.decisions,
      packetIndex,
      defaultReviewBatch: "original_fixture",
      defaultReviewDepth: "adversarial_fixture",
    });

    expect(gold.summary).toMatchObject({
      labelCount: 6,
      primaryFindingCount: 2,
      contextCount: 1,
      reviewerOnlyCount: 1,
      needsMoreEvidenceCount: 1,
      suppressCount: 1,
      byReviewBatch: {
        original_fixture: 6,
      },
      byReviewDepth: {
        adversarial_fixture: 6,
      },
    });
    expect(gold.summary.byDetector["treatment_scope_gap"]).toMatchObject({
      labelCount: 3,
      primaryFindingCount: 1,
      suppressCount: 1,
    });
    expect(gold.summary.byDetector["treatment_scope_mismatch"]).toMatchObject({
      labelCount: 3,
      primaryFindingCount: 1,
      suppressCount: 0,
    });
    expect(gold.summary.byFalsePositiveRootCause).toMatchObject({
      duplicate_or_less_specific: 1,
      geometry_join_bad: 1,
      not_false_positive: 2,
      source_inventory_gap: 1,
      terminal_or_layover: 1,
    });
  });

  test("builds expanded treatment-scope gold labels by review batch", async () => {
    const originalDecisionsPath = fixturePath("original-decisions.json");
    const originalPacketIndexPath = fixturePath("original-packets-index.json");
    const expansionDecisionsPath = fixturePath("second-expansion-decisions.json");
    const expansionPacketIndexPath = fixturePath("second-expansion-packets-index.json");
    const originalDecisionsDoc = await Bun.file(originalDecisionsPath).json();
    const originalPacketIndex = await Bun.file(originalPacketIndexPath).json();
    const expansionDecisionsDoc = await Bun.file(expansionDecisionsPath).json();
    const expansionPacketIndex = await Bun.file(expansionPacketIndexPath).json();

    const gold = buildTreatmentScopeReviewedGoldArtifact({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      decisionsPath: `${originalDecisionsPath} + ${expansionDecisionsPath}`,
      packetIndexPath: `${originalPacketIndexPath} + ${expansionPacketIndexPath}`,
      decisions: [
        ...originalDecisionsDoc.decisions.map((decision: Record<string, unknown>) => ({
          ...decision,
          reviewBatch: "original_fixture",
          reviewDepth: "adversarial_fixture",
        })),
        ...expansionDecisionsDoc.decisions,
      ],
      packetIndex: [...originalPacketIndex, ...expansionPacketIndex],
    });

    expect(gold.summary).toMatchObject({
      labelCount: 10,
      primaryFindingCount: 4,
      contextCount: 2,
      reviewerOnlyCount: 1,
      needsMoreEvidenceCount: 1,
      suppressCount: 2,
      byReviewBatch: {
        original_fixture: 6,
        second_expansion_fixture: 4,
      },
      byReviewDepth: {
        adversarial_fixture: 8,
        light_fixture: 2,
      },
    });
    expect(gold.summary.byDetector["treatment_scope_gap"]).toMatchObject({
      labelCount: 5,
      primaryFindingCount: 2,
      suppressCount: 1,
    });
    expect(gold.summary.byDetector["treatment_scope_mismatch"]).toMatchObject({
      labelCount: 5,
      primaryFindingCount: 2,
      suppressCount: 1,
    });
  });

  test("projects treatment-scope readiness buckets from reviewed labels and geometry state", () => {
    const gold = buildTreatmentScopeReviewedGoldArtifact({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      decisionsPath: "decisions.json",
      packetIndexPath: "packets-index.json",
      packetIndex: [
        {
          candidateId: "primary",
          detectorId: "treatment_scope_mismatch",
          routeId: "B52",
          scopeId: "B52:2026-03:E:2:307460:302947",
        },
        {
          candidateId: "context",
          detectorId: "treatment_scope_gap",
          routeId: "B43",
          scopeId: "B43:2026-03:N:28:303737:304664",
        },
        {
          candidateId: "reviewer",
          detectorId: "treatment_scope_mismatch",
          routeId: "QM15",
          scopeId: "QM15:2026-03:W:32:450417:450017",
        },
        {
          candidateId: "suppress",
          detectorId: "treatment_scope_mismatch",
          routeId: "Q24",
          scopeId: "Q24:2026-03:W:35:301973:307238",
        },
      ],
      decisions: [
        { candidateId: "primary", frontendUse: "primary_finding" },
        { candidateId: "context", frontendUse: "route_context" },
        { candidateId: "reviewer", frontendUse: "needs_more_evidence" },
        { candidateId: "suppress", frontendUse: "suppress" },
      ],
    });

    const projection = buildTreatmentScopeReadinessProjection({
      generatedAt: "2026-06-07T00:05:00.000Z",
      releaseMonth: "2026-03",
      gold,
      candidates: [
        {
          candidateId: "new-primary",
          detectorId: "treatment_scope_mismatch",
          routeId: "B52",
          scopeId: "B52:2026-03:E:2:307460:302947",
        },
        {
          candidateId: "new-context",
          detectorId: "treatment_scope_gap",
          routeId: "B43",
          scopeId: "B43:2026-03:N:28:303737:304664",
        },
        {
          candidateId: "new-reviewer",
          detectorId: "treatment_scope_mismatch",
          routeId: "QM15",
          scopeId: "QM15:2026-03:W:32:450417:450017",
        },
      ],
      coverage: [
        {
          detectorId: "treatment_scope_mismatch",
          scopeId: "B52:2026-03:E:2:307460:302947",
          outcome: "hit",
          inputsSeenJson: JSON.stringify({
            matchMethod: "route_shape_overlap",
            overlapShare: 0.92,
            treatmentSourceRefs: ["nyc_dot_bus_lane_type:Busway"],
          }),
        },
        {
          detectorId: "treatment_scope_gap",
          scopeId: "B43:2026-03:N:28:303737:304664",
          outcome: "hit",
          inputsSeenJson: JSON.stringify({
            matchMethod: "not_matched",
            overlapShare: 0,
            positiveRouteTreatmentCount: 1,
            treatmentScopeFitContext: { fitStatus: "true_uncovered", sourceGapCount: 0 },
          }),
        },
        {
          detectorId: "treatment_scope_mismatch",
          scopeId: "QM15:2026-03:W:32:450417:450017",
          outcome: "hit",
          inputsSeenJson: JSON.stringify({
            matchMethod: "route_shape_overlap",
            overlapShare: 1,
            treatmentSourceRefs: ["nyc_dot_bus_lane_type:Curbside"],
          }),
        },
        {
          detectorId: "treatment_scope_mismatch",
          scopeId: "Q24:2026-03:W:35:301973:307238",
          outcome: "skipped_missing_input",
          reasonCode: "treatment_segment_gap",
          inputsSeenJson: JSON.stringify({
            matchMethod: "route_shape_overlap",
            overlapShare: 0.25,
            treatmentSourceRefs: ["nyc_dot_bus_lane_type:Enhanced bus stop"],
          }),
        },
      ],
    });

    expect(projection.summary.byBucket).toEqual({
      public_finding_candidate: 1,
      route_context: 1,
      review_queue: 1,
      suppressed: 1,
    });
    expect(
      projection.items.find((item) => item.bucket === "public_finding_candidate"),
    ).toMatchObject({
      reviewedFrontendUse: "primary_finding",
      geometrySourceConfirmed: true,
    });
    const suppressed = projection.items.find((item) => item.reviewedFrontendUse === "suppress");
    expect(suppressed?.bucket).toBe("suppressed");
    expect(suppressed?.caveats).toContain("enhanced_bus_stop_only");
  });
});

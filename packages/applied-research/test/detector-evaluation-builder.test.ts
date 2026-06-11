import { describe, expect, test } from "bun:test";
import { ANALYTICS_DETECTOR_REGISTRY } from "@bp/analytics/registry";
import { buildDetectorEvaluationArtifact } from "../src/evaluation";

describe("detector evaluation artifact builder", () => {
  test("builds scorecards from review decisions, labels, and queue artifacts", () => {
    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      generatedAt: "2026-06-01T00:00:00.000Z",
      runId: "test-run",
      inputArtifacts: {
        reviewDecisions: "review-decisions.json",
        promotedFindings: "promoted-findings.json",
        reviewPackets: "review-packets.json",
        reviewPacketCoverage: "review-packet-coverage.json",
        reviewQueue: "review-queue.json",
        promotionQueue: "promotion-queue.json",
        goldSetEvaluation: "gold-set-evaluation.json",
        readiness: "readiness.json",
        detectorCoverageAudit: "detector-coverage-audit.json",
        ewtScoreVectors: "ewt-route-month-score-vectors.json",
        speedPaceScoreVectors: "speed-pace-score-vectors.json",
        runtimeTrendScoreVectors: "runtime-trend-score-vectors.json",
        detectorScoreVectors: "detector-score-vectors.json",
        evaluationLabels: "detector-evaluation-labels.json",
        grainAudit: "grain-audit.json",
        segmentSpeedResiduals: "segment-speed-residuals.json",
        segmentDaypartResiduals: "segment-daypart-residuals.json",
        routePeerResiduals: "route-peer-residuals.json",
        reliabilityExposurePanel: "reliability-exposure-panel.json",
        interventionScopeFit: "intervention-scope-fit.json",
        sourceGapModel: "source-gap-model.json",
        treatmentEventPanel: "treatment-event-panel.json",
        pulseFingerprint: "pulse-fingerprint.json",
        decouplingQuadrants: "decoupling-quadrants.json",
      },
      reviewDecisions: {
        decisions: [
          {
            candidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
            decision: "approve_with_revisions",
          },
        ],
      },
      promotedFindings: {
        findings: [
          {
            sourceCandidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
          },
        ],
      },
      reviewPackets: {
        packets: [
          {
            candidate: {
              candidateId: "c1",
              detectorId: "observed_reliability",
              routeId: "M15",
              claimText: "Route M15 has observed reliability evidence.",
            },
            packetCompleteness: {
              hasPrimaryEvidence: true,
              hasCounterEvidence: true,
              hasCoverageAudit: true,
              hasDetectorSpec: true,
              hasReviewChecklist: true,
            },
          },
        ],
      },
      reviewPacketCoverage: null,
      reviewQueue: null,
      promotionQueue: {
        candidates: [
          {
            candidate: {
              candidateId: "c1",
              detectorId: "observed_reliability",
              routeId: "M15",
            },
            readiness: "ready_for_review",
          },
          {
            candidate: {
              candidateId: "c2",
              detectorId: "observed_reliability",
              routeId: "M16",
            },
            readiness: "ready_for_review",
          },
        ],
      },
      goldSetEvaluation: null,
      readiness: {
        detectors: [{ detectorId: "observed_reliability", status: "ready" }],
      },
      detectorCoverageAudit: {
        detectors: [
          {
            detectorId: "observed_reliability",
            coverageCount: 2,
            outcomeCounts: {
              hit: 1,
              clean_no_hit: 1,
              skipped_missing_input: 0,
            },
          },
        ],
      },
      ewtScoreVectors: null,
      speedPaceScoreVectors: null,
      runtimeTrendScoreVectors: null,
      detectorScoreVectors: {
        detectors: [
          {
            detectorId: "observed_reliability",
            summary: {
              scopeCount: 100,
              flaggedCount: 10,
              cleanNoHitCount: 90,
              skippedCount: 0,
              monthCount: 12,
              flaggedShare: 0.1,
            },
            entries: [
              { score: 100, flagged: true },
              { score: 80, flagged: true },
              { score: 50, flagged: false },
              { score: 20, flagged: false },
            ],
          },
        ],
      },
      evaluationLabels: {
        summary: {
          confirmedNegativeCount: 1,
          holdoutNegativeCount: 1,
          missingDataScopeCount: 0,
        },
        labels: [
          {
            labelId: "observed_reliability:2026-03:route:M16",
            detectorId: "observed_reliability",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M16",
            label: "confirmed_negative",
            set: "holdout",
          },
        ],
        missingDataScopes: [],
      },
      grainAudit: null,
      segmentSpeedResiduals: {
        artifactKind: "segment_speed_residuals_v1",
        schemaVersion: 1,
        generatedAt: "2026-06-01T00:00:00.000Z",
        artifactPath: "segment-speed-residuals.json",
        releaseMonth: "2026-03",
        panelSpec: {
          panelId: "segment_month_panel_v1",
          startMonth: "2023-04",
          endMonth: "2026-03",
          minObservationCount: 50,
        },
        panelManifest: {
          panelId: "segment_month_panel_v1",
          schemaVersion: 1,
          generatedAt: "2026-06-01T00:00:00.000Z",
          spec: {
            panelId: "segment_month_panel_v1",
            schemaVersion: 1,
            grain: "route_id + month + direction + stable_segment_key",
            timeKey: "month",
            entityKeys: ["route_id", "direction", "stop_order", "timepoint_pair"],
            measures: ["average_speed_mph"],
            joins: [],
            coverage: ["segment_history_month_count"],
            historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
            releaseFilter: { month: "2026-03" },
            requiredProducts: [
              {
                productId: "local_route_segment_speed_history",
                state: "available",
                role: "source",
              },
            ],
            eligibilityRules: [],
            negativeMeaning: "Fixture model artifact.",
          },
          inputRefs: [],
          summary: {
            sourceRowCount: 10,
            supportedRowCount: 8,
            panelRowCount: 8,
            routeCount: 2,
            entityCount: 3,
            monthCount: 2,
          },
          limitations: ["fixture limitation"],
        },
        summary: {
          panelRowCount: 8,
          modeledReleaseRowCount: 3,
          routeCount: 2,
          segmentCount: 3,
          releaseMonthResidualMedianMph: -0.2,
        },
        rows: [],
      },
      segmentDaypartResiduals: null,
      routePeerResiduals: null,
      reliabilityExposurePanel: null,
      interventionScopeFit: {
        artifactKind: "intervention_scope_fit_v1",
        schemaVersion: 1,
        generatedAt: "2026-06-01T00:00:00.000Z",
        artifactPath: "intervention-scope-fit.json",
        month: "2026-03",
        panelSpec: {
          panelId: "intervention_scope_fit_panel_v1",
          month: "2026-03",
          minCoveredOverlapShare: 0.2,
          minPartialOverlapShare: 0.01,
        },
        panelManifest: {
          panelId: "intervention_scope_fit_panel_v1",
          schemaVersion: 1,
          generatedAt: "2026-06-01T00:00:00.000Z",
          spec: {
            panelId: "intervention_scope_fit_panel_v1",
            schemaVersion: 1,
            grain: "route_id + month + treatment_type + segment_id",
            timeKey: "month",
            entityKeys: ["route_id", "treatment_type", "segment_id"],
            measures: ["fit_status"],
            joins: [],
            coverage: ["fit_status"],
            historyWindow: { startMonth: "2026-03", endMonth: "2026-03" },
            releaseFilter: { month: "2026-03" },
            requiredProducts: [
              {
                productId: "route_treatment_summary_artifact",
                state: "available",
                role: "artifact",
              },
            ],
            eligibilityRules: [],
            negativeMeaning: "Fixture scope-fit artifact.",
          },
          inputRefs: [],
          summary: {
            sourceRowCount: 10,
            supportedRowCount: 4,
            panelRowCount: 4,
            routeCount: 2,
            entityCount: 3,
            monthCount: 1,
          },
          limitations: ["fixture scope-fit limitation"],
        },
        summary: {
          routeCount: 2,
          rowCount: 4,
          segmentRowCount: 3,
          routeOnlyRowCount: 1,
          sourceGapBlockedRowCount: 0,
          fitStatusCounts: {
            covered: 1,
            partial_confirmed: 1,
            true_uncovered: 1,
            route_only: 1,
            geometry_unavailable: 0,
            source_gap_blocked: 0,
            not_applicable: 0,
          },
          treatmentTypeCounts: {
            bus_lane: 3,
            automated_bus_lane_enforcement: 1,
          },
        },
        rows: [],
      },
      sourceGapModel: {
        artifactKind: "source_gap_model_v1",
        schemaVersion: 1,
        generatedAt: "2026-06-01T00:00:00.000Z",
        artifactPath: "source-gap-model.json",
        month: "2026-03",
        panelSpec: {
          panelId: "source_gap_panel_v1",
          month: "2026-03",
        },
        panelManifest: {
          panelId: "source_gap_panel_v1",
          schemaVersion: 1,
          generatedAt: "2026-06-01T00:00:00.000Z",
          spec: {
            panelId: "source_gap_panel_v1",
            schemaVersion: 1,
            grain: "route_id + month + treatment_type + gap_kind",
            timeKey: "month",
            entityKeys: ["route_id", "treatment_type", "gap_kind"],
            measures: ["source_gap_count", "blocks_claims"],
            joins: ["route_treatment_source_gap"],
            coverage: ["source_gap_count"],
            historyWindow: { startMonth: "2026-03", endMonth: "2026-03" },
            releaseFilter: { month: "2026-03" },
            requiredProducts: [
              {
                productId: "route_treatment_summary_artifact",
                state: "available",
                role: "artifact",
              },
            ],
            eligibilityRules: [],
            negativeMeaning: "Fixture source-gap artifact.",
          },
          inputRefs: [],
          summary: {
            sourceRowCount: 2,
            supportedRowCount: 2,
            panelRowCount: 2,
            routeCount: 2,
            entityCount: 2,
            monthCount: 1,
          },
          limitations: ["fixture source-gap limitation"],
        },
        summary: {
          routeCount: 2,
          rowCount: 2,
          sourceGapCount: 2,
          treatmentTypeCounts: {
            transit_signal_priority: 2,
          },
          gapKindCounts: {
            current_inventory_missing: 2,
          },
          blockedClaimCounts: {
            coverage: 2,
          },
        },
        rows: [],
      },
      treatmentEventPanel: null,
      pulseFingerprint: null,
      decouplingQuadrants: null,
    });

    expect(artifact.summary.detectorCount).toBe(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(
      artifact.detectorVersions.find((detector) => detector.detectorId === "observed_reliability"),
    ).toMatchObject({
      requiredDataProducts: [
        "local_bus_wait_assessment_history",
        "local_route_observed_reliability_summary_release",
        "local_route_reliability_baseline_release",
      ],
    });
    expect(artifact.evaluationSets.confirmedPositiveCount).toBe(1);
    expect(artifact.evaluationSets.confirmedNegativeCount).toBe(1);
    expect(artifact.evaluationSets.nearMissCount).toBe(1);
    expect(artifact.evaluationSets.holdoutStatus).toBe("holdout_available");
    expect(artifact.qualityLab).toMatchObject({
      reviewedDecisionCount: 1,
      reviewerApprovedDecisionCount: 1,
      promotedFindingCount: 1,
      falsePositiveRootCount: 0,
      thresholdAndRankStabilityStatus: "partial",
      rankStabilityCheckedDetectorCount: 1,
      rankStabilityFragileDetectorCount: 1,
    });

    const observed = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "observed_reliability",
    );
    expect(observed?.flags).not.toContain("positive_only_gold_set");
    expect(observed?.flags).not.toContain("score_vector_unavailable");
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "segment_speed_residuals_v1",
        status: "available",
        artifactPath: "segment-speed-residuals.json",
        panelId: "segment_month_panel_v1",
        modeledReleaseRowCount: 3,
        medianResidualMph: -0.2,
        detectorConsumers: ["treatment_scope_gap", "treatment_scope_mismatch"],
      }),
    );
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "reliability_exposure_panel_v1",
        status: "missing",
        detectorConsumers: ["rider_weighted_excess_wait"],
      }),
    );
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "segment_daypart_residuals_v1",
        status: "missing",
        artifactPath: "segment-daypart-residuals.json",
        detectorConsumers: ["speed_pace_hotspot"],
      }),
    );
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "route_peer_residuals_v1",
        status: "missing",
        artifactPath: "route-peer-residuals.json",
        detectorConsumers: ["degradation_trend", "multi_month_speed_peer", "positive_deviance"],
      }),
    );
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "intervention_scope_fit_v1",
        status: "available",
        artifactPath: "intervention-scope-fit.json",
        panelId: "intervention_scope_fit_panel_v1",
        modeledReleaseRowCount: 4,
        segmentCount: 3,
        medianResidualMph: null,
        detectorConsumers: ["treatment_scope_gap", "treatment_scope_mismatch"],
      }),
    );
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "source_gap_model_v1",
        status: "available",
        artifactPath: "source-gap-model.json",
        panelId: "source_gap_panel_v1",
        modeledReleaseRowCount: 2,
        routeCount: 2,
        segmentCount: 0,
        medianResidualMph: null,
        detectorConsumers: ["intervention_gap", "source_gap"],
      }),
    );
    expect(artifact.modelArtifacts).toContainEqual(
      expect.objectContaining({
        modelId: "treatment_event_panel_v1",
        status: "missing",
        artifactPath: "treatment-event-panel.json",
        detectorConsumers: ["intervention_event_study"],
      }),
    );
  });

  test("blocks model-backed detectors when reviewed primary positives do not survive", () => {
    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      generatedAt: "2026-06-01T00:00:00.000Z",
      runId: "loss-gate-test",
      inputArtifacts: {
        reviewDecisions: "review-decisions.json",
        promotedFindings: "promoted-findings.json",
        reviewPackets: "review-packets.json",
        reviewPacketCoverage: "review-packet-coverage.json",
        reviewQueue: "review-queue.json",
        promotionQueue: "promotion-queue.json",
        goldSetEvaluation: "gold-set-evaluation.json",
        readiness: "readiness.json",
        detectorCoverageAudit: "detector-coverage-audit.json",
        ewtScoreVectors: "ewt-route-month-score-vectors.json",
        speedPaceScoreVectors: "speed-pace-score-vectors.json",
        runtimeTrendScoreVectors: "runtime-trend-score-vectors.json",
        detectorScoreVectors: "detector-score-vectors.json",
        evaluationLabels: "detector-evaluation-labels.json",
        grainAudit: "grain-audit.json",
        segmentSpeedResiduals: "segment-speed-residuals.json",
        segmentDaypartResiduals: "segment-daypart-residuals.json",
        routePeerResiduals: "route-peer-residuals.json",
        reliabilityExposurePanel: "reliability-exposure-panel.json",
        interventionScopeFit: "intervention-scope-fit.json",
        sourceGapModel: "source-gap-model.json",
        treatmentEventPanel: "treatment-event-panel.json",
        pulseFingerprint: "pulse-fingerprint.json",
        decouplingQuadrants: "decoupling-quadrants.json",
      },
      reviewDecisions: {
        decisions: [
          {
            candidateId: "c1",
            detectorId: "treatment_scope_mismatch",
            routeId: "B1",
            decision: "approve_with_revisions",
          },
        ],
      },
      promotedFindings: { findings: [] },
      reviewPackets: null,
      reviewPacketCoverage: null,
      reviewQueue: null,
      promotionQueue: null,
      goldSetEvaluation: null,
      readiness: {
        detectors: [{ detectorId: "treatment_scope_mismatch", status: "ready" }],
      },
      detectorCoverageAudit: null,
      ewtScoreVectors: null,
      speedPaceScoreVectors: null,
      runtimeTrendScoreVectors: null,
      detectorScoreVectors: null,
      evaluationLabels: null,
      grainAudit: null,
      segmentSpeedResiduals: null,
      segmentDaypartResiduals: null,
      routePeerResiduals: null,
      reliabilityExposurePanel: null,
      interventionScopeFit: null,
      sourceGapModel: null,
      treatmentEventPanel: null,
      pulseFingerprint: null,
      decouplingQuadrants: null,
    });

    const mismatch = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "treatment_scope_mismatch",
    );
    expect(
      mismatch?.hardGates.find((gate) => gate.gateId === "model_backed_evaluation_loss"),
    ).toMatchObject({
      passed: false,
      multiplier: 0,
    });
    expect(artifact.summary.modelBackedEvaluationLossBlockedDetectorCount).toBe(1);
  });
});

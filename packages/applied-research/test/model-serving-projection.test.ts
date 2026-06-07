import { describe, expect, test } from "bun:test";
import {
  modelArtifactServingProjectionPath,
  modelArtifactServingProjectionStudioPath,
} from "../src/artifacts";
import {
  buildModelArtifactServingProjection,
  type DetectorEvaluationArtifact,
} from "../src/evaluation";

describe("model artifact serving projection", () => {
  test("projects detector-evaluation model summaries without raw model rows", () => {
    const evaluation = {
      artifactKind: "detector_evaluation_harness",
      schemaVersion: 1,
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
      runId: "test-run",
      detectorVersions: [],
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
        ewtScoreVectors: "ewt-score-vectors.json",
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
      evaluationSets: {
        confirmedPositiveCount: 0,
        confirmedNegativeCount: 0,
        nearMissCount: 0,
        missingDataScopeCount: 0,
        holdoutStatus: "holdout_unavailable",
      },
      summary: {
        detectorCount: 1,
        scorecardCount: 1,
        positiveOnlyGoldSet: false,
        insufficientLabelDetectorCount: 0,
        qualityScoredDetectorCount: 1,
        qualityUnratedDetectorCount: 0,
        qualityOverclaimedDetectorCount: 0,
        hardGateBlockedDetectorCount: 0,
        modelBackedEvaluationLossBlockedDetectorCount: 0,
        grainPolicyWarningDetectorCount: 0,
        cleanNoHitGrainReviewRequiredDetectorCount: 0,
        falseNegativeShadowAuditUnavailableDetectorCount: 0,
        portfolioPreGateScore: null,
        portfolioGatedScore: null,
      },
      existingGoldSetSummary: null,
      falsePositiveRegister: [],
      claimsDiscipline: {
        checkedCandidateCount: 0,
        violationCount: 0,
        violationsByDetector: {},
      },
      noveltySummary: {
        candidateCount: 0,
        uniqueScopeCount: 0,
        duplicateScopeCount: 0,
      },
      qualityLab: {
        reviewedDecisionCount: 0,
        reviewerApprovedDecisionCount: 0,
        reviewerApprovalShare: null,
        promotedFindingCount: 0,
        primaryFindingYield: null,
        falsePositiveRootCount: 0,
        falsePositiveRootKindCount: 0,
        modelBackedDetectorCount: 0,
        modelBackedEvaluationLossBlockedDetectorCount: 0,
        scoreVectorAvailableDetectorCount: 0,
        scoreVectorUnavailableDetectorCount: 0,
        thresholdAndRankStabilityStatus: "missing",
        rankStabilityCheckedDetectorCount: 0,
        rankStabilityFragileDetectorCount: 0,
        maxTopTenShare: null,
        maxThresholdSensitivityShare: null,
      },
      packetCoverage: [],
      modelArtifacts: [
        {
          modelId: "segment_speed_residuals_v1",
          status: "available",
          artifactPath: "internal/raw-model.json",
          panelId: "segment_month_panel_v1",
          releaseMonth: "2026-03",
          panelRowCount: 100,
          modeledReleaseRowCount: 10,
          routeCount: 2,
          segmentCount: 10,
          medianResidualMph: -0.2,
          detectorConsumers: ["treatment_scope_mismatch"],
          limitations: ["fixture limitation"],
        },
        {
          modelId: "pulse_fingerprint_v1",
          status: "available",
          artifactPath: "internal/pulse-fingerprint.json",
          panelId: "route_hour_of_week_pulse_panel_v1",
          releaseMonth: "2026-03",
          panelRowCount: 699,
          modeledReleaseRowCount: 404,
          routeCount: 353,
          segmentCount: 0,
          medianResidualMph: null,
          detectorConsumers: [],
          limitations: ["internal lab only"],
        },
      ],
      detectorScorecards: [],
      residualRisks: [],
    } satisfies DetectorEvaluationArtifact;

    const projection = buildModelArtifactServingProjection({
      evaluation,
      sourceEvaluationPath: "detector-evaluation.json",
    });

    expect(projection.summary).toEqual({
      modelCount: 2,
      availableModelCount: 2,
      missingModelCount: 0,
      detectorConsumerCount: 1,
    });
    expect(projection.models[0]).toEqual({
      modelId: "segment_speed_residuals_v1",
      status: "available",
      panelId: "segment_month_panel_v1",
      releaseMonth: "2026-03",
      modeledReleaseRowCount: 10,
      routeCount: 2,
      segmentCount: 10,
      detectorConsumers: ["treatment_scope_mismatch"],
      limitations: ["fixture limitation"],
    });
    expect(JSON.stringify(projection)).not.toContain("internal/raw-model.json");
    expect(JSON.stringify(projection)).not.toContain("internal/pulse-fingerprint.json");
    expect(JSON.stringify(projection)).not.toContain("medianResidualMph");
    expect(projection.models[1]).toMatchObject({
      modelId: "pulse_fingerprint_v1",
      detectorConsumers: [],
      modeledReleaseRowCount: 404,
    });
  });

  test("owns the model artifact serving projection path", () => {
    expect(
      modelArtifactServingProjectionPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/model-artifact-serving-projection/2023-04_to_2026-03/2026-03/model-artifacts.json",
    );
    expect(modelArtifactServingProjectionStudioPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/studio/v2/detectors/model-artifacts.json",
    );
  });
});

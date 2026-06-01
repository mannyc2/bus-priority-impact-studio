import { describe, expect, test } from "bun:test";
import {
  detectorEvaluationMarkdownReport,
  type DetectorEvaluationArtifact,
} from "@bp/applied-research/evaluation";

describe("detector evaluation artifacts", () => {
  test("renders a deterministic markdown summary for review", () => {
    const artifact = {
      artifactKind: "detector_evaluation_harness",
      schemaVersion: 1,
      generatedAt: "2026-06-01T00:00:00.000Z",
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
        grainAudit: "detector-corpus-grain.json",
      },
      evaluationSets: {
        confirmedPositiveCount: 3,
        confirmedNegativeCount: 7,
        nearMissCount: 2,
        missingDataScopeCount: 11,
        holdoutStatus: "holdout_available",
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
        grainPolicyWarningDetectorCount: 1,
        cleanNoHitGrainReviewRequiredDetectorCount: 1,
        falseNegativeShadowAuditUnavailableDetectorCount: 0,
        portfolioPreGateScore: 812.3,
        portfolioGatedScore: 700,
      },
      existingGoldSetSummary: null,
      falsePositiveRegister: [],
      claimsDiscipline: {
        checkedCandidateCount: 1,
        violationCount: 0,
        violationsByDetector: {},
      },
      noveltySummary: {
        candidateCount: 1,
        uniqueScopeCount: 1,
        duplicateScopeCount: 0,
      },
      packetCoverage: [
        {
          detectorId: "observed_reliability",
          detectorName: "Observed reliability",
          packetCount: 1,
          candidateCount: 1,
          status: "available",
        },
      ],
      detectorScorecards: [
        {
          detectorId: "observed_reliability",
          detectorVersion: "1.0.0",
          detectorName: "Observed reliability",
          claimTier: "descriptive",
          components: [],
          hardGates: [],
          flags: ["grain_policy_warning"],
          preGateScore: 812.3,
          hardGateMultiplier: 0.862,
          gatedScore: 700,
          recommendation: "watch",
        },
      ],
      residualRisks: ["Derived negatives are not manually reviewed."],
    } satisfies DetectorEvaluationArtifact;

    expect(detectorEvaluationMarkdownReport(artifact)).toContain(
      "| observed_reliability | 812.3 | 700 | watch | grain_policy_warning |",
    );
    expect(detectorEvaluationMarkdownReport(artifact)).toContain(
      "- Confirmed positives / negatives: 3 / 7",
    );
  });
});

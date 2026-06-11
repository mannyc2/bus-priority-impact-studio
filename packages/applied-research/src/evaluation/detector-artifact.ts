import type { DetectorEvaluationScorecard } from "@bp/analytics/evaluation";

export type DetectorEvaluationInputArtifacts = {
  readonly reviewDecisions: string;
  readonly promotedFindings: string;
  readonly reviewPackets: string;
  readonly reviewPacketCoverage: string;
  readonly reviewQueue: string;
  readonly promotionQueue: string;
  readonly goldSetEvaluation: string;
  readonly readiness: string;
  readonly detectorCoverageAudit: string;
  readonly ewtScoreVectors: string;
  readonly speedPaceScoreVectors: string;
  readonly runtimeTrendScoreVectors: string;
  readonly detectorScoreVectors: string;
  readonly evaluationLabels: string;
  readonly grainAudit: string;
  readonly segmentSpeedResiduals: string;
  readonly segmentDaypartResiduals: string;
  readonly routePeerResiduals: string;
  readonly reliabilityExposurePanel: string;
  readonly interventionScopeFit: string;
  readonly sourceGapModel: string;
  readonly treatmentEventPanel: string;
  readonly pulseFingerprint: string;
  readonly decouplingQuadrants: string;
};

export type DetectorEvaluationPacketCoverageStatus =
  | "available"
  | "partial"
  | "missing_no_candidates"
  | "missing_packets_for_candidates";

export type DetectorEvaluationArtifact = {
  readonly artifactKind: "detector_evaluation_harness";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly runId: string;
  readonly detectorVersions: Array<{
    readonly detectorId: string;
    readonly detectorVersion: string;
    readonly detectorName: string;
    readonly claimTier: string;
    readonly requiredDataProducts: readonly string[];
    readonly modelArtifacts: readonly string[];
  }>;
  readonly inputArtifacts: DetectorEvaluationInputArtifacts;
  readonly evaluationSets: {
    readonly confirmedPositiveCount: number;
    readonly confirmedNegativeCount: number;
    readonly nearMissCount: number;
    readonly missingDataScopeCount: number;
    readonly holdoutStatus: "holdout_unavailable" | "holdout_available";
  };
  readonly summary: {
    readonly detectorCount: number;
    readonly scorecardCount: number;
    readonly positiveOnlyGoldSet: boolean;
    readonly insufficientLabelDetectorCount: number;
    readonly qualityScoredDetectorCount: number;
    readonly qualityUnratedDetectorCount: number;
    readonly qualityOverclaimedDetectorCount: number;
    readonly hardGateBlockedDetectorCount: number;
    readonly modelBackedEvaluationLossBlockedDetectorCount: number;
    readonly grainPolicyWarningDetectorCount: number;
    readonly cleanNoHitGrainReviewRequiredDetectorCount: number;
    readonly falseNegativeShadowAuditUnavailableDetectorCount: number;
    readonly portfolioPreGateScore: number | null;
    readonly portfolioGatedScore: number | null;
  };
  readonly existingGoldSetSummary: Record<string, unknown> | null;
  readonly falsePositiveRegister: Array<{
    readonly detectorId: string;
    readonly rootCause: string;
    readonly count: number;
  }>;
  readonly claimsDiscipline: {
    readonly checkedCandidateCount: number;
    readonly violationCount: number;
    readonly violationsByDetector: Record<string, number>;
  };
  readonly noveltySummary: {
    readonly candidateCount: number;
    readonly uniqueScopeCount: number;
    readonly duplicateScopeCount: number;
  };
  readonly qualityLab: {
    readonly reviewedDecisionCount: number;
    readonly reviewerApprovedDecisionCount: number;
    readonly reviewerApprovalShare: number | null;
    readonly promotedFindingCount: number;
    readonly primaryFindingYield: number | null;
    readonly falsePositiveRootCount: number;
    readonly falsePositiveRootKindCount: number;
    readonly modelBackedDetectorCount: number;
    readonly modelBackedEvaluationLossBlockedDetectorCount: number;
    readonly scoreVectorAvailableDetectorCount: number;
    readonly scoreVectorUnavailableDetectorCount: number;
    readonly thresholdAndRankStabilityStatus: "available" | "partial" | "missing";
    readonly rankStabilityCheckedDetectorCount: number;
    readonly rankStabilityFragileDetectorCount: number;
    readonly maxTopTenShare: number | null;
    readonly maxThresholdSensitivityShare: number | null;
  };
  readonly packetCoverage: Array<{
    readonly detectorId: string;
    readonly detectorName: string;
    readonly packetCount: number;
    readonly candidateCount: number;
    readonly status: DetectorEvaluationPacketCoverageStatus;
  }>;
  readonly modelArtifacts: Array<{
    readonly modelId: string;
    readonly status: "available" | "missing";
    readonly artifactPath: string;
    readonly panelId: string | null;
    readonly releaseMonth: string | null;
    readonly panelRowCount: number;
    readonly modeledReleaseRowCount: number;
    readonly routeCount: number;
    readonly segmentCount: number;
    readonly medianResidualMph: number | null;
    readonly detectorConsumers: readonly string[];
    readonly limitations: readonly string[];
  }>;
  readonly detectorScorecards: DetectorEvaluationScorecard[];
  readonly residualRisks: string[];
};

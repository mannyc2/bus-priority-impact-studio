import {
  evaluateGoldSet,
  type GoldSetEvaluation,
  type GoldSetExpectation,
} from "@bp/analytics/calibration";
import {
  buildDetectorEvaluationScorecard,
  componentScore,
  type DetectorEvaluationFlag,
  type DetectorEvaluationHardGate,
  type DetectorEvaluationScorecard,
  detectorReadinessHardGate,
  goldSetEvaluationFlags,
  negativeOrNearMissHardGate,
  scoreFromShare,
} from "@bp/analytics/evaluation";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import type { DetectorEvaluationArtifact } from "./detector-artifact";
import type {
  DecouplingQuadrantsArtifactV1,
  InterventionScopeFitArtifactV1,
  PulseFingerprintArtifactV1,
  ReliabilityExposurePanelArtifactV1,
  RoutePeerResidualArtifactV1,
  SegmentDaypartResidualArtifactV1,
  SegmentSpeedResidualArtifactV1,
  SourceGapModelArtifactV1,
  TreatmentEventPanelArtifactV1,
} from "../feature-resolvers";
import type {
  RuntimeTrendScoreVectorArtifact,
  SpeedPaceScoreVectorArtifact,
} from "../score-vectors";

export type ReviewDecision = {
  candidateId?: unknown;
  detectorId?: unknown;
  routeId?: unknown;
  decision?: unknown;
  falsePositiveRootCause?: unknown;
  claimDisciplineIssue?: unknown;
};

export type ReviewDecisionArtifact = {
  decisions?: ReviewDecision[];
};

export type PromotedFinding = {
  sourceCandidateId?: unknown;
  detectorId?: unknown;
  routeId?: unknown;
  scopeId?: unknown;
};

export type PromotedFindingsArtifact = {
  findings?: PromotedFinding[];
};

export type ReviewPacketArtifact = {
  packets?: unknown[];
  reviewPackets?: unknown[];
};

export type CandidateFields = {
  candidateId?: unknown;
  detectorId?: unknown;
  routeId?: unknown;
  scopeId?: unknown;
  detectorScore?: unknown;
  reasonCode?: unknown;
  claimText?: unknown;
  claimSafeLabel?: unknown;
};

export type QueueCandidate = CandidateFields & {
  candidate?: CandidateFields;
  readiness?: unknown;
  recommendedNextAction?: unknown;
  promotionBlockers?: unknown;
  evidenceSummary?: unknown;
};

export type CandidateQueueArtifact = {
  candidates?: QueueCandidate[];
};

export type ReviewPacketCoverageArtifact = {
  detectors?: Array<{
    detectorId?: unknown;
    candidateCount?: unknown;
    packetCount?: unknown;
    missingPacketCount?: unknown;
    packetsWithoutPrimaryEvidence?: unknown;
    packetsWithoutCounterEvidence?: unknown;
    packetsWithoutCoverage?: unknown;
    status?: unknown;
  }>;
};

export type PacketCompleteness = {
  hasPrimaryEvidence?: unknown;
  hasCounterEvidence?: unknown;
  hasCoverageAudit?: unknown;
  hasDetectorSpec?: unknown;
  hasReviewChecklist?: unknown;
};

export type ReviewPacket = {
  packetId?: unknown;
  candidate?: CandidateFields;
  evidence?: {
    primary?: unknown[];
    context?: unknown[];
    counterEvidence?: unknown[];
    caveats?: unknown[];
    missingData?: unknown[];
    coverageAudit?: unknown[];
  };
  coverage?: unknown[];
  promotionBlockers?: unknown[];
  allowedClaimStrength?: unknown;
  packetCompleteness?: PacketCompleteness;
};

export type DetectorCoverageAuditArtifact = {
  detectors?: Array<{
    detectorId?: unknown;
    candidateCount?: unknown;
    coverageCount?: unknown;
    outcomeCounts?: Record<string, unknown>;
    reasonCounts?: Record<string, unknown>;
    candidateReasonCounts?: Record<string, unknown>;
  }>;
};

export type EwtScoreVectorArtifact = {
  detectorId?: unknown;
  summary?: {
    usableMonthCount?: unknown;
    baselineMonthCount?: unknown;
    routeCount?: unknown;
    releaseUsableRouteCount?: unknown;
    releaseFlaggedRouteCount?: unknown;
    excludedRowCount?: unknown;
  };
  scoreVectors?: {
    releaseMonth?: unknown[];
    historicalWindow?: unknown[];
  };
};

export type DetectorEvaluationLabelInputArtifact = {
  labels?: Array<{
    labelId?: unknown;
    detectorId?: unknown;
    month?: unknown;
    scopeKind?: unknown;
    scopeId?: unknown;
    label?: unknown;
    set?: unknown;
  }>;
  missingDataScopes?: Array<{
    scopeId?: unknown;
    detectorId?: unknown;
    month?: unknown;
    scopeKind?: unknown;
    sourceOutcome?: unknown;
  }>;
  summary?: {
    confirmedNegativeCount?: unknown;
    holdoutNegativeCount?: unknown;
    missingDataScopeCount?: unknown;
  };
};

export type GenericDetectorScoreVectorArtifact = {
  detectors?: Array<{
    detectorId?: unknown;
    summary?: {
      scopeCount?: unknown;
      flaggedCount?: unknown;
      cleanNoHitCount?: unknown;
      skippedCount?: unknown;
      monthCount?: unknown;
      flaggedShare?: unknown;
    };
    entries?: unknown[];
  }>;
};

type RankStabilitySummary = {
  checkedDetectorCount: number;
  fragileDetectorCount: number;
  maxTopTenShare: number | null;
  maxThresholdSensitivityShare: number | null;
};

export type DetectorGrainAuditStatus = "pass" | "warn" | "block" | "not_applicable" | "unknown";

export type DetectorGrainAuditRow = {
  detectorId?: unknown;
  releaseChecks?: {
    routeMonthPolicy?: {
      status?: unknown;
      classification?: unknown;
      rationale?: unknown;
    };
    cleanNoHitGrain?: {
      status?: unknown;
      reason?: unknown;
    };
    scoreVectorExpectation?: {
      status?: unknown;
      reason?: unknown;
    };
    falseNegativeShadowAudit?: {
      required?: unknown;
      status?: unknown;
      reason?: unknown;
    };
    releaseGate?: {
      status?: unknown;
      reason?: unknown;
    };
  };
};

export type DetectorGrainAuditArtifact = {
  detectors?: DetectorGrainAuditRow[];
  summary?: {
    grainPolicyWarningDetectorCount?: unknown;
    releaseGateWarnDetectorCount?: unknown;
    releaseGateBlockDetectorCount?: unknown;
    falseNegativeShadowAuditRequiredDetectorCount?: unknown;
  };
};

type DetectorGrainAuditSummary = {
  routeMonthPolicyStatus: DetectorGrainAuditStatus;
  routeMonthPolicyClassification: string | null;
  cleanNoHitGrainStatus: DetectorGrainAuditStatus;
  scoreVectorExpectationStatus: DetectorGrainAuditStatus;
  falseNegativeShadowAuditRequired: boolean;
  falseNegativeShadowAuditStatus: DetectorGrainAuditStatus;
  releaseGateStatus: DetectorGrainAuditStatus;
  releaseGateReason: string | null;
};

export type GoldSetEvaluationArtifact = {
  summary?: Partial<GoldSetEvaluation> & {
    expectationCount?: unknown;
    flaggedScopeCount?: unknown;
    precision?: unknown;
    recall?: unknown;
  };
};

export type ReadinessArtifact = {
  detectors?: Array<{
    detectorId?: unknown;
    status?: unknown;
  }>;
};

type LabeledExpectation = GoldSetExpectation & {
  detectorId: string;
  candidateId: string;
  decision: string;
};

type DetectorConfusion = GoldSetEvaluation & {
  expectationCount: number;
  flaggedScopeCount: number;
  confirmedPositiveCount: number;
  confirmedNegativeCount: number;
};

type DetectorEvidenceSummary = {
  packetCount: number;
  missingPrimaryEvidenceCount: number;
  missingCounterEvidenceCount: number;
  missingCoverageAuditCount: number;
  missingDetectorSpecCount: number;
  missingReviewChecklistCount: number;
  missingDataEvidenceCount: number;
  promotionBlockerCount: number;
  averageCompletenessScore: number | null;
};

type DetectorQueueSummary = {
  candidateCount: number;
  promotedCandidateCount: number;
  nearMissCount: number;
  uniqueScopeCount: number;
  duplicateScopeCount: number;
  readyForReviewCount: number;
  blockedCount: number;
  needsEnrichmentCount: number;
};

type DetectorCoverageSummary = {
  coverageCount: number;
  hitCount: number;
  cleanNoHitCount: number;
  skippedMissingInputCount: number;
  explicitMissingDataCount: number;
};

type DetectorClaimSummary = {
  checkedCandidateCount: number;
  violationCount: number;
};

type DetectorAuxiliaryInputs = {
  evidence: DetectorEvidenceSummary | null;
  queue: DetectorQueueSummary;
  coverage: DetectorCoverageSummary | null;
  claims: DetectorClaimSummary;
  ewtScoreVectors: EwtScoreVectorArtifact | null;
  speedPaceScoreVectors: SpeedPaceScoreVectorArtifact | null;
  runtimeTrendScoreVectors: RuntimeTrendScoreVectorArtifact | null;
  detectorScoreVectors: GenericDetectorScoreVectorArtifact | null;
  grainAudit: DetectorGrainAuditSummary | null;
  holdoutAvailable: boolean;
};

export type BuildDetectorEvaluationArtifactInput = {
  releaseMonth: string;
  historyStartMonth: string;
  generatedAt: string;
  runId: string;
  inputArtifacts: DetectorEvaluationArtifact["inputArtifacts"];
  reviewDecisions: ReviewDecisionArtifact;
  promotedFindings: PromotedFindingsArtifact;
  reviewPackets: ReviewPacketArtifact | null;
  reviewPacketCoverage: ReviewPacketCoverageArtifact | null;
  reviewQueue: CandidateQueueArtifact | null;
  promotionQueue: CandidateQueueArtifact | null;
  goldSetEvaluation: GoldSetEvaluationArtifact | null;
  readiness: ReadinessArtifact | null;
  detectorCoverageAudit: DetectorCoverageAuditArtifact | null;
  ewtScoreVectors: EwtScoreVectorArtifact | null;
  speedPaceScoreVectors: SpeedPaceScoreVectorArtifact | null;
  runtimeTrendScoreVectors: RuntimeTrendScoreVectorArtifact | null;
  detectorScoreVectors: GenericDetectorScoreVectorArtifact | null;
  evaluationLabels: DetectorEvaluationLabelInputArtifact | null;
  grainAudit: DetectorGrainAuditArtifact | null;
  segmentSpeedResiduals: SegmentSpeedResidualArtifactV1 | null;
  segmentDaypartResiduals: SegmentDaypartResidualArtifactV1 | null;
  routePeerResiduals: RoutePeerResidualArtifactV1 | null;
  reliabilityExposurePanel: ReliabilityExposurePanelArtifactV1 | null;
  interventionScopeFit: InterventionScopeFitArtifactV1 | null;
  sourceGapModel: SourceGapModelArtifactV1 | null;
  treatmentEventPanel: TreatmentEventPanelArtifactV1 | null;
  pulseFingerprint: PulseFingerprintArtifactV1 | null;
  decouplingQuadrants: DecouplingQuadrantsArtifactV1 | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function arrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function modelArtifactDiagnostics(input: {
  readonly inputArtifacts: DetectorEvaluationArtifact["inputArtifacts"];
  readonly segmentSpeedResiduals: SegmentSpeedResidualArtifactV1 | null;
  readonly segmentDaypartResiduals: SegmentDaypartResidualArtifactV1 | null;
  readonly routePeerResiduals: RoutePeerResidualArtifactV1 | null;
  readonly reliabilityExposurePanel: ReliabilityExposurePanelArtifactV1 | null;
  readonly interventionScopeFit: InterventionScopeFitArtifactV1 | null;
  readonly sourceGapModel: SourceGapModelArtifactV1 | null;
  readonly treatmentEventPanel: TreatmentEventPanelArtifactV1 | null;
  readonly pulseFingerprint: PulseFingerprintArtifactV1 | null;
  readonly decouplingQuadrants: DecouplingQuadrantsArtifactV1 | null;
}): DetectorEvaluationArtifact["modelArtifacts"] {
  const diagnostics: DetectorEvaluationArtifact["modelArtifacts"] = [];
  const detectorConsumersByModel = new Map<string, string[]>();
  for (const detector of listAnalyticsDetectors()) {
    for (const modelId of detector.modelArtifacts ?? []) {
      const consumers = detectorConsumersByModel.get(modelId) ?? [];
      consumers.push(detector.detectorId);
      detectorConsumersByModel.set(modelId, consumers);
    }
  }
  const consumersFor = (modelId: string): string[] =>
    (detectorConsumersByModel.get(modelId) ?? []).sort((left, right) => left.localeCompare(right));
  const segmentSpeedResiduals = input.segmentSpeedResiduals;
  if (segmentSpeedResiduals === null) {
    diagnostics.push({
      modelId: "segment_speed_residuals_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.segmentSpeedResiduals,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("segment_speed_residuals_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: segmentSpeedResiduals.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.segmentSpeedResiduals,
      panelId: segmentSpeedResiduals.panelManifest.panelId,
      releaseMonth: segmentSpeedResiduals.releaseMonth,
      panelRowCount: segmentSpeedResiduals.summary.panelRowCount,
      modeledReleaseRowCount: segmentSpeedResiduals.summary.modeledReleaseRowCount,
      routeCount: segmentSpeedResiduals.summary.routeCount,
      segmentCount: segmentSpeedResiduals.summary.segmentCount,
      medianResidualMph: segmentSpeedResiduals.summary.releaseMonthResidualMedianMph,
      detectorConsumers: consumersFor(segmentSpeedResiduals.artifactKind),
      limitations: segmentSpeedResiduals.panelManifest.limitations,
    });
  }

  const segmentDaypartResiduals = input.segmentDaypartResiduals;
  if (segmentDaypartResiduals === null) {
    diagnostics.push({
      modelId: "segment_daypart_residuals_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.segmentDaypartResiduals,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("segment_daypart_residuals_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: segmentDaypartResiduals.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.segmentDaypartResiduals,
      panelId: segmentDaypartResiduals.panelManifest.panelId,
      releaseMonth: segmentDaypartResiduals.releaseMonth,
      panelRowCount: segmentDaypartResiduals.summary.panelRowCount,
      modeledReleaseRowCount: segmentDaypartResiduals.summary.modeledReleaseRowCount,
      routeCount: segmentDaypartResiduals.summary.routeCount,
      segmentCount: segmentDaypartResiduals.summary.segmentCount,
      medianResidualMph: segmentDaypartResiduals.summary.releaseMonthResidualMedianMph,
      detectorConsumers: consumersFor(segmentDaypartResiduals.artifactKind),
      limitations: segmentDaypartResiduals.panelManifest.limitations,
    });
  }

  const routePeerResiduals = input.routePeerResiduals;
  if (routePeerResiduals === null) {
    diagnostics.push({
      modelId: "route_peer_residuals_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.routePeerResiduals,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("route_peer_residuals_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: routePeerResiduals.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.routePeerResiduals,
      panelId: routePeerResiduals.panelManifest.panelId,
      releaseMonth: routePeerResiduals.releaseMonth,
      panelRowCount: routePeerResiduals.summary.panelRowCount,
      modeledReleaseRowCount: routePeerResiduals.summary.modeledReleaseRowCount,
      routeCount: routePeerResiduals.summary.routeCount,
      segmentCount: 0,
      medianResidualMph: routePeerResiduals.summary.releaseMonthResidualMedianMph,
      detectorConsumers: consumersFor(routePeerResiduals.artifactKind),
      limitations: routePeerResiduals.panelManifest.limitations,
    });
  }

  const reliabilityExposurePanel = input.reliabilityExposurePanel;
  if (reliabilityExposurePanel === null) {
    diagnostics.push({
      modelId: "reliability_exposure_panel_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.reliabilityExposurePanel,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("reliability_exposure_panel_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: reliabilityExposurePanel.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.reliabilityExposurePanel,
      panelId: reliabilityExposurePanel.panelManifest.panelId,
      releaseMonth: reliabilityExposurePanel.releaseMonth,
      panelRowCount: reliabilityExposurePanel.summary.panelRowCount,
      modeledReleaseRowCount: reliabilityExposurePanel.summary.supportedRowCount,
      routeCount: reliabilityExposurePanel.summary.routeCount,
      segmentCount: reliabilityExposurePanel.summary.stopCount,
      medianResidualMph: null,
      detectorConsumers: consumersFor(reliabilityExposurePanel.artifactKind),
      limitations: reliabilityExposurePanel.panelManifest.limitations,
    });
  }

  const interventionScopeFit = input.interventionScopeFit;
  if (interventionScopeFit === null) {
    diagnostics.push({
      modelId: "intervention_scope_fit_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.interventionScopeFit,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("intervention_scope_fit_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: interventionScopeFit.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.interventionScopeFit,
      panelId: interventionScopeFit.panelManifest.panelId,
      releaseMonth: interventionScopeFit.month,
      panelRowCount: interventionScopeFit.summary.rowCount,
      modeledReleaseRowCount: interventionScopeFit.summary.rowCount,
      routeCount: interventionScopeFit.summary.routeCount,
      segmentCount: interventionScopeFit.summary.segmentRowCount,
      medianResidualMph: null,
      detectorConsumers: consumersFor(interventionScopeFit.artifactKind),
      limitations: interventionScopeFit.panelManifest.limitations,
    });
  }

  const sourceGapModel = input.sourceGapModel;
  if (sourceGapModel === null) {
    diagnostics.push({
      modelId: "source_gap_model_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.sourceGapModel,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("source_gap_model_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: sourceGapModel.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.sourceGapModel,
      panelId: sourceGapModel.panelManifest.panelId,
      releaseMonth: sourceGapModel.month,
      panelRowCount: sourceGapModel.summary.rowCount,
      modeledReleaseRowCount: sourceGapModel.summary.rowCount,
      routeCount: sourceGapModel.summary.routeCount,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor(sourceGapModel.artifactKind),
      limitations: sourceGapModel.panelManifest.limitations,
    });
  }

  const treatmentEventPanel = input.treatmentEventPanel;
  if (treatmentEventPanel === null) {
    diagnostics.push({
      modelId: "treatment_event_panel_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.treatmentEventPanel,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("treatment_event_panel_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: treatmentEventPanel.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.treatmentEventPanel,
      panelId: treatmentEventPanel.panelManifest.panelId,
      releaseMonth: treatmentEventPanel.releaseMonth,
      panelRowCount: treatmentEventPanel.summary.panelRowCount,
      modeledReleaseRowCount: treatmentEventPanel.summary.supportedRowCount,
      routeCount: treatmentEventPanel.summary.routeCount,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor(treatmentEventPanel.artifactKind),
      limitations: treatmentEventPanel.panelManifest.limitations,
    });
  }

  const pulseFingerprint = input.pulseFingerprint;
  if (pulseFingerprint === null) {
    diagnostics.push({
      modelId: "pulse_fingerprint_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.pulseFingerprint,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("pulse_fingerprint_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: pulseFingerprint.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.pulseFingerprint,
      panelId: pulseFingerprint.panelManifest.panelId,
      releaseMonth: pulseFingerprint.releaseMonth,
      panelRowCount: pulseFingerprint.summary.panelRowCount,
      modeledReleaseRowCount: pulseFingerprint.summary.supportedPulseRowCount,
      routeCount: pulseFingerprint.summary.routeCount,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor(pulseFingerprint.artifactKind),
      limitations: pulseFingerprint.panelManifest.limitations,
    });
  }

  const decouplingQuadrants = input.decouplingQuadrants;
  if (decouplingQuadrants === null) {
    diagnostics.push({
      modelId: "decoupling_quadrants_v1",
      status: "missing",
      artifactPath: input.inputArtifacts.decouplingQuadrants,
      panelId: null,
      releaseMonth: null,
      panelRowCount: 0,
      modeledReleaseRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor("decoupling_quadrants_v1"),
      limitations: ["Model artifact was unavailable to the detector evaluation builder."],
    });
  } else {
    diagnostics.push({
      modelId: decouplingQuadrants.artifactKind,
      status: "available",
      artifactPath: input.inputArtifacts.decouplingQuadrants,
      panelId: decouplingQuadrants.panelManifest.panelId,
      releaseMonth: decouplingQuadrants.releaseMonth,
      panelRowCount: decouplingQuadrants.summary.panelRowCount,
      modeledReleaseRowCount:
        decouplingQuadrants.summary.supportedSpeedRidershipRowCount,
      routeCount: decouplingQuadrants.summary.routeCount,
      segmentCount: 0,
      medianResidualMph: null,
      detectorConsumers: consumersFor(decouplingQuadrants.artifactKind),
      limitations: decouplingQuadrants.panelManifest.limitations,
    });
  }

  return diagnostics;
}

function reviewPacketCoverageStatus(
  value: unknown,
): DetectorEvaluationArtifact["packetCoverage"][number]["status"] | null {
  const status = text(value);
  if (status === "complete") return "available";
  if (status === "partial") return "partial";
  if (status === "missing") return "missing_packets_for_candidates";
  if (status === "no_candidates") return "missing_no_candidates";
  return null;
}

function scopeId(input: {
  detectorId: string;
  routeId: string | null;
  candidateId: string;
}): string {
  return [input.detectorId, input.routeId ?? "system", input.candidateId].join(":");
}

function shouldFlag(decision: string): boolean {
  return (
    decision === "approve" ||
    decision === "approved" ||
    decision === "approve_with_revisions" ||
    decision === "approved_with_revisions"
  );
}

function scopeLabels(input: {
  reviewDecisions: ReviewDecisionArtifact;
  promotedFindings: PromotedFindingsArtifact;
  evaluationLabels: DetectorEvaluationLabelInputArtifact | null;
}): {
  expectations: LabeledExpectation[];
  flaggedScopesByDetectorId: Map<string, Set<string>>;
} {
  const expectations: LabeledExpectation[] = [];
  const candidateScopeById = new Map<string, string>();
  const candidateDetectorById = new Map<string, string>();

  for (const decision of input.reviewDecisions.decisions ?? []) {
    const candidateId = text(decision.candidateId);
    const detectorId = text(decision.detectorId);
    if (candidateId === null || detectorId === null) continue;
    const decisionText = text(decision.decision) ?? "";
    const id = scopeId({
      detectorId,
      routeId: text(decision.routeId),
      candidateId,
    });
    candidateScopeById.set(candidateId, id);
    candidateDetectorById.set(candidateId, detectorId);
    expectations.push({
      detectorId,
      candidateId,
      decision: decisionText,
      scopeId: id,
      shouldFlag: shouldFlag(decisionText),
    });
  }

  for (const label of input.evaluationLabels?.labels ?? []) {
    if (text(label.label) !== "confirmed_negative") continue;
    const detectorId = text(label.detectorId);
    const labelScopeId = text(label.scopeId);
    const id = text(label.labelId);
    if (detectorId === null || labelScopeId === null || id === null) continue;
    expectations.push({
      detectorId,
      candidateId: id,
      decision: "derived_confirmed_negative",
      scopeId: scopeId({
        detectorId,
        routeId: labelScopeId,
        candidateId: id,
      }),
      shouldFlag: false,
    });
  }

  const flaggedScopesByDetectorId = new Map<string, Set<string>>();
  const addFlag = (detectorId: string, id: string) => {
    const existing = flaggedScopesByDetectorId.get(detectorId) ?? new Set<string>();
    existing.add(id);
    flaggedScopesByDetectorId.set(detectorId, existing);
  };

  for (const finding of input.promotedFindings.findings ?? []) {
    const sourceCandidateId = text(finding.sourceCandidateId);
    if (sourceCandidateId !== null) {
      const mappedScope = candidateScopeById.get(sourceCandidateId);
      const mappedDetector = candidateDetectorById.get(sourceCandidateId);
      if (mappedScope !== undefined && mappedDetector !== undefined) {
        addFlag(mappedDetector, mappedScope);
        continue;
      }
    }

    const detectorId = text(finding.detectorId);
    if (sourceCandidateId === null || detectorId === null) continue;
    addFlag(
      detectorId,
      scopeId({
        detectorId,
        routeId: text(finding.routeId) ?? text(finding.scopeId),
        candidateId: sourceCandidateId,
      }),
    );
  }

  return { expectations, flaggedScopesByDetectorId };
}

function candidateFields(candidate: QueueCandidate): CandidateFields {
  return candidate.candidate ?? candidate;
}

function candidateId(candidate: CandidateFields): string | null {
  return text(candidate.candidateId);
}

function candidateDetectorId(candidate: CandidateFields): string | null {
  return text(candidate.detectorId);
}

function candidateScopeKey(candidate: CandidateFields): string | null {
  const detectorId = candidateDetectorId(candidate);
  if (detectorId === null) return null;
  const id = candidateId(candidate);
  return scopeId({
    detectorId,
    routeId: text(candidate.routeId) ?? text(candidate.scopeId),
    candidateId: id ?? text(candidate.scopeId) ?? "unknown",
  });
}

function promotedCandidateIdSet(promotedFindings: PromotedFindingsArtifact): Set<string> {
  return new Set(
    (promotedFindings.findings ?? [])
      .map((finding) => text(finding.sourceCandidateId))
      .filter((id): id is string => id !== null),
  );
}

function promotedCountByDetectorId(
  promotedFindings: PromotedFindingsArtifact,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of promotedFindings.findings ?? []) {
    const detectorId = text(finding.detectorId);
    if (detectorId === null) continue;
    counts.set(detectorId, (counts.get(detectorId) ?? 0) + 1);
  }
  return counts;
}

function packets(reviewPackets: ReviewPacketArtifact | null): ReviewPacket[] {
  return arrayValue<ReviewPacket>(reviewPackets?.packets ?? reviewPackets?.reviewPackets);
}

function completenessScore(completeness: PacketCompleteness | undefined): number {
  if (completeness === undefined) return 0;
  return Math.round(
    (booleanValue(completeness.hasPrimaryEvidence) ? 300 : 0) +
      (booleanValue(completeness.hasCounterEvidence) ? 200 : 0) +
      (booleanValue(completeness.hasCoverageAudit) ? 200 : 0) +
      (booleanValue(completeness.hasDetectorSpec) ? 150 : 0) +
      (booleanValue(completeness.hasReviewChecklist) ? 150 : 0),
  );
}

function summarizeEvidenceByDetector(
  reviewPackets: ReviewPacketArtifact | null,
): Map<string, DetectorEvidenceSummary> {
  const accumulator = new Map<
    string,
    DetectorEvidenceSummary & { totalCompletenessScore: number }
  >();
  for (const packet of packets(reviewPackets)) {
    const detectorId = candidateDetectorId(packet.candidate ?? {});
    if (detectorId === null) continue;
    const current =
      accumulator.get(detectorId) ??
      ({
        packetCount: 0,
        missingPrimaryEvidenceCount: 0,
        missingCounterEvidenceCount: 0,
        missingCoverageAuditCount: 0,
        missingDetectorSpecCount: 0,
        missingReviewChecklistCount: 0,
        missingDataEvidenceCount: 0,
        promotionBlockerCount: 0,
        averageCompletenessScore: null,
        totalCompletenessScore: 0,
      } satisfies DetectorEvidenceSummary & { totalCompletenessScore: number });
    const completeness = packet.packetCompleteness;
    current.packetCount += 1;
    current.totalCompletenessScore += completenessScore(completeness);
    if (!booleanValue(completeness?.hasPrimaryEvidence)) current.missingPrimaryEvidenceCount += 1;
    if (!booleanValue(completeness?.hasCounterEvidence)) current.missingCounterEvidenceCount += 1;
    if (!booleanValue(completeness?.hasCoverageAudit)) current.missingCoverageAuditCount += 1;
    if (!booleanValue(completeness?.hasDetectorSpec)) current.missingDetectorSpecCount += 1;
    if (!booleanValue(completeness?.hasReviewChecklist)) current.missingReviewChecklistCount += 1;
    current.missingDataEvidenceCount += arrayValue(packet.evidence?.missingData).length;
    current.promotionBlockerCount += arrayValue(packet.promotionBlockers).length;
    accumulator.set(detectorId, current);
  }

  const output = new Map<string, DetectorEvidenceSummary>();
  for (const [detectorId, summary] of accumulator) {
    output.set(detectorId, {
      ...summary,
      averageCompletenessScore:
        summary.packetCount === 0
          ? null
          : Math.round((summary.totalCompletenessScore / summary.packetCount) * 10) / 10,
    });
  }
  return output;
}

function summarizeQueuesByDetector(input: {
  promotionQueue: CandidateQueueArtifact | null;
  reviewQueue: CandidateQueueArtifact | null;
  promotedCandidateIds: ReadonlySet<string>;
  promotedCountsByDetectorId: ReadonlyMap<string, number>;
}): Map<string, DetectorQueueSummary> {
  const candidates =
    input.promotionQueue?.candidates !== undefined
      ? input.promotionQueue.candidates
      : (input.reviewQueue?.candidates ?? []);
  const hasCandidateIdOverlap = candidates.some((rawCandidate) => {
    const id = candidateId(candidateFields(rawCandidate));
    return id !== null && input.promotedCandidateIds.has(id);
  });
  const byDetector = new Map<string, DetectorQueueSummary & { scopeIds: Set<string> }>();
  for (const rawCandidate of candidates) {
    const candidate = candidateFields(rawCandidate);
    const detectorId = candidateDetectorId(candidate);
    if (detectorId === null) continue;
    const current =
      byDetector.get(detectorId) ??
      ({
        candidateCount: 0,
        promotedCandidateCount: 0,
        nearMissCount: 0,
        uniqueScopeCount: 0,
        duplicateScopeCount: 0,
        readyForReviewCount: 0,
        blockedCount: 0,
        needsEnrichmentCount: 0,
        scopeIds: new Set<string>(),
      } satisfies DetectorQueueSummary & { scopeIds: Set<string> });
    current.candidateCount += 1;
    const id = candidateId(candidate);
    if (hasCandidateIdOverlap) {
      if (id !== null && input.promotedCandidateIds.has(id)) current.promotedCandidateCount += 1;
      else current.nearMissCount += 1;
    }
    const scope = candidateScopeKey(candidate);
    if (scope !== null) current.scopeIds.add(scope);
    const readiness = text(rawCandidate.readiness);
    if (readiness === "ready_for_review") current.readyForReviewCount += 1;
    else if (readiness === "blocked") current.blockedCount += 1;
    else if (readiness !== null) current.needsEnrichmentCount += 1;
    byDetector.set(detectorId, current);
  }

  const output = new Map<string, DetectorQueueSummary>();
  for (const [detectorId, summary] of byDetector) {
    const promotedCandidateCount = hasCandidateIdOverlap
      ? summary.promotedCandidateCount
      : Math.min(summary.candidateCount, input.promotedCountsByDetectorId.get(detectorId) ?? 0);
    output.set(detectorId, {
      ...summary,
      promotedCandidateCount,
      nearMissCount: hasCandidateIdOverlap
        ? summary.nearMissCount
        : Math.max(0, summary.candidateCount - promotedCandidateCount),
      uniqueScopeCount: summary.scopeIds.size,
      duplicateScopeCount: Math.max(0, summary.candidateCount - summary.scopeIds.size),
    });
  }
  return output;
}

function summarizeCoverageByDetector(
  audit: DetectorCoverageAuditArtifact | null,
): Map<string, DetectorCoverageSummary> {
  const output = new Map<string, DetectorCoverageSummary>();
  for (const detector of audit?.detectors ?? []) {
    const detectorId = text(detector.detectorId);
    if (detectorId === null) continue;
    const outcomeCounts = detector.outcomeCounts ?? {};
    const candidateReasonCounts = detector.candidateReasonCounts ?? {};
    const reasonCounts = detector.reasonCounts ?? {};
    const skippedMissingInputCount = numberValue(outcomeCounts["skipped_missing_input"]);
    const explicitMissingDataCount =
      skippedMissingInputCount +
      Object.entries({ ...reasonCounts, ...candidateReasonCounts })
        .filter(([reason]) => /missing|insufficient|gap|unavailable/i.test(reason))
        .reduce((sum, [, count]) => sum + numberValue(count), 0);
    output.set(detectorId, {
      coverageCount: numberValue(detector.coverageCount),
      hitCount: numberValue(outcomeCounts["hit"]),
      cleanNoHitCount: numberValue(outcomeCounts["clean_no_hit"]),
      skippedMissingInputCount,
      explicitMissingDataCount,
    });
  }
  return output;
}

function hasUnresolvedCausalLanguage(value: unknown): boolean {
  const claim = text(value)?.toLowerCase() ?? null;
  if (claim === null) return false;
  if (
    /\bnot\s+(a\s+)?causal\b/.test(claim) ||
    claim.includes("not a claim that") ||
    claim.includes("not causal proof") ||
    claim.includes("association pending review") ||
    claim.includes("descriptive context")
  ) {
    return false;
  }
  return /\b(caused|causes|because of|due to|led to|resulted in|attributable to)\b/.test(claim);
}

function summarizeClaimsByDetector(input: {
  reviewPackets: ReviewPacketArtifact | null;
  promotedFindings: PromotedFindingsArtifact;
  reviewDecisions: ReviewDecisionArtifact;
}): Map<string, DetectorClaimSummary> {
  const output = new Map<string, DetectorClaimSummary>();
  const add = (detectorId: string, claimText: unknown, explicitIssue: unknown = null) => {
    const current =
      output.get(detectorId) ??
      ({
        checkedCandidateCount: 0,
        violationCount: 0,
      } satisfies DetectorClaimSummary);
    current.checkedCandidateCount += 1;
    if (hasUnresolvedCausalLanguage(claimText) || text(explicitIssue) !== null) {
      current.violationCount += 1;
    }
    output.set(detectorId, current);
  };

  for (const packet of packets(input.reviewPackets)) {
    const detectorId = candidateDetectorId(packet.candidate ?? {});
    if (detectorId !== null) add(detectorId, packet.candidate?.claimText);
  }
  for (const finding of input.promotedFindings.findings ?? []) {
    const detectorId = text(finding.detectorId);
    if (detectorId !== null) add(detectorId, (finding as { claimText?: unknown }).claimText);
  }
  for (const decision of input.reviewDecisions.decisions ?? []) {
    const detectorId = text(decision.detectorId);
    if (detectorId !== null) add(detectorId, null, decision.claimDisciplineIssue);
  }
  return output;
}

function confusionForDetector(input: {
  detectorId: string;
  expectations: readonly LabeledExpectation[];
  flaggedScopesByDetectorId: ReadonlyMap<string, ReadonlySet<string>>;
}): DetectorConfusion {
  const expectations = input.expectations.filter(
    (expectation) => expectation.detectorId === input.detectorId,
  );
  const flaggedScopes = input.flaggedScopesByDetectorId.get(input.detectorId) ?? new Set<string>();
  const evaluation = evaluateGoldSet({ expectations, flaggedScopes });
  return {
    ...evaluation,
    expectationCount: expectations.length,
    flaggedScopeCount: flaggedScopes.size,
    confirmedPositiveCount: expectations.filter((expectation) => expectation.shouldFlag).length,
    confirmedNegativeCount: expectations.filter((expectation) => !expectation.shouldFlag).length,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function scoreAverage(values: readonly (number | null)[]): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  if (numeric.length === 0) return null;
  return Math.round((numeric.reduce((sum, value) => sum + value, 0) / numeric.length) * 10) / 10;
}

function readinessStatusByDetectorId(
  readiness: ReadinessArtifact | null,
): Map<string, string> | null {
  if (readiness === null) return null;
  const statuses = new Map<string, string>();
  for (const detector of readiness.detectors ?? []) {
    const detectorId = text(detector.detectorId);
    const status = text(detector.status);
    if (detectorId !== null && status !== null) statuses.set(detectorId, status);
  }
  return statuses;
}

function grainAuditStatus(value: unknown): DetectorGrainAuditStatus {
  const status = text(value);
  if (
    status === "pass" ||
    status === "warn" ||
    status === "block" ||
    status === "not_applicable"
  ) {
    return status;
  }
  return "unknown";
}

function grainAuditByDetectorId(
  grainAudit: DetectorGrainAuditArtifact | null,
): Map<string, DetectorGrainAuditSummary> {
  const output = new Map<string, DetectorGrainAuditSummary>();
  for (const row of grainAudit?.detectors ?? []) {
    const detectorId = text(row.detectorId);
    if (detectorId === null) continue;
    const checks = row.releaseChecks;
    output.set(detectorId, {
      routeMonthPolicyStatus: grainAuditStatus(checks?.routeMonthPolicy?.status),
      routeMonthPolicyClassification: text(checks?.routeMonthPolicy?.classification),
      cleanNoHitGrainStatus: grainAuditStatus(checks?.cleanNoHitGrain?.status),
      scoreVectorExpectationStatus: grainAuditStatus(checks?.scoreVectorExpectation?.status),
      falseNegativeShadowAuditRequired: checks?.falseNegativeShadowAudit?.required === true,
      falseNegativeShadowAuditStatus: grainAuditStatus(checks?.falseNegativeShadowAudit?.status),
      releaseGateStatus: grainAuditStatus(checks?.releaseGate?.status),
      releaseGateReason: text(checks?.releaseGate?.reason),
    });
  }
  return output;
}

function coverageRobustnessScore(status: string | null): number | null {
  if (status === null) return null;
  if (status === "ready") return 1000;
  if (status === "partial") return 500;
  return 0;
}

function evidenceQualityScore(summary: DetectorEvidenceSummary | null): number | null {
  return summary?.averageCompletenessScore ?? null;
}

function missingDataDisciplineScore(summary: DetectorCoverageSummary | null): number | null {
  if (summary === null) return null;
  const total = summary.hitCount + summary.cleanNoHitCount + summary.skippedMissingInputCount;
  if (total === 0) return null;
  if (summary.skippedMissingInputCount === 0) return 1000;
  const explicitShare = Math.min(
    1,
    summary.explicitMissingDataCount / Math.max(1, summary.skippedMissingInputCount),
  );
  return Math.round(700 + explicitShare * 300);
}

function calibrationStabilityScore(input: {
  detectorId: string;
  ewtScoreVectors: EwtScoreVectorArtifact | null;
  speedPaceScoreVectors: SpeedPaceScoreVectorArtifact | null;
  runtimeTrendScoreVectors: RuntimeTrendScoreVectorArtifact | null;
  detectorScoreVectors: GenericDetectorScoreVectorArtifact | null;
}): number | null {
  if (text(input.ewtScoreVectors?.detectorId) === input.detectorId) {
    const summary = input.ewtScoreVectors?.summary;
    const usableMonthCount = numberValue(summary?.usableMonthCount);
    const baselineMonthCount = numberValue(summary?.baselineMonthCount);
    const routeCount = numberValue(summary?.routeCount);
    const releaseUsableRouteCount = numberValue(summary?.releaseUsableRouteCount);
    if (usableMonthCount === 0 || baselineMonthCount === 0 || routeCount === 0) return null;
    const historyScore = Math.min(1, usableMonthCount / 36) * 450;
    const baselineScore = Math.min(1, baselineMonthCount / 24) * 350;
    const releaseCoverageScore = Math.min(1, releaseUsableRouteCount / routeCount) * 200;
    return Math.round(historyScore + baselineScore + releaseCoverageScore);
  }

  const speedPaceScoreVectors = input.speedPaceScoreVectors;
  if (
    speedPaceScoreVectors !== null &&
    text(speedPaceScoreVectors.detectorId) === input.detectorId
  ) {
    const summary = speedPaceScoreVectors.summary;
    const usableMonthCount = numberValue(summary.usableMonthCount);
    const totalFeatureCount = numberValue(summary.totalFeatureCount);
    const totalCandidateCount = numberValue(summary.totalCandidateCount);
    const totalSkippedCount = numberValue(summary.totalSkippedCount);
    const routeCount = numberValue(summary.routeCount);
    const releaseFeatureCount = numberValue(summary.releaseFeatureCount);
    if (usableMonthCount === 0 || totalFeatureCount === 0 || routeCount === 0) return null;
    const historyScore = Math.min(1, usableMonthCount / 36) * 350;
    const featureSupportScore = Math.min(1, totalFeatureCount / 100_000) * 250;
    const releaseCoverageScore =
      Math.min(1, releaseFeatureCount / Math.max(1, routeCount * 20)) * 200;
    const candidateShapeScore = totalCandidateCount > 0 ? 100 : 0;
    const skippedPenalty = Math.min(100, (totalSkippedCount / totalFeatureCount) * 100);
    return Math.round(
      historyScore +
        featureSupportScore +
        releaseCoverageScore +
        candidateShapeScore +
        (100 - skippedPenalty),
    );
  }

  const runtimeTrendScoreVector = input.runtimeTrendScoreVectors?.detectors.find(
    (detector) => text(detector.detectorId) === input.detectorId,
  );
  if (runtimeTrendScoreVector !== undefined) {
    const summary = runtimeTrendScoreVector.summary;
    const usableMonthCount = numberValue(summary.usableMonthCount);
    const totalFeatureCount = numberValue(summary.totalFeatureCount);
    const totalCandidateCount = numberValue(summary.totalCandidateCount);
    const totalSkippedCount = numberValue(summary.totalSkippedCount);
    const routeCount = numberValue(summary.routeCount);
    const releaseFeatureCount = numberValue(summary.releaseFeatureCount);
    if (usableMonthCount === 0 || totalFeatureCount === 0 || routeCount === 0) return null;
    const historyScore = Math.min(1, usableMonthCount / 36) * 350;
    const featureSupportScore = Math.min(1, totalFeatureCount / 25_000) * 250;
    const releaseCoverageScore =
      Math.min(1, releaseFeatureCount / Math.max(1, routeCount * 4)) * 200;
    const candidateShapeScore = totalCandidateCount > 0 ? 100 : 0;
    const skippedPenalty = Math.min(100, (totalSkippedCount / totalFeatureCount) * 100);
    return Math.round(
      historyScore +
        featureSupportScore +
        releaseCoverageScore +
        candidateShapeScore +
        (100 - skippedPenalty),
    );
  }

  const vector = input.detectorScoreVectors?.detectors?.find(
    (detector) => text(detector.detectorId) === input.detectorId,
  );
  if (vector === undefined) return null;
  const summary = vector.summary;
  const scopeCount = numberValue(summary?.scopeCount);
  if (scopeCount === 0) return null;
  const monthCount = numberValue(summary?.monthCount);
  const flaggedCount = numberValue(summary?.flaggedCount);
  const cleanNoHitCount = numberValue(summary?.cleanNoHitCount);
  const skippedCount = numberValue(summary?.skippedCount);
  const historyScore = Math.min(1, monthCount / 12) * 250;
  const scopeScore = Math.min(1, scopeCount / 100) * 300;
  const labelShapeScore = (flaggedCount > 0 ? 150 : 0) + (cleanNoHitCount > 0 ? 150 : 0);
  const skippedPenalty = Math.min(150, (skippedCount / scopeCount) * 150);
  return Math.round(historyScore + scopeScore + labelShapeScore + (150 - skippedPenalty));
}

function noveltyScore(summary: DetectorQueueSummary): number | null {
  if (summary.candidateCount === 0) return null;
  return scoreFromShare(summary.uniqueScopeCount / summary.candidateCount);
}

function claimDisciplineScore(summary: DetectorClaimSummary): number | null {
  if (summary.checkedCandidateCount === 0) return null;
  return scoreFromShare(1 - summary.violationCount / summary.checkedCandidateCount);
}

function eleganceScore(detector: ReturnType<typeof listAnalyticsDetectors>[number]): number {
  const featureCount = detector.featureGrains.length;
  const baselineCount = detector.baselineFamilies.length;
  const gateCount = detector.promotionGates.length;
  const missingStateCount = detector.missingDataStates.length;
  const dependencyScore = Math.max(0, 180 - Math.max(0, featureCount - 1) * 45);
  const transparentMathScore = detector.spec.primaryEvidenceRequired.length > 0 ? 220 : 120;
  const thresholdLocalityScore = detector.spec.promotionChecklist.length > 0 ? 160 : 110;
  const counterEvidenceScore = detector.spec.counterEvidenceRequired.length > 0 ? 160 : 80;
  const parameterScore = Math.max(0, 120 - Math.max(0, baselineCount + gateCount - 4) * 15);
  const failureStateScore = Math.min(160, missingStateCount * 25);
  return Math.round(
    dependencyScore +
      transparentMathScore +
      thresholdLocalityScore +
      counterEvidenceScore +
      parameterScore +
      failureStateScore,
  );
}

function adjustedCoverageRobustnessScore(input: {
  readinessStatus: string | null;
  coverage: DetectorCoverageSummary | null;
}): number | null {
  const readinessScore = coverageRobustnessScore(input.readinessStatus);
  if (readinessScore === null) return null;
  if (input.coverage === null) return readinessScore;
  const total =
    input.coverage.hitCount +
    input.coverage.cleanNoHitCount +
    input.coverage.skippedMissingInputCount;
  if (total === 0) return readinessScore;
  const skippedPenalty = Math.round((input.coverage.skippedMissingInputCount / total) * 250);
  return Math.max(0, readinessScore - skippedPenalty);
}

function modelBackedEvaluationLossHardGate(input: {
  modelArtifacts: readonly string[];
  confusion: DetectorConfusion;
}): DetectorEvaluationHardGate {
  const hasModels = input.modelArtifacts.length > 0;
  const precision = ratio(
    input.confusion.truePositive,
    input.confusion.truePositive + input.confusion.falsePositive,
  );
  const primarySurvivalPassed =
    input.confusion.confirmedPositiveCount === 0 || input.confusion.falseNegative === 0;
  const precisionPassed =
    input.confusion.confirmedNegativeCount === 0 || precision === null || precision >= 0.5;
  const passed = !hasModels || (primarySurvivalPassed && precisionPassed);
  const reasons: string[] = [];
  if (!hasModels) {
    reasons.push("Detector does not declare model artifacts, so this gate is not applicable.");
  } else {
    reasons.push(`Model artifacts: ${input.modelArtifacts.join(", ")}.`);
    reasons.push(
      primarySurvivalPassed
        ? "Reviewed primary-positive survival passed."
        : `${input.confusion.falseNegative} reviewed primary-positive scope(s) were not flagged.`,
    );
    reasons.push(
      precisionPassed
        ? "Reviewed negative precision floor passed."
        : `Reviewed precision ${precision === null ? "n/a" : precision.toFixed(3)} is below 0.5.`,
    );
  }
  return {
    gateId: "model_backed_evaluation_loss",
    label: "Model-backed evaluation loss",
    passed,
    multiplier: 0,
    reason: reasons.join(" "),
  };
}

function flagsForConfusion(input: {
  confusion: DetectorConfusion;
  nearMissCount: number;
  missingDataScopeCount: number;
  evidence: DetectorEvidenceSummary | null;
  claims: DetectorClaimSummary;
  calibrationStability: number | null;
  grainAudit: DetectorGrainAuditSummary | null;
  holdoutAvailable: boolean;
}): DetectorEvaluationFlag[] {
  const flags = goldSetEvaluationFlags({
    evaluation: input.confusion,
    expectationCount: input.confusion.expectationCount,
    nearMissCount: input.nearMissCount,
    missingDataScopeCount: input.missingDataScopeCount,
    holdoutAvailable: input.holdoutAvailable,
  });
  if (input.confusion.expectationCount < 20) flags.push("insufficient_labels");
  if (input.evidence === null) flags.push("evidence_packet_unavailable");
  else if (
    input.evidence.missingPrimaryEvidenceCount > 0 ||
    input.evidence.missingCoverageAuditCount > 0 ||
    input.evidence.missingDetectorSpecCount > 0
  ) {
    flags.push("evidence_quality_failures");
  }
  if (input.claims.violationCount > 0) flags.push("claim_discipline_violation");
  if (input.calibrationStability === null) flags.push("score_vector_unavailable");
  if (input.grainAudit?.routeMonthPolicyStatus === "warn") flags.push("grain_policy_warning");
  if (input.grainAudit?.cleanNoHitGrainStatus === "warn") {
    flags.push("clean_no_hit_grain_review_required");
  }
  if (
    input.grainAudit?.falseNegativeShadowAuditRequired &&
    input.grainAudit.falseNegativeShadowAuditStatus === "warn"
  ) {
    flags.push("false_negative_shadow_audit_unavailable");
  }
  if (input.confusion.expectationCount < 50) flags.push("retirement_evidence_insufficient");
  return [...new Set(flags)].sort();
}

function scorecardForDetector(input: {
  detector: ReturnType<typeof listAnalyticsDetectors>[number];
  confusion: DetectorConfusion;
  readinessStatus: string | null;
  auxiliary: DetectorAuxiliaryInputs;
}): DetectorEvaluationScorecard {
  const precision = ratio(
    input.confusion.truePositive,
    input.confusion.truePositive + input.confusion.falsePositive,
  );
  const hasNegativeOrMissedPositive =
    input.confusion.confirmedNegativeCount > 0 || input.confusion.falseNegative > 0;
  const recall = hasNegativeOrMissedPositive
    ? ratio(
        input.confusion.truePositive,
        input.confusion.truePositive + input.confusion.falseNegative,
      )
    : null;
  const approvalShare = ratio(
    input.confusion.confirmedPositiveCount,
    input.confusion.expectationCount,
  );
  const evidenceScore = evidenceQualityScore(input.auxiliary.evidence);
  const missingDataScore = missingDataDisciplineScore(input.auxiliary.coverage);
  const calibrationScore = calibrationStabilityScore({
    detectorId: input.detector.detectorId,
    ewtScoreVectors: input.auxiliary.ewtScoreVectors,
    speedPaceScoreVectors: input.auxiliary.speedPaceScoreVectors,
    runtimeTrendScoreVectors: input.auxiliary.runtimeTrendScoreVectors,
    detectorScoreVectors: input.auxiliary.detectorScoreVectors,
  });
  const novelty = noveltyScore(input.auxiliary.queue);
  const claimScore = claimDisciplineScore(input.auxiliary.claims);
  const coverageScore =
    input.confusion.expectationCount === 0 && input.auxiliary.queue.candidateCount === 0
      ? null
      : adjustedCoverageRobustnessScore({
          readinessStatus: input.readinessStatus,
          coverage: input.auxiliary.coverage,
        });

  const scorecard = buildDetectorEvaluationScorecard({
    detectorId: input.detector.detectorId,
    detectorVersion: input.detector.version,
    detectorName: input.detector.spec.name,
    claimTier: input.detector.claimTier,
    reviewedLabelCount: input.confusion.expectationCount,
    flags: flagsForConfusion({
      confusion: input.confusion,
      nearMissCount: input.auxiliary.queue.nearMissCount,
      missingDataScopeCount: input.auxiliary.coverage?.explicitMissingDataCount ?? 0,
      evidence: input.auxiliary.evidence,
      claims: input.auxiliary.claims,
      calibrationStability: calibrationScore,
      grainAudit: input.auxiliary.grainAudit,
      holdoutAvailable: input.auxiliary.holdoutAvailable,
    }),
    hardGates: [
      modelBackedEvaluationLossHardGate({
        modelArtifacts: input.detector.modelArtifacts ?? [],
        confusion: input.confusion,
      }),
      negativeOrNearMissHardGate({
        evaluation: input.confusion,
        nearMissCount: input.auxiliary.queue.nearMissCount,
      }),
      detectorReadinessHardGate({ readinessStatus: input.readinessStatus }),
      {
        gateId: "missing_primary_evidence_schema",
        label: "Primary evidence schema",
        passed:
          input.auxiliary.evidence === null ||
          input.auxiliary.evidence.missingPrimaryEvidenceCount === 0,
        multiplier: 0,
        reason:
          input.auxiliary.evidence === null
            ? "No review packets are available for this detector."
            : `${input.auxiliary.evidence.missingPrimaryEvidenceCount} packet(s) are missing primary evidence.`,
      },
      {
        gateId: "unresolved_causal_language_violation",
        label: "Claim discipline",
        passed: input.auxiliary.claims.violationCount === 0,
        multiplier: 0,
        reason:
          input.auxiliary.claims.violationCount === 0
            ? "No unresolved causal-language violations were found."
            : `${input.auxiliary.claims.violationCount} unresolved claim-language violation(s) were found.`,
      },
      {
        gateId: "missing_data_scored_as_clean",
        label: "Missing data not scored as clean",
        passed:
          input.auxiliary.coverage === null ||
          input.auxiliary.coverage.skippedMissingInputCount === 0 ||
          input.auxiliary.coverage.explicitMissingDataCount > 0,
        multiplier: 0,
        reason:
          input.auxiliary.coverage === null
            ? "Detector coverage audit is unavailable."
            : `${input.auxiliary.coverage.skippedMissingInputCount} skipped/missing input row(s), ${input.auxiliary.coverage.explicitMissingDataCount} explicit missing-data signal(s).`,
      },
      {
        gateId: "clean_no_hit_grain_mismatch",
        label: "Clean no-hit grain policy",
        passed:
          input.auxiliary.grainAudit === null ||
          (input.auxiliary.grainAudit.releaseGateStatus !== "block" &&
            input.auxiliary.grainAudit.cleanNoHitGrainStatus !== "block"),
        multiplier: 0,
        reason:
          input.auxiliary.grainAudit === null
            ? "Detector corpus grain audit is unavailable."
            : (input.auxiliary.grainAudit.releaseGateReason ??
              `Release grain gate status: ${input.auxiliary.grainAudit.releaseGateStatus}.`),
      },
    ],
    components: [
      componentScore({
        componentId: "precision",
        score: scoreFromShare(precision),
        reason:
          precision === null
            ? "No reviewed flagged scopes are available for this detector."
            : "Computed from reviewed decisions and promoted findings.",
      }),
      componentScore({
        componentId: "recall",
        score: scoreFromShare(recall),
        reason:
          recall === null
            ? "No false-negative discovery pool or confirmed negative set is available yet."
            : "Computed from reviewed positives and missed positives.",
      }),
      componentScore({
        componentId: "evidence_quality",
        score: evidenceScore,
        reason:
          input.auxiliary.evidence === null
            ? "No review packets are available for this detector."
            : `Average packet completeness across ${input.auxiliary.evidence.packetCount} packet(s).`,
      }),
      componentScore({
        componentId: "missing_data_discipline",
        score: missingDataScore,
        reason:
          input.auxiliary.coverage === null
            ? "Detector coverage audit is unavailable."
            : `Coverage audit records ${input.auxiliary.coverage.skippedMissingInputCount} skipped/missing input row(s).`,
      }),
      componentScore({
        componentId: "calibration_stability",
        score: calibrationScore,
        reason:
          calibrationScore === null
            ? "No score-vector artifact is available for this detector."
            : "Score-vector history has enough route/month support for baseline stability.",
      }),
      componentScore({
        componentId: "novelty",
        score: novelty,
        reason:
          novelty === null
            ? "No promotion/review queue candidates are available for this detector."
            : `${input.auxiliary.queue.uniqueScopeCount}/${input.auxiliary.queue.candidateCount} queued candidate scopes are unique.`,
      }),
      componentScore({
        componentId: "reviewer_usefulness",
        score: scoreFromShare(approvalShare),
        reason:
          approvalShare === null
            ? "No reviewer dispositions are available for this detector."
            : "Initial proxy: share of reviewed candidates approved or approved with revisions.",
      }),
      componentScore({
        componentId: "claim_discipline",
        score: claimScore,
        reason:
          claimScore === null
            ? "No claim text is available for this detector."
            : `${input.auxiliary.claims.violationCount}/${input.auxiliary.claims.checkedCandidateCount} checked claim(s) had unresolved overclaim language.`,
      }),
      componentScore({
        componentId: "coverage_robustness",
        score: coverageScore,
        reason:
          input.confusion.expectationCount === 0
            ? "Detector readiness is recorded, but no reviewed labels exist, so it is not scored as detector quality."
            : input.readinessStatus === null
              ? "Detector readiness artifact was unavailable."
              : `Detector readiness plus coverage skipped-input penalty: ${input.readinessStatus}.`,
      }),
      componentScore({
        componentId: "elegance",
        score: eleganceScore(input.detector),
        reason:
          "Deterministic proxy from registry feature count, baselines, gates, specs, and failure states.",
      }),
    ],
  });
  if (scorecard.flags.includes("insufficient_labels")) {
    return {
      ...scorecard,
      preGateScore: null,
      hardGateMultiplier: 0,
      gatedScore: null,
      recommendation: "watch",
    };
  }
  return scorecard;
}

function falsePositiveRootCauses(
  reviewDecisions: ReviewDecisionArtifact,
): DetectorEvaluationArtifact["falsePositiveRegister"] {
  const counts = new Map<string, { detectorId: string; rootCause: string; count: number }>();
  for (const decision of reviewDecisions.decisions ?? []) {
    if (shouldFlag(text(decision.decision) ?? "")) continue;
    const detectorId = text(decision.detectorId);
    if (detectorId === null) continue;
    const rootCause = text(decision.falsePositiveRootCause) ?? "unspecified";
    const key = `${detectorId}\0${rootCause}`;
    const current = counts.get(key) ?? { detectorId, rootCause, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.detectorId.localeCompare(right.detectorId),
  );
}

function rankStabilitySummary(
  scoreVectors: GenericDetectorScoreVectorArtifact | null,
): RankStabilitySummary {
  const detectors = scoreVectors?.detectors ?? [];
  let checkedDetectorCount = 0;
  let fragileDetectorCount = 0;
  let maxTopTenShare: number | null = null;
  let maxThresholdSensitivityShare: number | null = null;
  for (const detector of detectors) {
    const entries = arrayValue<Record<string, unknown>>(detector.entries);
    const scored = entries
      .map((entry) => ({
        score: numberValue(entry["score"]),
        flagged: booleanValue(entry["flagged"]),
      }))
      .filter((entry): entry is { score: number; flagged: boolean } => entry.score > 0);
    const flagged = scored.filter((entry) => entry.flagged);
    if (scored.length === 0 || flagged.length === 0) continue;
    checkedDetectorCount += 1;
    const sortedScores = scored.map((entry) => entry.score).sort((left, right) => right - left);
    const topTenScoreSum = sortedScores.slice(0, 10).reduce((sum, score) => sum + score, 0);
    const totalScoreSum = sortedScores.reduce((sum, score) => sum + score, 0);
    const topTenShare = totalScoreSum === 0 ? 0 : topTenScoreSum / totalScoreSum;
    const flaggedScores = flagged.map((entry) => entry.score).sort((left, right) => left - right);
    const cutoff = flaggedScores[0] ?? 0;
    const nearCutoffCount = scored.filter(
      (entry) => entry.score >= cutoff * 0.9 && entry.score < cutoff,
    ).length;
    const thresholdSensitivityShare = nearCutoffCount / Math.max(1, flagged.length);
    maxTopTenShare = maxTopTenShare === null ? topTenShare : Math.max(maxTopTenShare, topTenShare);
    maxThresholdSensitivityShare =
      maxThresholdSensitivityShare === null
        ? thresholdSensitivityShare
        : Math.max(maxThresholdSensitivityShare, thresholdSensitivityShare);
    if (topTenShare >= 0.75 || thresholdSensitivityShare >= 0.5) fragileDetectorCount += 1;
  }
  return {
    checkedDetectorCount,
    fragileDetectorCount,
    maxTopTenShare: maxTopTenShare === null ? null : Math.round(maxTopTenShare * 1000) / 1000,
    maxThresholdSensitivityShare:
      maxThresholdSensitivityShare === null
        ? null
        : Math.round(maxThresholdSensitivityShare * 1000) / 1000,
  };
}

function qualityLabSummary(input: {
  reviewDecisions: ReviewDecisionArtifact;
  promotedFindings: PromotedFindingsArtifact;
  falsePositiveRegister: DetectorEvaluationArtifact["falsePositiveRegister"];
  scorecards: readonly DetectorEvaluationScorecard[];
  detectors: ReturnType<typeof listAnalyticsDetectors>;
  detectorScoreVectors: GenericDetectorScoreVectorArtifact | null;
}): DetectorEvaluationArtifact["qualityLab"] {
  const decisions = input.reviewDecisions.decisions ?? [];
  const reviewedDecisionCount = decisions.length;
  const reviewerApprovedDecisionCount = decisions.filter((decision) =>
    shouldFlag(text(decision.decision) ?? ""),
  ).length;
  const promotedFindingCount = input.promotedFindings.findings?.length ?? 0;
  const modelBackedDetectorCount = input.detectors.filter(
    (detector) => (detector.modelArtifacts ?? []).length > 0,
  ).length;
  const modelBackedEvaluationLossBlockedDetectorCount = input.scorecards.filter((scorecard) =>
    scorecard.hardGates.some(
      (gate) => gate.gateId === "model_backed_evaluation_loss" && !gate.passed,
    ),
  ).length;
  const scoreVectorUnavailableDetectorCount = input.scorecards.filter((scorecard) =>
    scorecard.flags.includes("score_vector_unavailable"),
  ).length;
  const scoreVectorAvailableDetectorCount = input.scorecards.length - scoreVectorUnavailableDetectorCount;
  const thresholdAndRankStabilityStatus =
    scoreVectorAvailableDetectorCount === 0
      ? "missing"
      : scoreVectorUnavailableDetectorCount === 0
        ? "available"
        : "partial";
  const rankStability = rankStabilitySummary(input.detectorScoreVectors);
  return {
    reviewedDecisionCount,
    reviewerApprovedDecisionCount,
    reviewerApprovalShare: ratio(reviewerApprovedDecisionCount, reviewedDecisionCount),
    promotedFindingCount,
    primaryFindingYield: ratio(promotedFindingCount, reviewedDecisionCount),
    falsePositiveRootCount: input.falsePositiveRegister.reduce((sum, row) => sum + row.count, 0),
    falsePositiveRootKindCount: input.falsePositiveRegister.length,
    modelBackedDetectorCount,
    modelBackedEvaluationLossBlockedDetectorCount,
    scoreVectorAvailableDetectorCount,
    scoreVectorUnavailableDetectorCount,
    thresholdAndRankStabilityStatus,
    rankStabilityCheckedDetectorCount: rankStability.checkedDetectorCount,
    rankStabilityFragileDetectorCount: rankStability.fragileDetectorCount,
    maxTopTenShare: rankStability.maxTopTenShare,
    maxThresholdSensitivityShare: rankStability.maxThresholdSensitivityShare,
  };
}

export function buildDetectorEvaluationArtifact(
  input: BuildDetectorEvaluationArtifactInput,
): DetectorEvaluationArtifact {
  const { expectations, flaggedScopesByDetectorId } = scopeLabels({
    reviewDecisions: input.reviewDecisions,
    promotedFindings: input.promotedFindings,
    evaluationLabels: input.evaluationLabels,
  });
  const readinessStatuses = readinessStatusByDetectorId(input.readiness);
  const promotedCandidateIds = promotedCandidateIdSet(input.promotedFindings);
  const promotedCountsByDetectorId = promotedCountByDetectorId(input.promotedFindings);
  const evidenceByDetectorId = summarizeEvidenceByDetector(input.reviewPackets);
  const queueByDetectorId = summarizeQueuesByDetector({
    promotionQueue: input.promotionQueue,
    reviewQueue: input.reviewQueue,
    promotedCandidateIds,
    promotedCountsByDetectorId,
  });
  const coverageByDetectorId = summarizeCoverageByDetector(input.detectorCoverageAudit);
  const grainAuditByDetector = grainAuditByDetectorId(input.grainAudit);
  const claimsByDetectorId = summarizeClaimsByDetector({
    reviewPackets: input.reviewPackets,
    promotedFindings: input.promotedFindings,
    reviewDecisions: input.reviewDecisions,
  });
  const detectors = listAnalyticsDetectors();
  const scorecards = detectors.map((detector) =>
    scorecardForDetector({
      detector,
      confusion: confusionForDetector({
        detectorId: detector.detectorId,
        expectations,
        flaggedScopesByDetectorId,
      }),
      readinessStatus: readinessStatuses?.get(detector.detectorId) ?? null,
      auxiliary: {
        evidence: evidenceByDetectorId.get(detector.detectorId) ?? null,
        queue:
          queueByDetectorId.get(detector.detectorId) ??
          ({
            candidateCount: 0,
            promotedCandidateCount: 0,
            nearMissCount: 0,
            uniqueScopeCount: 0,
            duplicateScopeCount: 0,
            readyForReviewCount: 0,
            blockedCount: 0,
            needsEnrichmentCount: 0,
          } satisfies DetectorQueueSummary),
        coverage: coverageByDetectorId.get(detector.detectorId) ?? null,
        claims:
          claimsByDetectorId.get(detector.detectorId) ??
          ({
            checkedCandidateCount: 0,
            violationCount: 0,
          } satisfies DetectorClaimSummary),
        ewtScoreVectors: input.ewtScoreVectors,
        speedPaceScoreVectors: input.speedPaceScoreVectors,
        runtimeTrendScoreVectors: input.runtimeTrendScoreVectors,
        detectorScoreVectors: input.detectorScoreVectors,
        grainAudit: grainAuditByDetector.get(detector.detectorId) ?? null,
        holdoutAvailable: numberValue(input.evaluationLabels?.summary?.holdoutNegativeCount) > 0,
      },
    }),
  );
  const qualityScoredScorecards = scorecards.filter(
    (scorecard) => !scorecard.flags.includes("insufficient_labels"),
  );
  const qualityUnratedScorecards = scorecards.filter((scorecard) =>
    scorecard.flags.includes("insufficient_labels"),
  );
  const qualityOverclaimedDetectorCount = qualityUnratedScorecards.filter(
    (scorecard) => scorecard.preGateScore !== null || scorecard.gatedScore !== null,
  ).length;

  const confirmedPositiveCount = expectations.filter(
    (expectation) => expectation.shouldFlag,
  ).length;
  const confirmedNegativeCount = expectations.length - confirmedPositiveCount;
  const holdoutNegativeCount = numberValue(input.evaluationLabels?.summary?.holdoutNegativeCount);
  const nearMissCount = [...queueByDetectorId.values()].reduce(
    (sum, summary) => sum + summary.nearMissCount,
    0,
  );
  const missingDataScopeCount =
    numberValue(input.evaluationLabels?.summary?.missingDataScopeCount) ||
    [...coverageByDetectorId.values()].reduce(
      (sum, summary) => sum + summary.explicitMissingDataCount,
      0,
    );
  const falsePositiveRegister = falsePositiveRootCauses(input.reviewDecisions);
  const violationsByDetector = Object.fromEntries(
    [...claimsByDetectorId.entries()]
      .filter(([, summary]) => summary.violationCount > 0)
      .map(([detectorId, summary]) => [detectorId, summary.violationCount]),
  );
  const allQueueSummaries = [...queueByDetectorId.values()];
  const candidateCount = allQueueSummaries.reduce(
    (sum, summary) => sum + summary.candidateCount,
    0,
  );
  const uniqueScopeCount = allQueueSummaries.reduce(
    (sum, summary) => sum + summary.uniqueScopeCount,
    0,
  );
  const duplicateScopeCount = allQueueSummaries.reduce(
    (sum, summary) => sum + summary.duplicateScopeCount,
    0,
  );
  const packetCoverageByDetectorId = new Map<
    string,
    {
      packetCount: number;
      candidateCount: number;
      status: DetectorEvaluationArtifact["packetCoverage"][number]["status"];
    }
  >();
  for (const row of input.reviewPacketCoverage?.detectors ?? []) {
    const detectorId = text(row.detectorId);
    const status = reviewPacketCoverageStatus(row.status);
    if (detectorId === null || status === null) continue;
    packetCoverageByDetectorId.set(detectorId, {
      packetCount: numberValue(row.packetCount),
      candidateCount: numberValue(row.candidateCount),
      status,
    });
  }
  const packetCoverage: DetectorEvaluationArtifact["packetCoverage"] = detectors.map((detector) => {
    const coverage = packetCoverageByDetectorId.get(detector.detectorId);
    const packetCount =
      coverage?.packetCount ?? evidenceByDetectorId.get(detector.detectorId)?.packetCount ?? 0;
    const candidateCount =
      coverage?.candidateCount ?? queueByDetectorId.get(detector.detectorId)?.candidateCount ?? 0;
    return {
      detectorId: detector.detectorId,
      detectorName: detector.spec.name,
      packetCount,
      candidateCount,
      status:
        coverage?.status ??
        (packetCount > 0
          ? "available"
          : candidateCount > 0
            ? "missing_packets_for_candidates"
            : "missing_no_candidates"),
    };
  });
  return {
    artifactKind: "detector_evaluation_harness",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    runId: input.runId,
    detectorVersions: detectors.map((detector) => ({
      detectorId: detector.detectorId,
      detectorVersion: detector.version,
      detectorName: detector.spec.name,
      claimTier: detector.claimTier,
      requiredDataProducts: [...detector.requiredDataProducts],
      modelArtifacts: [...(detector.modelArtifacts ?? [])],
    })),
    inputArtifacts: input.inputArtifacts,
    evaluationSets: {
      confirmedPositiveCount,
      confirmedNegativeCount,
      nearMissCount,
      missingDataScopeCount,
      holdoutStatus: holdoutNegativeCount > 0 ? "holdout_available" : "holdout_unavailable",
    },
    summary: {
      detectorCount: detectors.length,
      scorecardCount: scorecards.length,
      positiveOnlyGoldSet:
        confirmedPositiveCount > 0 &&
        confirmedNegativeCount === 0 &&
        scorecards.some((scorecard) => scorecard.flags.includes("positive_only_gold_set")),
      insufficientLabelDetectorCount: scorecards.filter((scorecard) =>
        scorecard.flags.includes("insufficient_labels"),
      ).length,
      qualityScoredDetectorCount: qualityScoredScorecards.length,
      qualityUnratedDetectorCount: qualityUnratedScorecards.length,
      qualityOverclaimedDetectorCount,
      hardGateBlockedDetectorCount: scorecards.filter((scorecard) =>
        scorecard.hardGates.some((gate) => !gate.passed && gate.multiplier === 0),
      ).length,
      modelBackedEvaluationLossBlockedDetectorCount: scorecards.filter((scorecard) =>
        scorecard.hardGates.some(
          (gate) => gate.gateId === "model_backed_evaluation_loss" && !gate.passed,
        ),
      ).length,
      grainPolicyWarningDetectorCount: scorecards.filter((scorecard) =>
        scorecard.flags.includes("grain_policy_warning"),
      ).length,
      cleanNoHitGrainReviewRequiredDetectorCount: scorecards.filter((scorecard) =>
        scorecard.flags.includes("clean_no_hit_grain_review_required"),
      ).length,
      falseNegativeShadowAuditUnavailableDetectorCount: scorecards.filter((scorecard) =>
        scorecard.flags.includes("false_negative_shadow_audit_unavailable"),
      ).length,
      portfolioPreGateScore: scoreAverage(
        qualityScoredScorecards.map((scorecard) => scorecard.preGateScore),
      ),
      portfolioGatedScore: scoreAverage(
        qualityScoredScorecards.map((scorecard) => scorecard.gatedScore),
      ),
    },
    existingGoldSetSummary: input.goldSetEvaluation?.summary ?? null,
    falsePositiveRegister,
    claimsDiscipline: {
      checkedCandidateCount: [...claimsByDetectorId.values()].reduce(
        (sum, summary) => sum + summary.checkedCandidateCount,
        0,
      ),
      violationCount: [...claimsByDetectorId.values()].reduce(
        (sum, summary) => sum + summary.violationCount,
        0,
      ),
      violationsByDetector,
    },
    noveltySummary: {
      candidateCount,
      uniqueScopeCount,
      duplicateScopeCount,
    },
    qualityLab: qualityLabSummary({
      reviewDecisions: input.reviewDecisions,
      promotedFindings: input.promotedFindings,
      falsePositiveRegister,
      scorecards,
      detectors,
      detectorScoreVectors: input.detectorScoreVectors,
    }),
    packetCoverage,
    modelArtifacts: modelArtifactDiagnostics({
      inputArtifacts: input.inputArtifacts,
      segmentSpeedResiduals: input.segmentSpeedResiduals,
      segmentDaypartResiduals: input.segmentDaypartResiduals,
      routePeerResiduals: input.routePeerResiduals,
      reliabilityExposurePanel: input.reliabilityExposurePanel,
      interventionScopeFit: input.interventionScopeFit,
      sourceGapModel: input.sourceGapModel,
      treatmentEventPanel: input.treatmentEventPanel,
      pulseFingerprint: input.pulseFingerprint,
      decouplingQuadrants: input.decouplingQuadrants,
    }),
    detectorScorecards: scorecards,
    residualRisks: [
      "Confirmed negatives are currently derived from clean no-hit coverage rows, not manual review.",
      "Near-miss scopes are queued but not yet reviewer-labeled negatives.",
      "Calibration stability is only populated for detector families with score-vector artifacts.",
      ...(grainAuditByDetector.size === 0
        ? ["Detector corpus grain audit was unavailable, so route-month policy gates were not applied."]
        : []),
      ...(scorecards.some((scorecard) => scorecard.flags.includes("grain_policy_warning"))
        ? [
            "Some detectors still depend on route-month screening grains and require detector-native follow-up or waivers.",
          ]
        : []),
      "Elegance is a deterministic registry proxy and should be reviewed before it becomes a release gate.",
    ],
  };
}

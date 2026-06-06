import { featureContractsForGrains } from "@bp/analytics/features";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import type {
  FindingCandidate,
  FindingCoverageAudit,
  FindingEvidenceLink,
} from "@bp/domain/findings";

export type ContractSatisfaction = {
  featureGrain: string;
  resolverId: string;
  status: "resolved" | "satisfied_by_feature_quality" | "unsupported";
  reason: string;
};

export type DetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

export type RegistryDetectorRunArtifact = {
  artifactKind: "registry_detector_run";
  schemaVersion: 1;
  generatedAt: string;
  detectorId: string;
  detectorVersion: string;
  detectorRunId: string;
  releaseMonth: string;
  dbPath: string | null;
  artifactPath: string;
  wroteDb: boolean;
  featureContracts: ContractSatisfaction[];
  inputSummary: Record<string, unknown>;
  outputSummary: {
    candidateCount: number;
    evidenceCount: number;
    coverageCount: number;
    hitCount: number;
    cleanNoHitCount: number;
    skippedCount: number;
  };
  candidateSamples: Array<{
    candidateId: string;
    routeId: string | null;
    scopeId: string;
    detectorScore: number;
    claimText: string;
  }>;
};

export function detectorFeatureContractSatisfaction(detectorId: string): ContractSatisfaction[] {
  const detector = getAnalyticsDetector(detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${detectorId}`);
  return featureContractsForGrains(detector.featureGrains).map((contract) => {
    if (contract.featureGrain === "segment_daypart") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason: "Resolved from local_route_segment_speed into SegmentDaypartFeature rows.",
      };
    }
    if (contract.featureGrain === "stop_direction_hour") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason:
          "Resolved from analytics-stop-direction-hour-ewt feature artifacts into StopDirectionHourFeature rows.",
      };
    }
    if (contract.featureGrain === "route_direction_daypart") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason:
          "Resolved from local_route_segment_speed runtime aggregates and schedule runtime baselines.",
      };
    }
    if (contract.featureGrain === "route_metric_history") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason: "Resolved from local_route_month_trend average-speed history.",
      };
    }
    if (contract.featureGrain === "route_segment_month") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason: "Resolved from local_route_segment_speed into per-route segment delay profiles.",
      };
    }
    if (contract.featureGrain === "rider_weighted_excess_wait") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason:
          "Resolved from stop-direction-hour EWT features joined to route-hour ridership proxy rows.",
      };
    }
    if (contract.featureGrain === "positive_deviance") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason: "Resolved from local_route_month_trend peer-percentile and residual history.",
      };
    }
    if (contract.featureGrain === "intervention_panel") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "resolved",
        reason: "Resolved from local_route_intervention_comparison treated/control panel rows.",
      };
    }
    if (contract.featureGrain === "feed_health") {
      return {
        featureGrain: contract.featureGrain,
        resolverId: contract.resolverId,
        status: "satisfied_by_feature_quality",
        reason:
          "Current registry runner carries coverage, freshness, and sample gates through feature quality fields.",
      };
    }
    return {
      featureGrain: contract.featureGrain,
      resolverId: contract.resolverId,
      status: "unsupported",
      reason: "This registry runner does not yet support this detector feature contract.",
    };
  });
}

function coverageSummary(output: DetectorOutput): RegistryDetectorRunArtifact["outputSummary"] {
  return {
    candidateCount: output.candidates.length,
    evidenceCount: output.evidence.length,
    coverageCount: output.coverage.length,
    hitCount: output.coverage.filter((row) => row.outcome === "hit").length,
    cleanNoHitCount: output.coverage.filter((row) => row.outcome === "clean_no_hit").length,
    skippedCount: output.coverage.filter((row) => row.outcome.startsWith("skipped")).length,
  };
}

export function buildRegistryDetectorRunArtifact(input: {
  detectorId: string;
  detectorRunId: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  wroteDb: boolean;
  inputSummary: Record<string, unknown>;
  output: DetectorOutput;
}): RegistryDetectorRunArtifact {
  const detector = getAnalyticsDetector(input.detectorId);
  if (detector === null) throw new Error(`Missing ${input.detectorId} registry row`);
  return {
    artifactKind: "registry_detector_run",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    detectorId: input.detectorId,
    detectorVersion: detector.version,
    detectorRunId: input.detectorRunId,
    releaseMonth: input.releaseMonth,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    wroteDb: input.wroteDb,
    featureContracts: detectorFeatureContractSatisfaction(input.detectorId),
    inputSummary: input.inputSummary,
    outputSummary: coverageSummary(input.output),
    candidateSamples: input.output.candidates.slice(0, 25).map((candidate) => ({
      candidateId: candidate.candidateId,
      routeId: candidate.routeId,
      scopeId: candidate.scopeId,
      detectorScore: candidate.detectorScore,
      claimText: candidate.claimText,
    })),
  };
}

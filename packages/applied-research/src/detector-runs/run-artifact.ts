import type { FeatureContractSatisfaction } from "@bp/analytics/core";
import type { DetectorModelArtifactId } from "@bp/analytics/registry";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import type {
  FindingCandidate,
  FindingCoverageAudit,
  FindingEvidenceLink,
} from "@bp/domain/findings";

export type ContractSatisfaction = FeatureContractSatisfaction;

export type DataProductDependency = {
  productId: string;
  status: "declared";
  reason: string;
};

export type ModelArtifactDependency = {
  modelId: DetectorModelArtifactId | string;
  status: "available" | "missing" | "not_checked";
  rowCount: number | null;
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
  dataProductDependencies: DataProductDependency[];
  modelDependencies: ModelArtifactDependency[];
  inputSummary: Record<string, unknown>;
  outputSummary: {
    candidateCount: number;
    evidenceCount: number;
    coverageCount: number;
    hitCount: number;
    cleanNoHitCount: number;
    deferredNotInScopeCount: number;
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

export function detectorDataProductDependencies(detectorId: string): DataProductDependency[] {
  const detector = getAnalyticsDetector(detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${detectorId}`);
  return detector.requiredDataProducts.map((productId) => ({
    productId,
    status: "declared",
    reason: "Declared by the analytics detector registry for this detector.",
  }));
}

export function detectorModelDependenciesNotChecked(detectorId: string): ModelArtifactDependency[] {
  const detector = getAnalyticsDetector(detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${detectorId}`);
  return (detector.modelArtifacts ?? []).map((modelId) => ({
    modelId,
    status: "not_checked",
    rowCount: null,
    reason:
      "Model artifact dependency was declared but this artifact builder was not given run-time status.",
  }));
}

function coverageSummary(output: DetectorOutput): RegistryDetectorRunArtifact["outputSummary"] {
  return {
    candidateCount: output.candidates.length,
    evidenceCount: output.evidence.length,
    coverageCount: output.coverage.length,
    hitCount: output.coverage.filter((row) => row.outcome === "hit").length,
    cleanNoHitCount: output.coverage.filter((row) => row.outcome === "clean_no_hit").length,
    deferredNotInScopeCount: output.coverage.filter(
      (row) => row.outcome === "deferred_not_in_scope",
    ).length,
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
  featureContracts: readonly ContractSatisfaction[];
  candidateSampleLimit?: number;
  modelDependencies?: readonly ModelArtifactDependency[];
}): RegistryDetectorRunArtifact {
  const detector = getAnalyticsDetector(input.detectorId);
  if (detector === null) throw new Error(`Missing ${input.detectorId} registry row`);
  const candidateSampleLimit = input.candidateSampleLimit ?? 25;
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
    featureContracts: [...input.featureContracts],
    dataProductDependencies: detectorDataProductDependencies(input.detectorId),
    modelDependencies: [
      ...(input.modelDependencies ?? detectorModelDependenciesNotChecked(input.detectorId)),
    ],
    inputSummary: input.inputSummary,
    outputSummary: coverageSummary(input.output),
    candidateSamples: input.output.candidates.slice(0, candidateSampleLimit).map((candidate) => ({
      candidateId: candidate.candidateId,
      routeId: candidate.routeId,
      scopeId: candidate.scopeId,
      detectorScore: candidate.detectorScore,
      claimText: candidate.claimText,
    })),
  };
}

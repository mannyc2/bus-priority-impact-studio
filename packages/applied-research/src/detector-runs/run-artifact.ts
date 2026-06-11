import type { FeatureContractSatisfaction } from "@bp/analytics/core";
import type { DetectorModelArtifactId } from "@bp/analytics/registry";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import type {
  FindingCandidate,
  FindingCoverageAudit,
  FindingEvidenceLink,
} from "@bp/domain/findings";
import { boroughPrefix, rankByDetectorScore } from "../evaluation/cap-policy";
import { detectorScopeIdentityKey } from "../evaluation/detector-readiness-projection";

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

export type DetectorRunCapPolicyMode =
  | "global_candidate_limit"
  | "per_route_candidate_limit"
  | "not_capped";

export type DetectorRunCapInventoryStatus =
  | "high_limit_inventory"
  | "at_production_cap"
  | "below_production_cap"
  | "not_capped";

export type DetectorRunCapPolicy = {
  mode: DetectorRunCapPolicyMode;
  productionCandidateLimit: number | null;
  runCandidateLimit: number | null;
  reason: string;
};

export type DetectorRunCapRouteBreakdown = {
  routeId: string | null;
  boroughPrefix: string;
  qualifyingCandidateCount: number;
  emittedWithinProductionCapCount: number;
  cappedOutCount: number;
};

export type DetectorRunCapAccounting = {
  mode: DetectorRunCapPolicyMode;
  status: DetectorRunCapInventoryStatus;
  productionCandidateLimit: number | null;
  runCandidateLimit: number | null;
  qualifyingCandidateCount: number;
  emittedWithinProductionCapCount: number;
  cappedOutCount: number;
  cappedOutByBoroughPrefix: Record<string, number>;
  cappedOutByRouteId: Record<string, number>;
  routeBreakdown: DetectorRunCapRouteBreakdown[];
  note: string;
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
  capAccounting: DetectorRunCapAccounting;
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

function countRecordFromMap(counts: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function routeRecordKey(routeId: string | null): string {
  return routeId ?? "unknown";
}

function defaultCapPolicy(): DetectorRunCapPolicy {
  return {
    mode: "not_capped",
    productionCandidateLimit: null,
    runCandidateLimit: null,
    reason: "No production candidate cap is registered for this detector artifact.",
  };
}

function capStatus(input: {
  mode: DetectorRunCapPolicyMode;
  productionCandidateLimit: number | null;
  runCandidateLimit: number | null;
  routeBreakdown: readonly DetectorRunCapRouteBreakdown[];
  qualifyingCandidateCount: number;
}): DetectorRunCapInventoryStatus {
  if (input.mode === "not_capped" || input.productionCandidateLimit === null) {
    return "not_capped";
  }
  const productionCandidateLimit = input.productionCandidateLimit;
  if (input.runCandidateLimit !== null && input.runCandidateLimit > productionCandidateLimit) {
    return "high_limit_inventory";
  }
  const capWasReached =
    input.mode === "global_candidate_limit"
      ? input.qualifyingCandidateCount >= productionCandidateLimit
      : input.routeBreakdown.some(
          (route) => route.qualifyingCandidateCount >= productionCandidateLimit,
        );
  return capWasReached ? "at_production_cap" : "below_production_cap";
}

function capNote(input: {
  policy: DetectorRunCapPolicy;
  status: DetectorRunCapInventoryStatus;
}): string {
  if (input.status === "not_capped") return input.policy.reason;
  if (input.status === "high_limit_inventory") {
    return `${input.policy.reason} Capped-out counts are observable because this run limit exceeds the production cap.`;
  }
  if (input.status === "at_production_cap") {
    return `${input.policy.reason} This run reached the production cap; use a higher no-write candidate limit to observe suppressed candidates beyond it.`;
  }
  return `${input.policy.reason} The qualifying candidate count stayed below the production cap.`;
}

function candidateRank(input: {
  candidate: FindingCandidate;
  rankByScope: ReadonlyMap<string, number>;
}): number {
  return (
    input.rankByScope.get(
      detectorScopeIdentityKey({
        detectorId: input.candidate.detectorId,
        scopeId: input.candidate.scopeId,
      }),
    ) ?? Number.POSITIVE_INFINITY
  );
}

export function buildDetectorRunCapAccounting(input: {
  output: DetectorOutput;
  capPolicy?: DetectorRunCapPolicy;
}): DetectorRunCapAccounting {
  const policy = input.capPolicy ?? defaultCapPolicy();
  const cappedCandidates = new Set<string>();

  if (policy.mode !== "not_capped" && policy.productionCandidateLimit !== null) {
    if (policy.mode === "global_candidate_limit") {
      const rankByScope = rankByDetectorScore(input.output.candidates);
      for (const candidate of input.output.candidates) {
        const rank = candidateRank({ candidate, rankByScope });
        if (rank > policy.productionCandidateLimit) {
          cappedCandidates.add(
            detectorScopeIdentityKey({
              detectorId: candidate.detectorId,
              scopeId: candidate.scopeId,
            }),
          );
        }
      }
    } else {
      const candidatesByRoute = new Map<string, FindingCandidate[]>();
      for (const candidate of input.output.candidates) {
        const routeKey = routeRecordKey(candidate.routeId);
        const candidates = candidatesByRoute.get(routeKey) ?? [];
        candidates.push(candidate);
        candidatesByRoute.set(routeKey, candidates);
      }
      for (const candidates of candidatesByRoute.values()) {
        const rankByScope = rankByDetectorScore(candidates);
        for (const candidate of candidates) {
          const rank = candidateRank({ candidate, rankByScope });
          if (rank > policy.productionCandidateLimit) {
            cappedCandidates.add(
              detectorScopeIdentityKey({
                detectorId: candidate.detectorId,
                scopeId: candidate.scopeId,
              }),
            );
          }
        }
      }
    }
  }

  const routes = new Map<string, DetectorRunCapRouteBreakdown>();
  const cappedOutByBoroughPrefix = new Map<string, number>();
  const cappedOutByRouteId = new Map<string, number>();
  let emittedWithinProductionCapCount = 0;
  let cappedOutCount = 0;

  for (const candidate of input.output.candidates) {
    const key = detectorScopeIdentityKey({
      detectorId: candidate.detectorId,
      scopeId: candidate.scopeId,
    });
    const routeKey = routeRecordKey(candidate.routeId);
    const prefix = boroughPrefix(candidate.routeId);
    const previous = routes.get(routeKey) ?? {
      routeId: candidate.routeId,
      boroughPrefix: prefix,
      qualifyingCandidateCount: 0,
      emittedWithinProductionCapCount: 0,
      cappedOutCount: 0,
    };
    const cappedOut = cappedCandidates.has(key);
    const next = {
      ...previous,
      qualifyingCandidateCount: previous.qualifyingCandidateCount + 1,
      emittedWithinProductionCapCount:
        previous.emittedWithinProductionCapCount + (cappedOut ? 0 : 1),
      cappedOutCount: previous.cappedOutCount + (cappedOut ? 1 : 0),
    };
    routes.set(routeKey, next);
    if (cappedOut) {
      cappedOutCount += 1;
      increment(cappedOutByBoroughPrefix, prefix);
      increment(cappedOutByRouteId, routeKey);
    } else {
      emittedWithinProductionCapCount += 1;
    }
  }

  const routeBreakdown = [...routes.values()].sort(
    (left, right) =>
      left.boroughPrefix.localeCompare(right.boroughPrefix) ||
      routeRecordKey(left.routeId).localeCompare(routeRecordKey(right.routeId)),
  );
  const status = capStatus({
    mode: policy.mode,
    productionCandidateLimit: policy.productionCandidateLimit,
    runCandidateLimit: policy.runCandidateLimit,
    routeBreakdown,
    qualifyingCandidateCount: input.output.candidates.length,
  });

  return {
    mode: policy.mode,
    status,
    productionCandidateLimit: policy.productionCandidateLimit,
    runCandidateLimit: policy.runCandidateLimit,
    qualifyingCandidateCount: input.output.candidates.length,
    emittedWithinProductionCapCount,
    cappedOutCount,
    cappedOutByBoroughPrefix: countRecordFromMap(cappedOutByBoroughPrefix),
    cappedOutByRouteId: countRecordFromMap(cappedOutByRouteId),
    routeBreakdown,
    note: capNote({ policy, status }),
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
  capPolicy?: DetectorRunCapPolicy;
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
    capAccounting: buildDetectorRunCapAccounting({
      output: input.output,
      ...(input.capPolicy === undefined ? {} : { capPolicy: input.capPolicy }),
    }),
    candidateSamples: input.output.candidates.slice(0, candidateSampleLimit).map((candidate) => ({
      candidateId: candidate.candidateId,
      routeId: candidate.routeId,
      scopeId: candidate.scopeId,
      detectorScore: candidate.detectorScore,
      claimText: candidate.claimText,
    })),
  };
}

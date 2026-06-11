import { evaluateGoldSet, type GoldSetExpectation } from "@bp/analytics/calibration";

export type DetectorGoldSetReviewDecisionArtifact = {
  decisions?: Array<{
    candidateId?: unknown;
    detectorId?: unknown;
    routeId?: unknown;
    decision?: unknown;
  }>;
};

export type DetectorGoldSetPromotedFindingsArtifact = {
  findings?: Array<{
    sourceCandidateId?: unknown;
    detectorId?: unknown;
    routeId?: unknown;
    scopeId?: unknown;
  }>;
};

export type DetectorGoldSetEvaluationLabelSetArtifact = {
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
    detectorId?: unknown;
    month?: unknown;
    scopeKind?: unknown;
    scopeId?: unknown;
    sourceOutcome?: unknown;
  }>;
  summary?: {
    holdoutNegativeCount?: unknown;
    missingDataScopeCount?: unknown;
  };
};

export type DetectorGoldSetCandidateQueueArtifact = {
  candidates?: Array<{
    candidate?: {
      candidateId?: unknown;
      detectorId?: unknown;
      routeId?: unknown;
      scopeId?: unknown;
    };
    candidateId?: unknown;
    detectorId?: unknown;
    routeId?: unknown;
    scopeId?: unknown;
  }>;
};

export type DetectorGoldSetEvaluationArtifact = {
  artifactKind: "detector_gold_set_evaluation";
  schemaVersion: 1;
  generatedAt: string;
  releaseMonth: string;
  reviewDecisionsArtifactPath: string;
  promotedFindingsArtifactPath: string;
  promotionQueueArtifactPath: string;
  evaluationLabelsArtifactPath: string;
  artifactPath: string;
  summary: {
    expectationCount: number;
    negativeExpectationCount: number;
    holdoutNegativeCount: number;
    missingDataScopeCount: number;
    falseNegativeDiscoveryScopeCount: number;
    flaggedScopeCount: number;
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
    precision: number | null;
    recall: number | null;
  };
  expectations: GoldSetExpectation[];
  flaggedScopes: string[];
  falseNegativeDiscoveryScopes: Array<{
    source: "unpromoted_promotion_queue_candidate" | "missing_data_scope";
    detectorId: string;
    scopeId: string;
    candidateId: string | null;
  }>;
};

export type BuildDetectorGoldSetEvaluationArtifactInput = {
  generatedAt: string;
  releaseMonth: string;
  reviewDecisionsArtifactPath: string;
  promotedFindingsArtifactPath: string;
  promotionQueueArtifactPath: string;
  evaluationLabelsArtifactPath: string;
  artifactPath: string;
  reviewDecisions: DetectorGoldSetReviewDecisionArtifact;
  promotedFindings: DetectorGoldSetPromotedFindingsArtifact;
  evaluationLabels: DetectorGoldSetEvaluationLabelSetArtifact;
  promotionQueue: DetectorGoldSetCandidateQueueArtifact;
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

function scopeId(input: {
  detectorId: string;
  routeId: string | null;
  candidateId: string;
}): string {
  return [input.detectorId, input.routeId ?? "system", input.candidateId].join(":");
}

function shouldFlag(decision: string): boolean {
  return decision === "approve" || decision === "approve_with_revisions";
}

function candidateFields(
  candidate: NonNullable<DetectorGoldSetCandidateQueueArtifact["candidates"]>[number],
) {
  return candidate.candidate ?? candidate;
}

export function buildDetectorGoldSetEvaluationArtifact(
  input: BuildDetectorGoldSetEvaluationArtifactInput,
): DetectorGoldSetEvaluationArtifact {
  const expectations: GoldSetExpectation[] = [];
  const scopeByCandidateId = new Map<string, string>();
  for (const decision of input.reviewDecisions.decisions ?? []) {
    const candidateId = text(decision.candidateId);
    const detectorId = text(decision.detectorId);
    if (candidateId === null || detectorId === null) continue;
    const routeId = text(decision.routeId);
    const id = scopeId({ detectorId, routeId, candidateId });
    scopeByCandidateId.set(candidateId, id);
    expectations.push({
      scopeId: id,
      shouldFlag: shouldFlag(text(decision.decision) ?? ""),
    });
  }
  for (const label of input.evaluationLabels.labels ?? []) {
    if (text(label.label) !== "confirmed_negative") continue;
    const detectorId = text(label.detectorId);
    const labelScopeId = text(label.scopeId);
    const labelId = text(label.labelId);
    if (detectorId === null || labelScopeId === null || labelId === null) continue;
    expectations.push({
      scopeId: scopeId({ detectorId, routeId: labelScopeId, candidateId: labelId }),
      shouldFlag: false,
    });
  }

  const flaggedScopes = new Set<string>();
  for (const finding of input.promotedFindings.findings ?? []) {
    const candidateId = text(finding.sourceCandidateId);
    const mapped = candidateId === null ? null : scopeByCandidateId.get(candidateId);
    if (mapped !== null && mapped !== undefined) {
      flaggedScopes.add(mapped);
      continue;
    }
    const detectorId = text(finding.detectorId);
    if (candidateId === null || detectorId === null) continue;
    flaggedScopes.add(
      scopeId({
        detectorId,
        routeId: text(finding.routeId) ?? text(finding.scopeId),
        candidateId,
      }),
    );
  }

  const promotedCandidateIds = new Set(
    (input.promotedFindings.findings ?? [])
      .map((finding) => text(finding.sourceCandidateId))
      .filter((id): id is string => id !== null),
  );
  const falseNegativeDiscoveryScopes = [
    ...(input.promotionQueue.candidates ?? []).flatMap((rawCandidate) => {
      const candidate = candidateFields(rawCandidate);
      const candidateId = text(candidate.candidateId);
      const detectorId = text(candidate.detectorId);
      if (candidateId === null || detectorId === null || promotedCandidateIds.has(candidateId)) {
        return [];
      }
      return [
        {
          source: "unpromoted_promotion_queue_candidate" as const,
          detectorId,
          scopeId: scopeId({
            detectorId,
            routeId: text(candidate.routeId) ?? text(candidate.scopeId),
            candidateId,
          }),
          candidateId,
        },
      ];
    }),
    ...(input.evaluationLabels.missingDataScopes ?? []).flatMap((scope) => {
      const detectorId = text(scope.detectorId);
      const labelScopeId = text(scope.scopeId);
      if (detectorId === null || labelScopeId === null) return [];
      return [
        {
          source: "missing_data_scope" as const,
          detectorId,
          scopeId: scopeId({
            detectorId,
            routeId: labelScopeId,
            candidateId: `${text(scope.month) ?? input.releaseMonth}:${text(scope.scopeKind) ?? "scope"}:${labelScopeId}`,
          }),
          candidateId: null,
        },
      ];
    }),
  ].sort(
    (left, right) =>
      left.detectorId.localeCompare(right.detectorId) || left.scopeId.localeCompare(right.scopeId),
  );
  const evaluation = evaluateGoldSet({ expectations, flaggedScopes });
  const negativeExpectationCount = expectations.filter(
    (expectation) => !expectation.shouldFlag,
  ).length;

  return {
    artifactKind: "detector_gold_set_evaluation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    reviewDecisionsArtifactPath: input.reviewDecisionsArtifactPath,
    promotedFindingsArtifactPath: input.promotedFindingsArtifactPath,
    promotionQueueArtifactPath: input.promotionQueueArtifactPath,
    evaluationLabelsArtifactPath: input.evaluationLabelsArtifactPath,
    artifactPath: input.artifactPath,
    summary: {
      expectationCount: expectations.length,
      negativeExpectationCount,
      holdoutNegativeCount: numberValue(input.evaluationLabels.summary?.holdoutNegativeCount),
      missingDataScopeCount:
        numberValue(input.evaluationLabels.summary?.missingDataScopeCount) ||
        (input.evaluationLabels.missingDataScopes ?? []).length,
      falseNegativeDiscoveryScopeCount: falseNegativeDiscoveryScopes.length,
      flaggedScopeCount: flaggedScopes.size,
      ...evaluation,
      precision:
        evaluation.truePositive + evaluation.falsePositive === 0
          ? null
          : evaluation.truePositive / (evaluation.truePositive + evaluation.falsePositive),
      recall:
        evaluation.truePositive + evaluation.falseNegative === 0
          ? null
          : evaluation.truePositive / (evaluation.truePositive + evaluation.falseNegative),
    },
    expectations,
    flaggedScopes: [...flaggedScopes].sort(),
    falseNegativeDiscoveryScopes,
  };
}

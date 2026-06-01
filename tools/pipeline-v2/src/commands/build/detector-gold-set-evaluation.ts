import { evaluateGoldSet, type GoldSetExpectation } from "@bp/analytics/calibration";
import { arg, defineCommand, z } from "@liche/core";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type ReviewDecisionArtifact = {
  decisions?: Array<{
    candidateId?: unknown;
    detectorId?: unknown;
    routeId?: unknown;
    decision?: unknown;
  }>;
};

type PromotedFindingsArtifact = {
  findings?: Array<{
    sourceCandidateId?: unknown;
    detectorId?: unknown;
    routeId?: unknown;
    scopeId?: unknown;
  }>;
};

type EvaluationLabelSetArtifact = {
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

type CandidateQueueArtifact = {
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

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

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

function scopeId(input: { detectorId: string; routeId: string | null; candidateId: string }): string {
  return [input.detectorId, input.routeId ?? "system", input.candidateId].join(":");
}

function shouldFlag(decision: string): boolean {
  return decision === "approve" || decision === "approve_with_revisions";
}

function candidateFields(candidate: NonNullable<CandidateQueueArtifact["candidates"]>[number]) {
  return candidate.candidate ?? candidate;
}

export default defineCommand({
  path: ["build", "detector-gold-set-evaluation"],
  summary: "Build release-month detector gold-set evaluation artifact from reviewer decisions.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z.string().default("2023-04"),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    expectationCount: z.number().int().nonnegative(),
    flaggedScopeCount: z.number().int().nonnegative(),
    truePositive: z.number().int().nonnegative(),
    falsePositive: z.number().int().nonnegative(),
    trueNegative: z.number().int().nonnegative(),
    falseNegative: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const historyStartMonth = input.options.historyStartMonth;
    const findingsRoot = join(artifactRoot, "findings", releaseMonth);
    const outputPath =
      input.options.output === undefined
        ? join(findingsRoot, "gold-set-evaluation.json")
        : fromCliPath(input.options.output);
    const reviewDecisionsPath = join(findingsRoot, "review-decisions.json");
    const promotedFindingsPath = join(findingsRoot, "promoted-findings.json");
    const promotionQueuePath = join(findingsRoot, "promotion-queue.json");
    const evaluationLabelsPath = join(
      artifactRoot,
      "detector-evaluation",
      `${historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "detector-evaluation-labels.json",
    );
    const reviewDecisions =
      (await readJsonIfExists<ReviewDecisionArtifact>(reviewDecisionsPath)) ?? {};
    const promotedFindings =
      (await readJsonIfExists<PromotedFindingsArtifact>(promotedFindingsPath)) ?? {};
    const evaluationLabels =
      (await readJsonIfExists<EvaluationLabelSetArtifact>(evaluationLabelsPath)) ?? {};
    const promotionQueue = (await readJsonIfExists<CandidateQueueArtifact>(promotionQueuePath)) ?? {};

    const expectations: GoldSetExpectation[] = [];
    const scopeByCandidateId = new Map<string, string>();
    for (const decision of reviewDecisions.decisions ?? []) {
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
    for (const label of evaluationLabels.labels ?? []) {
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
    for (const finding of promotedFindings.findings ?? []) {
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
      (promotedFindings.findings ?? [])
        .map((finding) => text(finding.sourceCandidateId))
        .filter((id): id is string => id !== null),
    );
    const falseNegativeDiscoveryScopes = [
      ...(promotionQueue.candidates ?? []).flatMap((rawCandidate) => {
        const candidate = candidateFields(rawCandidate);
        const candidateId = text(candidate.candidateId);
        const detectorId = text(candidate.detectorId);
        if (candidateId === null || detectorId === null || promotedCandidateIds.has(candidateId)) {
          return [];
        }
        return [
          {
            source: "unpromoted_promotion_queue_candidate",
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
      ...(evaluationLabels.missingDataScopes ?? []).flatMap((scope) => {
        const detectorId = text(scope.detectorId);
        const labelScopeId = text(scope.scopeId);
        if (detectorId === null || labelScopeId === null) return [];
        return [
          {
            source: "missing_data_scope",
            detectorId,
            scopeId: scopeId({
              detectorId,
              routeId: labelScopeId,
              candidateId: `${text(scope.month) ?? releaseMonth}:${text(scope.scopeKind) ?? "scope"}:${labelScopeId}`,
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
    const negativeExpectationCount = expectations.filter((expectation) => !expectation.shouldFlag)
      .length;
    const artifact = {
      artifactKind: "detector_gold_set_evaluation",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      releaseMonth,
      reviewDecisionsArtifactPath: repoDisplayPath(reviewDecisionsPath),
      promotedFindingsArtifactPath: repoDisplayPath(promotedFindingsPath),
      promotionQueueArtifactPath: repoDisplayPath(promotionQueuePath),
      evaluationLabelsArtifactPath: repoDisplayPath(evaluationLabelsPath),
      artifactPath: repoDisplayPath(outputPath),
      summary: {
        expectationCount: expectations.length,
        negativeExpectationCount,
        holdoutNegativeCount: numberValue(evaluationLabels.summary?.holdoutNegativeCount),
        missingDataScopeCount:
          numberValue(evaluationLabels.summary?.missingDataScopeCount) ||
          (evaluationLabels.missingDataScopes ?? []).length,
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
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      expectationCount: expectations.length,
      flaggedScopeCount: flaggedScopes.size,
      truePositive: evaluation.truePositive,
      falsePositive: evaluation.falsePositive,
      trueNegative: evaluation.trueNegative,
      falseNegative: evaluation.falseNegative,
    };
  },
});

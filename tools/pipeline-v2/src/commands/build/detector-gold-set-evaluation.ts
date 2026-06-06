import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  detectorEvaluationLabelsPath,
  detectorGoldSetEvaluationPath,
} from "@bp/applied-research/artifacts";
import {
  buildDetectorGoldSetEvaluationArtifact,
  type DetectorGoldSetCandidateQueueArtifact,
  type DetectorGoldSetEvaluationLabelSetArtifact,
  type DetectorGoldSetPromotedFindingsArtifact,
  type DetectorGoldSetReviewDecisionArtifact,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
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
        ? detectorGoldSetEvaluationPath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.output);
    const reviewDecisionsPath = join(findingsRoot, "review-decisions.json");
    const promotedFindingsPath = join(findingsRoot, "promoted-findings.json");
    const promotionQueuePath = join(findingsRoot, "promotion-queue.json");
    const evaluationLabelsPath = detectorEvaluationLabelsPath({
      artifactRoot,
      historyStartMonth,
      releaseMonth,
    });
    const reviewDecisions =
      (await readJsonIfExists<DetectorGoldSetReviewDecisionArtifact>(reviewDecisionsPath)) ?? {};
    const promotedFindings =
      (await readJsonIfExists<DetectorGoldSetPromotedFindingsArtifact>(promotedFindingsPath)) ?? {};
    const evaluationLabels =
      (await readJsonIfExists<DetectorGoldSetEvaluationLabelSetArtifact>(evaluationLabelsPath)) ??
      {};
    const promotionQueue =
      (await readJsonIfExists<DetectorGoldSetCandidateQueueArtifact>(promotionQueuePath)) ?? {};

    const artifact = buildDetectorGoldSetEvaluationArtifact({
      generatedAt: new Date().toISOString(),
      releaseMonth,
      reviewDecisionsArtifactPath: repoDisplayPath(reviewDecisionsPath),
      promotedFindingsArtifactPath: repoDisplayPath(promotedFindingsPath),
      promotionQueueArtifactPath: repoDisplayPath(promotionQueuePath),
      evaluationLabelsArtifactPath: repoDisplayPath(evaluationLabelsPath),
      artifactPath: repoDisplayPath(outputPath),
      reviewDecisions,
      promotedFindings,
      evaluationLabels,
      promotionQueue,
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      expectationCount: artifact.summary.expectationCount,
      flaggedScopeCount: artifact.summary.flaggedScopeCount,
      truePositive: artifact.summary.truePositive,
      falsePositive: artifact.summary.falsePositive,
      trueNegative: artifact.summary.trueNegative,
      falseNegative: artifact.summary.falseNegative,
    };
  },
});

import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  buildDetectorEvaluationArtifact,
  detectorEvaluationMarkdownReport,
  type CandidateQueueArtifact,
  type DetectorCoverageAuditArtifact,
  type DetectorEvaluationLabelInputArtifact,
  type DetectorGrainAuditArtifact,
  type EwtScoreVectorArtifact,
  type GenericDetectorScoreVectorArtifact,
  type GoldSetEvaluationArtifact,
  type PromotedFindingsArtifact,
  type ReadinessArtifact,
  type ReviewDecisionArtifact,
  type ReviewPacketArtifact,
  type ReviewPacketCoverageArtifact,
} from "@bp/applied-research/evaluation";
import type {
  RuntimeTrendScoreVectorArtifact,
  SpeedPaceScoreVectorArtifact,
} from "@bp/applied-research/score-vectors";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function inputArtifactPath(path: string): string {
  return repoDisplayPath(path);
}

export function detectorEvaluationArtifactPath(
  artifactRoot: string,
  historyStartMonth: string,
  releaseMonth: string,
): string {
  return join(
    artifactRoot,
    "detector-evaluation",
    `${historyStartMonth}_to_${releaseMonth}`,
    releaseMonth,
    "detector-evaluation.json",
  );
}

export function detectorEvaluationMarkdownPath(jsonPath: string): string {
  return jsonPath.replace(/\.json$/, ".md");
}

export default defineCommand({
  path: ["evaluate", "detectors"],
  summary: "Build detector quality evaluation scorecards from release review artifacts.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z.string().default("2023-04"),
      runId: z.string().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      markdownOutput: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    markdownOutputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    scorecardCount: z.number().int().nonnegative(),
    positiveOnlyGoldSet: z.boolean(),
    portfolioPreGateScore: z.number().nullable(),
    portfolioGatedScore: z.number().nullable(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? detectorEvaluationArtifactPath(
            artifactRoot,
            input.options.historyStartMonth,
            releaseMonth,
          )
        : fromCliPath(input.options.output);
    const markdownOutputPath =
      input.options.markdownOutput === undefined
        ? detectorEvaluationMarkdownPath(outputPath)
        : fromCliPath(input.options.markdownOutput);

    const findingsRoot = join(artifactRoot, "findings", releaseMonth);
    const reviewDecisionsPath = join(findingsRoot, "review-decisions.json");
    const promotedFindingsPath = join(findingsRoot, "promoted-findings.json");
    const reviewPacketsPath = join(findingsRoot, "review-packets.json");
    const reviewPacketCoveragePath = join(findingsRoot, "review-packet-coverage.json");
    const reviewQueuePath = join(findingsRoot, "review-queue.json");
    const promotionQueuePath = join(findingsRoot, "promotion-queue.json");
    const goldSetEvaluationPath = join(findingsRoot, "gold-set-evaluation.json");
    const detectorCoverageAuditPath = join(findingsRoot, "detector-coverage-audit.json");
    const ewtScoreVectorsPath = join(
      artifactRoot,
      "analytics-ewt-score-vectors",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "ewt-route-month-score-vectors.json",
    );
    const detectorScoreVectorsPath = join(
      artifactRoot,
      "detector-score-vectors",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "detector-score-vectors.json",
    );
    const speedPaceScoreVectorsPath = join(
      artifactRoot,
      "speed-pace-score-vectors",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "speed-pace-score-vectors.json",
    );
    const runtimeTrendScoreVectorsPath = join(
      artifactRoot,
      "runtime-trend-score-vectors",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "runtime-trend-score-vectors.json",
    );
    const evaluationLabelsPath = join(
      artifactRoot,
      "detector-evaluation",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "detector-evaluation-labels.json",
    );
    const grainAuditPath = join(
      artifactRoot,
      "detector-corpus-grain",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      releaseMonth,
      "grain-audit.json",
    );
    const readinessPath = join(
      artifactRoot,
      "analytics-detector-readiness",
      `${input.options.historyStartMonth}_to_${releaseMonth}`,
      "readiness.json",
    );

    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth,
      historyStartMonth: input.options.historyStartMonth,
      generatedAt: new Date().toISOString(),
      runId: input.options.runId ?? `bus-observatory-${releaseMonth}`,
      inputArtifacts: {
        reviewDecisions: inputArtifactPath(reviewDecisionsPath),
        promotedFindings: inputArtifactPath(promotedFindingsPath),
        reviewPackets: inputArtifactPath(reviewPacketsPath),
        reviewPacketCoverage: inputArtifactPath(reviewPacketCoveragePath),
        reviewQueue: inputArtifactPath(reviewQueuePath),
        promotionQueue: inputArtifactPath(promotionQueuePath),
        goldSetEvaluation: inputArtifactPath(goldSetEvaluationPath),
        readiness: inputArtifactPath(readinessPath),
        detectorCoverageAudit: inputArtifactPath(detectorCoverageAuditPath),
        ewtScoreVectors: inputArtifactPath(ewtScoreVectorsPath),
        speedPaceScoreVectors: inputArtifactPath(speedPaceScoreVectorsPath),
        runtimeTrendScoreVectors: inputArtifactPath(runtimeTrendScoreVectorsPath),
        detectorScoreVectors: inputArtifactPath(detectorScoreVectorsPath),
        evaluationLabels: inputArtifactPath(evaluationLabelsPath),
        grainAudit: inputArtifactPath(grainAuditPath),
      },
      reviewDecisions: (await readJsonIfExists<ReviewDecisionArtifact>(reviewDecisionsPath)) ?? {},
      promotedFindings:
        (await readJsonIfExists<PromotedFindingsArtifact>(promotedFindingsPath)) ?? {},
      reviewPackets: await readJsonIfExists<ReviewPacketArtifact>(reviewPacketsPath),
      reviewPacketCoverage:
        await readJsonIfExists<ReviewPacketCoverageArtifact>(reviewPacketCoveragePath),
      reviewQueue: await readJsonIfExists<CandidateQueueArtifact>(reviewQueuePath),
      promotionQueue: await readJsonIfExists<CandidateQueueArtifact>(promotionQueuePath),
      goldSetEvaluation: await readJsonIfExists<GoldSetEvaluationArtifact>(goldSetEvaluationPath),
      readiness: await readJsonIfExists<ReadinessArtifact>(readinessPath),
      detectorCoverageAudit:
        await readJsonIfExists<DetectorCoverageAuditArtifact>(detectorCoverageAuditPath),
      ewtScoreVectors: await readJsonIfExists<EwtScoreVectorArtifact>(ewtScoreVectorsPath),
      speedPaceScoreVectors:
        await readJsonIfExists<SpeedPaceScoreVectorArtifact>(speedPaceScoreVectorsPath),
      runtimeTrendScoreVectors:
        await readJsonIfExists<RuntimeTrendScoreVectorArtifact>(runtimeTrendScoreVectorsPath),
      detectorScoreVectors:
        await readJsonIfExists<GenericDetectorScoreVectorArtifact>(detectorScoreVectorsPath),
      evaluationLabels:
        await readJsonIfExists<DetectorEvaluationLabelInputArtifact>(evaluationLabelsPath),
      grainAudit: await readJsonIfExists<DetectorGrainAuditArtifact>(grainAuditPath),
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    await mkdir(dirname(markdownOutputPath), { recursive: true });
    await Bun.write(markdownOutputPath, detectorEvaluationMarkdownReport(artifact));

    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      markdownOutputPath: repoDisplayPath(markdownOutputPath),
      detectorCount: artifact.summary.detectorCount,
      scorecardCount: artifact.summary.scorecardCount,
      positiveOnlyGoldSet: artifact.summary.positiveOnlyGoldSet,
      portfolioPreGateScore: artifact.summary.portfolioPreGateScore,
      portfolioGatedScore: artifact.summary.portfolioGatedScore,
    };
  },
});

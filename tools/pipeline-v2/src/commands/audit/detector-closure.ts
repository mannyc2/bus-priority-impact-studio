import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  analysisDependencyClosureMarkdownPath as appliedAnalysisDependencyClosureMarkdownPath,
  analysisDependencyClosurePath as appliedAnalysisDependencyClosurePath,
  dataProductCompletenessPath,
  detectorEvaluationArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  DATA_PRODUCT_MANIFEST,
  parseDataProductManifestText,
} from "@bp/applied-research/data-products";
import {
  buildAnalysisDependencyClosure,
  renderAnalysisDependencyClosureMarkdown,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import { analyticsDetectorReadinessPath } from "./analytics-detector-readiness.ts";
import { detectorCorpusGrainAuditPath } from "./detector-corpus-grain.ts";

export type {
  AnalysisDependency,
  AnalysisDependencyClosureArtifact,
  AnalysisDependencyKind,
  AnalysisDependencyStatus,
  AnalysisKind,
  AnalysisUnit,
  AnalysisUnitStatus,
  BuildAnalysisDependencyClosureInput,
} from "@bp/applied-research/evaluation";

export {
  buildAnalysisDependencyClosure,
  renderAnalysisDependencyClosureMarkdown,
} from "@bp/applied-research/evaluation";

export function analysisDependencyClosurePath(
  artifactRoot: string,
  historyStartMonth: string,
  releaseMonth: string,
): string {
  return appliedAnalysisDependencyClosurePath({
    artifactRoot,
    historyStartMonth,
    releaseMonth,
  });
}

export function analysisDependencyClosureMarkdownPath(
  artifactRoot: string,
  historyStartMonth: string,
  releaseMonth: string,
): string {
  return appliedAnalysisDependencyClosureMarkdownPath({
    artifactRoot,
    historyStartMonth,
    releaseMonth,
  });
}

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["audit", "detector-closure"],
  summary:
    "Join detector, data-product, packet, and evaluation artifacts into analysis dependency closure.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z.string().default("2023-04"),
      runId: z.string().optional(),
      artifactRoot: z.string().optional(),
      manifest: z.string().optional(),
      dataProductCompleteness: z.string().optional(),
      detectorReadiness: z.string().optional(),
      detectorCorpusGrain: z.string().optional(),
      reviewPacketCoverage: z.string().optional(),
      detectorEvaluation: z.string().optional(),
      output: z.string().optional(),
      markdownOutput: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    historyStartMonth: z.string(),
    outputPath: z.string(),
    markdownOutputPath: z.string(),
    analysisUnitCount: z.number().int().nonnegative(),
    detectorCount: z.number().int().nonnegative(),
    readyUnitCount: z.number().int().nonnegative(),
    partialUnitCount: z.number().int().nonnegative(),
    blockedUnitCount: z.number().int().nonnegative(),
    unmaterializedUnitCount: z.number().int().nonnegative(),
    noCandidateUnitCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const historyStartMonth = input.options.historyStartMonth;
    const runId = input.options.runId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? analysisDependencyClosurePath(artifactRoot, historyStartMonth, releaseMonth)
        : fromCliPath(input.options.output);
    const markdownPath =
      input.options.markdownOutput === undefined
        ? analysisDependencyClosureMarkdownPath(artifactRoot, historyStartMonth, releaseMonth)
        : fromCliPath(input.options.markdownOutput);
    const dataProductCompletenessInputPath =
      input.options.dataProductCompleteness === undefined
        ? dataProductCompletenessPath({
            artifactRoot,
            historyStartMonth,
            releaseMonth,
            runId,
          })
        : fromCliPath(input.options.dataProductCompleteness);
    const detectorReadinessInputPath =
      input.options.detectorReadiness === undefined
        ? analyticsDetectorReadinessPath({
            artifactRoot,
            startMonth: historyStartMonth,
            endMonth: releaseMonth,
          })
        : fromCliPath(input.options.detectorReadiness);
    const detectorCorpusGrainInputPath =
      input.options.detectorCorpusGrain === undefined
        ? detectorCorpusGrainAuditPath({ artifactRoot, historyStartMonth, releaseMonth })
        : fromCliPath(input.options.detectorCorpusGrain);
    const reviewPacketCoverageInputPath =
      input.options.reviewPacketCoverage === undefined
        ? join(artifactRoot, "findings", releaseMonth, "review-packet-coverage.json")
        : fromCliPath(input.options.reviewPacketCoverage);
    const detectorEvaluationInputPath =
      input.options.detectorEvaluation === undefined
        ? detectorEvaluationArtifactPath({ artifactRoot, historyStartMonth, releaseMonth })
        : fromCliPath(input.options.detectorEvaluation);
    const manifest =
      input.options.manifest === undefined
        ? DATA_PRODUCT_MANIFEST
        : parseDataProductManifestText(await Bun.file(fromCliPath(input.options.manifest)).text());

    const artifact = buildAnalysisDependencyClosure({
      manifest,
      releaseMonth,
      historyStartMonth,
      runId,
      generatedAt: new Date().toISOString(),
      artifactPath: repoDisplayPath(outputPath),
      markdownPath: repoDisplayPath(markdownPath),
      inputArtifacts: {
        dataProductCompleteness: repoDisplayPath(dataProductCompletenessInputPath),
        detectorReadiness: repoDisplayPath(detectorReadinessInputPath),
        detectorCorpusGrain: repoDisplayPath(detectorCorpusGrainInputPath),
        reviewPacketCoverage: repoDisplayPath(reviewPacketCoverageInputPath),
        detectorEvaluation: repoDisplayPath(detectorEvaluationInputPath),
      },
      dataProductCompleteness: await readJsonIfExists(dataProductCompletenessInputPath),
      detectorReadiness: await readJsonIfExists(detectorReadinessInputPath),
      detectorCorpusGrain: await readJsonIfExists(detectorCorpusGrainInputPath),
      reviewPacketCoverage: await readJsonIfExists(reviewPacketCoverageInputPath),
      detectorEvaluation: await readJsonIfExists(detectorEvaluationInputPath),
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeJson(outputPath, artifact);
    await Bun.write(markdownPath, renderAnalysisDependencyClosureMarkdown(artifact));

    return {
      releaseMonth,
      historyStartMonth,
      outputPath: repoDisplayPath(outputPath),
      markdownOutputPath: repoDisplayPath(markdownPath),
      analysisUnitCount: artifact.summary.analysisUnitCount,
      detectorCount: artifact.summary.detectorCount,
      readyUnitCount: artifact.summary.readyUnitCount,
      partialUnitCount: artifact.summary.partialUnitCount,
      blockedUnitCount: artifact.summary.blockedUnitCount,
      unmaterializedUnitCount: artifact.summary.unmaterializedUnitCount,
      noCandidateUnitCount: artifact.summary.noCandidateUnitCount,
    };
  },
});

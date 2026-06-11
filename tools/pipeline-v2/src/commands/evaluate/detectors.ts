import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  detectorEvaluationArtifactPath,
  detectorEvaluationInputArtifactPaths,
  detectorEvaluationMarkdownPath,
  modelArtifactServingProjectionPath,
  modelArtifactServingProjectionStudioPath,
} from "@bp/applied-research/artifacts";
import {
  buildDetectorEvaluationArtifact,
  buildModelArtifactServingProjection,
  type CandidateQueueArtifact,
  type DetectorCoverageAuditArtifact,
  type DetectorEvaluationLabelInputArtifact,
  type DetectorGrainAuditArtifact,
  detectorEvaluationMarkdownReport,
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
  DecouplingQuadrantsArtifactV1,
  InterventionScopeFitArtifactV1,
  PulseFingerprintArtifactV1,
  ReliabilityExposurePanelArtifactV1,
  RoutePeerResidualArtifactV1,
  SegmentDaypartResidualArtifactV1,
  SegmentSpeedResidualArtifactV1,
  SourceGapModelArtifactV1,
  TreatmentEventPanelArtifactV1,
} from "@bp/applied-research/feature-resolvers";
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
    modelProjectionOutputPath: z.string(),
    studioModelProjectionOutputPath: z.string(),
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
        ? detectorEvaluationArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const markdownOutputPath =
      input.options.markdownOutput === undefined
        ? detectorEvaluationMarkdownPath(outputPath)
        : fromCliPath(input.options.markdownOutput);
    const modelProjectionOutputPath = modelArtifactServingProjectionPath({
      artifactRoot,
      historyStartMonth: input.options.historyStartMonth,
      releaseMonth,
    });
    const studioModelProjectionOutputPath = modelArtifactServingProjectionStudioPath({
      artifactRoot,
    });

    const artifactPaths = detectorEvaluationInputArtifactPaths({
      artifactRoot,
      historyStartMonth: input.options.historyStartMonth,
      releaseMonth,
    });

    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth,
      historyStartMonth: input.options.historyStartMonth,
      generatedAt: new Date().toISOString(),
      runId: input.options.runId ?? `bus-observatory-${releaseMonth}`,
      inputArtifacts: {
        reviewDecisions: inputArtifactPath(artifactPaths.reviewDecisions),
        promotedFindings: inputArtifactPath(artifactPaths.promotedFindings),
        reviewPackets: inputArtifactPath(artifactPaths.reviewPackets),
        reviewPacketCoverage: inputArtifactPath(artifactPaths.reviewPacketCoverage),
        reviewQueue: inputArtifactPath(artifactPaths.reviewQueue),
        promotionQueue: inputArtifactPath(artifactPaths.promotionQueue),
        goldSetEvaluation: inputArtifactPath(artifactPaths.goldSetEvaluation),
        readiness: inputArtifactPath(artifactPaths.readiness),
        detectorCoverageAudit: inputArtifactPath(artifactPaths.detectorCoverageAudit),
        ewtScoreVectors: inputArtifactPath(artifactPaths.ewtScoreVectors),
        speedPaceScoreVectors: inputArtifactPath(artifactPaths.speedPaceScoreVectors),
        runtimeTrendScoreVectors: inputArtifactPath(artifactPaths.runtimeTrendScoreVectors),
        detectorScoreVectors: inputArtifactPath(artifactPaths.detectorScoreVectors),
        evaluationLabels: inputArtifactPath(artifactPaths.evaluationLabels),
        grainAudit: inputArtifactPath(artifactPaths.grainAudit),
        segmentSpeedResiduals: inputArtifactPath(artifactPaths.segmentSpeedResiduals),
        segmentDaypartResiduals: inputArtifactPath(artifactPaths.segmentDaypartResiduals),
        routePeerResiduals: inputArtifactPath(artifactPaths.routePeerResiduals),
        reliabilityExposurePanel: inputArtifactPath(artifactPaths.reliabilityExposurePanel),
        interventionScopeFit: inputArtifactPath(artifactPaths.interventionScopeFit),
        sourceGapModel: inputArtifactPath(artifactPaths.sourceGapModel),
        treatmentEventPanel: inputArtifactPath(artifactPaths.treatmentEventPanel),
        pulseFingerprint: inputArtifactPath(artifactPaths.pulseFingerprint),
        decouplingQuadrants: inputArtifactPath(artifactPaths.decouplingQuadrants),
      },
      reviewDecisions:
        (await readJsonIfExists<ReviewDecisionArtifact>(artifactPaths.reviewDecisions)) ?? {},
      promotedFindings:
        (await readJsonIfExists<PromotedFindingsArtifact>(artifactPaths.promotedFindings)) ?? {},
      reviewPackets: await readJsonIfExists<ReviewPacketArtifact>(artifactPaths.reviewPackets),
      reviewPacketCoverage: await readJsonIfExists<ReviewPacketCoverageArtifact>(
        artifactPaths.reviewPacketCoverage,
      ),
      reviewQueue: await readJsonIfExists<CandidateQueueArtifact>(artifactPaths.reviewQueue),
      promotionQueue: await readJsonIfExists<CandidateQueueArtifact>(artifactPaths.promotionQueue),
      goldSetEvaluation: await readJsonIfExists<GoldSetEvaluationArtifact>(
        artifactPaths.goldSetEvaluation,
      ),
      readiness: await readJsonIfExists<ReadinessArtifact>(artifactPaths.readiness),
      detectorCoverageAudit: await readJsonIfExists<DetectorCoverageAuditArtifact>(
        artifactPaths.detectorCoverageAudit,
      ),
      ewtScoreVectors: await readJsonIfExists<EwtScoreVectorArtifact>(
        artifactPaths.ewtScoreVectors,
      ),
      speedPaceScoreVectors: await readJsonIfExists<SpeedPaceScoreVectorArtifact>(
        artifactPaths.speedPaceScoreVectors,
      ),
      runtimeTrendScoreVectors: await readJsonIfExists<RuntimeTrendScoreVectorArtifact>(
        artifactPaths.runtimeTrendScoreVectors,
      ),
      detectorScoreVectors: await readJsonIfExists<GenericDetectorScoreVectorArtifact>(
        artifactPaths.detectorScoreVectors,
      ),
      evaluationLabels: await readJsonIfExists<DetectorEvaluationLabelInputArtifact>(
        artifactPaths.evaluationLabels,
      ),
      grainAudit: await readJsonIfExists<DetectorGrainAuditArtifact>(artifactPaths.grainAudit),
      segmentSpeedResiduals: await readJsonIfExists<SegmentSpeedResidualArtifactV1>(
        artifactPaths.segmentSpeedResiduals,
      ),
      segmentDaypartResiduals: await readJsonIfExists<SegmentDaypartResidualArtifactV1>(
        artifactPaths.segmentDaypartResiduals,
      ),
      routePeerResiduals: await readJsonIfExists<RoutePeerResidualArtifactV1>(
        artifactPaths.routePeerResiduals,
      ),
      reliabilityExposurePanel: await readJsonIfExists<ReliabilityExposurePanelArtifactV1>(
        artifactPaths.reliabilityExposurePanel,
      ),
      interventionScopeFit: await readJsonIfExists<InterventionScopeFitArtifactV1>(
        artifactPaths.interventionScopeFit,
      ),
      sourceGapModel: await readJsonIfExists<SourceGapModelArtifactV1>(
        artifactPaths.sourceGapModel,
      ),
      treatmentEventPanel: await readJsonIfExists<TreatmentEventPanelArtifactV1>(
        artifactPaths.treatmentEventPanel,
      ),
      pulseFingerprint: await readJsonIfExists<PulseFingerprintArtifactV1>(
        artifactPaths.pulseFingerprint,
      ),
      decouplingQuadrants: await readJsonIfExists<DecouplingQuadrantsArtifactV1>(
        artifactPaths.decouplingQuadrants,
      ),
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    await mkdir(dirname(markdownOutputPath), { recursive: true });
    await Bun.write(markdownOutputPath, detectorEvaluationMarkdownReport(artifact));
    const modelProjection = buildModelArtifactServingProjection({
      evaluation: artifact,
      sourceEvaluationPath: repoDisplayPath(outputPath),
    });
    await mkdir(dirname(modelProjectionOutputPath), { recursive: true });
    await writeJson(modelProjectionOutputPath, modelProjection);
    await mkdir(dirname(studioModelProjectionOutputPath), { recursive: true });
    await writeJson(studioModelProjectionOutputPath, modelProjection);

    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      markdownOutputPath: repoDisplayPath(markdownOutputPath),
      modelProjectionOutputPath: repoDisplayPath(modelProjectionOutputPath),
      studioModelProjectionOutputPath: repoDisplayPath(studioModelProjectionOutputPath),
      detectorCount: artifact.summary.detectorCount,
      scorecardCount: artifact.summary.scorecardCount,
      positiveOnlyGoldSet: artifact.summary.positiveOnlyGoldSet,
      portfolioPreGateScore: artifact.summary.portfolioPreGateScore,
      portfolioGatedScore: artifact.summary.portfolioGatedScore,
    };
  },
});

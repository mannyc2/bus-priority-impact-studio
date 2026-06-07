import { join } from "node:path";
import { STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY } from "@bp/domain/studio/snapshots";

export type DetectorEvaluationInputArtifactPaths = {
  readonly reviewDecisions: string;
  readonly promotedFindings: string;
  readonly reviewPackets: string;
  readonly reviewPacketCoverage: string;
  readonly reviewQueue: string;
  readonly promotionQueue: string;
  readonly goldSetEvaluation: string;
  readonly readiness: string;
  readonly detectorCoverageAudit: string;
  readonly ewtScoreVectors: string;
  readonly speedPaceScoreVectors: string;
  readonly runtimeTrendScoreVectors: string;
  readonly detectorScoreVectors: string;
  readonly evaluationLabels: string;
  readonly grainAudit: string;
  readonly segmentSpeedResiduals: string;
  readonly segmentDaypartResiduals: string;
  readonly routePeerResiduals: string;
  readonly reliabilityExposurePanel: string;
  readonly interventionScopeFit: string;
  readonly sourceGapModel: string;
  readonly treatmentEventPanel: string;
  readonly pulseFingerprint: string;
  readonly decouplingQuadrants: string;
};

export function detectorEvaluationArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-evaluation",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "detector-evaluation.json",
  );
}

export function detectorEvaluationMarkdownPath(jsonPath: string): string {
  return jsonPath.replace(/\.json$/, ".md");
}

export function modelArtifactServingProjectionPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "model-artifact-serving-projection",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "model-artifacts.json",
  );
}

export function modelArtifactServingProjectionStudioPath(input: {
  readonly artifactRoot: string;
}): string {
  return join(input.artifactRoot, STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY);
}

export function detectorEvaluationInputArtifactPaths(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): DetectorEvaluationInputArtifactPaths {
  const findingsRoot = join(input.artifactRoot, "findings", input.releaseMonth);
  const historyWindow = `${input.historyStartMonth}_to_${input.releaseMonth}`;

  return {
    reviewDecisions: join(findingsRoot, "review-decisions.json"),
    promotedFindings: join(findingsRoot, "promoted-findings.json"),
    reviewPackets: join(findingsRoot, "review-packets.json"),
    reviewPacketCoverage: join(findingsRoot, "review-packet-coverage.json"),
    reviewQueue: join(findingsRoot, "review-queue.json"),
    promotionQueue: join(findingsRoot, "promotion-queue.json"),
    goldSetEvaluation: join(findingsRoot, "gold-set-evaluation.json"),
    readiness: join(
      input.artifactRoot,
      "analytics-detector-readiness",
      historyWindow,
      "readiness.json",
    ),
    detectorCoverageAudit: join(findingsRoot, "detector-coverage-audit.json"),
    ewtScoreVectors: join(
      input.artifactRoot,
      "analytics-ewt-score-vectors",
      historyWindow,
      input.releaseMonth,
      "ewt-route-month-score-vectors.json",
    ),
    speedPaceScoreVectors: join(
      input.artifactRoot,
      "speed-pace-score-vectors",
      historyWindow,
      input.releaseMonth,
      "speed-pace-score-vectors.json",
    ),
    runtimeTrendScoreVectors: join(
      input.artifactRoot,
      "runtime-trend-score-vectors",
      historyWindow,
      input.releaseMonth,
      "runtime-trend-score-vectors.json",
    ),
    detectorScoreVectors: join(
      input.artifactRoot,
      "detector-score-vectors",
      historyWindow,
      input.releaseMonth,
      "detector-score-vectors.json",
    ),
    evaluationLabels: join(
      input.artifactRoot,
      "detector-evaluation",
      historyWindow,
      input.releaseMonth,
      "detector-evaluation-labels.json",
    ),
    grainAudit: join(
      input.artifactRoot,
      "detector-corpus-grain",
      historyWindow,
      input.releaseMonth,
      "grain-audit.json",
    ),
    segmentSpeedResiduals: join(
      input.artifactRoot,
      "analytics-models",
      "segment-speed-residuals-v1",
      historyWindow,
      input.releaseMonth,
      "segment-speed-residuals.json",
    ),
    segmentDaypartResiduals: join(
      input.artifactRoot,
      "analytics-models",
      "segment-daypart-residuals-v1",
      historyWindow,
      input.releaseMonth,
      "segment-daypart-residuals.json",
    ),
    routePeerResiduals: join(
      input.artifactRoot,
      "analytics-models",
      "route-peer-residuals-v1",
      historyWindow,
      input.releaseMonth,
      "route-peer-residuals.json",
    ),
    reliabilityExposurePanel: join(
      input.artifactRoot,
      "analytics-models",
      "reliability-exposure-panel-v1",
      input.releaseMonth,
      `bus-observatory-${input.releaseMonth}`,
      "reliability-exposure-panel.json",
    ),
    interventionScopeFit: join(
      input.artifactRoot,
      "analytics-models",
      "intervention-scope-fit-v1",
      input.releaseMonth,
      "intervention-scope-fit.json",
    ),
    sourceGapModel: join(
      input.artifactRoot,
      "analytics-models",
      "source-gap-model-v1",
      input.releaseMonth,
      "source-gap-model.json",
    ),
    treatmentEventPanel: join(
      input.artifactRoot,
      "analytics-models",
      "treatment-event-panel-v1",
      historyWindow,
      input.releaseMonth,
      "treatment-event-panel.json",
    ),
    pulseFingerprint: join(
      input.artifactRoot,
      "analytics-models",
      "pulse-fingerprint-v1",
      historyWindow,
      input.releaseMonth,
      "pulse-fingerprint.json",
    ),
    decouplingQuadrants: join(
      input.artifactRoot,
      "analytics-models",
      "decoupling-quadrants-v1",
      historyWindow,
      input.releaseMonth,
      "decoupling-quadrants.json",
    ),
  };
}

import type { DetectorEvaluationArtifact } from "./detector-artifact";

export type ModelArtifactServingProjectionRow = {
  readonly modelId: string;
  readonly status: "available" | "missing";
  readonly panelId: string | null;
  readonly releaseMonth: string | null;
  readonly modeledReleaseRowCount: number;
  readonly routeCount: number;
  readonly segmentCount: number;
  readonly detectorConsumers: readonly string[];
  readonly limitations: readonly string[];
};

export type ModelArtifactServingProjection = {
  readonly artifactKind: "model_artifact_serving_projection";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: DetectorEvaluationArtifact["historyWindow"];
  readonly sourceEvaluationPath: string;
  readonly summary: {
    readonly modelCount: number;
    readonly availableModelCount: number;
    readonly missingModelCount: number;
    readonly detectorConsumerCount: number;
  };
  readonly models: readonly ModelArtifactServingProjectionRow[];
};

export function buildModelArtifactServingProjection(input: {
  readonly evaluation: DetectorEvaluationArtifact;
  readonly sourceEvaluationPath: string;
}): ModelArtifactServingProjection {
  const models = input.evaluation.modelArtifacts.map(
    (model): ModelArtifactServingProjectionRow => ({
      modelId: model.modelId,
      status: model.status,
      panelId: model.panelId,
      releaseMonth: model.releaseMonth,
      modeledReleaseRowCount: model.modeledReleaseRowCount,
      routeCount: model.routeCount,
      segmentCount: model.segmentCount,
      detectorConsumers: [...model.detectorConsumers],
      limitations: [...model.limitations],
    }),
  );

  return {
    artifactKind: "model_artifact_serving_projection",
    schemaVersion: 1,
    generatedAt: input.evaluation.generatedAt,
    releaseMonth: input.evaluation.releaseMonth,
    historyWindow: input.evaluation.historyWindow,
    sourceEvaluationPath: input.sourceEvaluationPath,
    summary: {
      modelCount: models.length,
      availableModelCount: models.filter((model) => model.status === "available").length,
      missingModelCount: models.filter((model) => model.status === "missing").length,
      detectorConsumerCount: new Set(models.flatMap((model) => model.detectorConsumers)).size,
    },
    models,
  };
}

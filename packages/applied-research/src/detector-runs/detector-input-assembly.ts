import { featureContractsForGrains } from "@bp/analytics/features";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import {
  interventionScopeFitArtifactPath,
  loadRouteTreatmentFeaturesFromArtifact,
  loadStopDirectionHourFeaturesFromArtifacts,
  reliabilityExposurePanelArtifactPath,
  routePeerResidualsArtifactPath,
  segmentDaypartResidualsArtifactPath,
  segmentSpeedResidualsArtifactPath,
  sourceGapModelArtifactPath,
  treatmentEventPanelArtifactPath,
} from "../artifacts";
import type {
  InterventionScopeFitArtifactV1,
  ReliabilityExposurePanelArtifactV1,
  RoutePeerResidualArtifactV1,
  SegmentDaypartResidualArtifactV1,
  SegmentSpeedResidualArtifactV1,
  SourceGapModelArtifactV1,
  TreatmentEventPanelArtifactV1,
} from "../feature-resolvers";
import type { DetectorStudySourceRows } from "./detector-study";

export type DetectorInputAssemblyContext = {
  readonly detectorId: string;
  readonly artifactRoot: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly observedRunId: string;
  readonly routeId?: string;
};

type MutableDetectorStudySourceRows = {
  -readonly [Key in keyof DetectorStudySourceRows]: DetectorStudySourceRows[Key];
};

type DetectorInputResolver = {
  readonly resolverId: string;
  resolve(input: {
    readonly context: DetectorInputAssemblyContext;
    readonly rows: MutableDetectorStudySourceRows;
  }): Promise<void>;
};

function routeMatches(
  routeId: string | undefined,
  row: { readonly routeId: string | null },
): boolean {
  return routeId === undefined || row.routeId === routeId;
}

function treatmentEventMatches(
  routeId: string | undefined,
  row: { readonly treatedScopeKind: string; readonly treatedScopeId: string },
): boolean {
  return (
    routeId === undefined || (row.treatedScopeKind === "route" && row.treatedScopeId === routeId)
  );
}

async function loadRowsArtifact<Artifact extends { readonly rows: readonly unknown[] }>(
  artifactPath: string,
): Promise<Artifact | null> {
  const file = Bun.file(artifactPath);
  return (await file.exists()) ? ((await file.json()) as Artifact) : null;
}

function modelArtifactPath(input: DetectorInputAssemblyContext, modelId: string): string | null {
  switch (modelId) {
    case "segment_daypart_residuals_v1":
      return segmentDaypartResidualsArtifactPath({
        artifactRoot: input.artifactRoot,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        releaseMonth: input.releaseMonth,
      });
    case "route_peer_residuals_v1":
      return routePeerResidualsArtifactPath({
        artifactRoot: input.artifactRoot,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        releaseMonth: input.releaseMonth,
      });
    case "segment_speed_residuals_v1":
      return segmentSpeedResidualsArtifactPath({
        artifactRoot: input.artifactRoot,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        releaseMonth: input.releaseMonth,
      });
    case "reliability_exposure_panel_v1":
      return reliabilityExposurePanelArtifactPath({
        artifactRoot: input.artifactRoot,
        releaseMonth: input.releaseMonth,
        runId: input.observedRunId,
      });
    case "intervention_scope_fit_v1":
      return interventionScopeFitArtifactPath({
        artifactRoot: input.artifactRoot,
        month: input.releaseMonth,
      });
    case "source_gap_model_v1":
      return sourceGapModelArtifactPath({
        artifactRoot: input.artifactRoot,
        month: input.releaseMonth,
      });
    case "treatment_event_panel_v1":
      return treatmentEventPanelArtifactPath({
        artifactRoot: input.artifactRoot,
        historyStartMonth: input.historyStartMonth,
        releaseMonth: input.releaseMonth,
      });
    default:
      return null;
  }
}

const RELIABILITY_EXPOSURE_PANEL_RESOLVER: DetectorInputResolver = {
  resolverId: "reliability_exposure_panel_v1",
  async resolve({ context, rows }) {
    const path = modelArtifactPath(context, "reliability_exposure_panel_v1");
    if (path === null) return;
    const artifact = await loadRowsArtifact<ReliabilityExposurePanelArtifactV1>(path);
    if (artifact === null) return;
    rows.reliabilityExposurePanelRows = artifact.rows.filter((row) =>
      routeMatches(context.routeId, row),
    );
  },
};

const TREATMENT_EVENT_PANEL_RESOLVER: DetectorInputResolver = {
  resolverId: "treatment_event_panel_v1",
  async resolve({ context, rows }) {
    const path = modelArtifactPath(context, "treatment_event_panel_v1");
    if (path === null) return;
    const artifact = await loadRowsArtifact<TreatmentEventPanelArtifactV1>(path);
    if (artifact === null) return;
    rows.treatmentEventPanelRows = artifact.rows.filter((row) =>
      treatmentEventMatches(context.routeId, row),
    );
  },
};

const MODEL_ARTIFACT_RESOLVERS: Readonly<Record<string, DetectorInputResolver>> = {
  segment_daypart_residuals_v1: {
    resolverId: "segment_daypart_residuals_v1",
    async resolve({ context, rows }) {
      const path = modelArtifactPath(context, "segment_daypart_residuals_v1");
      if (path === null) return;
      const artifact = await loadRowsArtifact<SegmentDaypartResidualArtifactV1>(path);
      if (artifact === null) return;
      rows.segmentDaypartResidualRows = artifact.rows.filter((row) =>
        routeMatches(context.routeId, row),
      );
    },
  },
  route_peer_residuals_v1: {
    resolverId: "route_peer_residuals_v1",
    async resolve({ context, rows }) {
      const path = modelArtifactPath(context, "route_peer_residuals_v1");
      if (path === null) return;
      const artifact = await loadRowsArtifact<RoutePeerResidualArtifactV1>(path);
      if (artifact === null) return;
      rows.routePeerResidualRows = artifact.rows.filter((row) =>
        routeMatches(context.routeId, row),
      );
    },
  },
  segment_speed_residuals_v1: {
    resolverId: "segment_speed_residuals_v1",
    async resolve({ context, rows }) {
      const path = modelArtifactPath(context, "segment_speed_residuals_v1");
      if (path === null) return;
      const artifact = await loadRowsArtifact<SegmentSpeedResidualArtifactV1>(path);
      if (artifact === null) return;
      rows.segmentSpeedResidualRows = artifact.rows.filter((row) =>
        routeMatches(context.routeId, row),
      );
    },
  },
  reliability_exposure_panel_v1: RELIABILITY_EXPOSURE_PANEL_RESOLVER,
  intervention_scope_fit_v1: {
    resolverId: "intervention_scope_fit_v1",
    async resolve({ context, rows }) {
      const path = modelArtifactPath(context, "intervention_scope_fit_v1");
      if (path === null) return;
      const artifact = await loadRowsArtifact<InterventionScopeFitArtifactV1>(path);
      if (artifact === null) return;
      rows.interventionScopeFitRows = artifact.rows.filter((row) =>
        routeMatches(context.routeId, row),
      );
    },
  },
  source_gap_model_v1: {
    resolverId: "source_gap_model_v1",
    async resolve({ context, rows }) {
      const path = modelArtifactPath(context, "source_gap_model_v1");
      if (path === null) return;
      const artifact = await loadRowsArtifact<SourceGapModelArtifactV1>(path);
      if (artifact === null) return;
      rows.sourceGapModelRows = artifact.rows.filter((row) => routeMatches(context.routeId, row));
    },
  },
  treatment_event_panel_v1: TREATMENT_EVENT_PANEL_RESOLVER,
};

const FEATURE_RESOLVERS: Readonly<Record<string, DetectorInputResolver>> = {
  "artifact.stop_direction_hour_ewt_features.v1": {
    resolverId: "artifact.stop_direction_hour_ewt_features.v1",
    async resolve({ context, rows }) {
      if (rows.reliabilityExposurePanelRows !== undefined) return;
      const loaded = await loadStopDirectionHourFeaturesFromArtifacts({
        artifactRoot: context.artifactRoot,
        month: context.releaseMonth,
        runId: context.observedRunId,
        ...(context.routeId === undefined ? {} : { routeId: context.routeId }),
      });
      rows.stopDirectionHourFeatures = loaded.features;
      rows.stopDirectionHourSummary = loaded.summary;
    },
  },
  "artifact.rider_weighted_excess_wait.v1": {
    resolverId: "artifact.rider_weighted_excess_wait.v1",
    async resolve(input) {
      await RELIABILITY_EXPOSURE_PANEL_RESOLVER.resolve(input);
    },
  },
  "artifact.route_treatment_summary.route.v1": {
    resolverId: "artifact.route_treatment_summary.route.v1",
    resolve: resolveRouteTreatmentFeatures,
  },
  "artifact.route_treatment_summary.segment.v1": {
    resolverId: "artifact.route_treatment_summary.segment.v1",
    resolve: resolveRouteTreatmentFeatures,
  },
  "artifact.route_treatment_summary.source_gap.v1": {
    resolverId: "artifact.route_treatment_summary.source_gap.v1",
    resolve: resolveRouteTreatmentFeatures,
  },
  "artifact.intervention_panel.v1": {
    resolverId: "artifact.intervention_panel.v1",
    async resolve(input) {
      await TREATMENT_EVENT_PANEL_RESOLVER.resolve(input);
    },
  },
};

async function resolveRouteTreatmentFeatures(input: {
  readonly context: DetectorInputAssemblyContext;
  readonly rows: MutableDetectorStudySourceRows;
}): Promise<void> {
  if (
    input.rows.routeTreatmentFeatures !== undefined ||
    input.rows.routeSegmentTreatmentFeatures !== undefined ||
    input.rows.routeTreatmentSourceGapFeatures !== undefined
  ) {
    return;
  }
  const loaded = await loadRouteTreatmentFeaturesFromArtifact({
    artifactRoot: input.context.artifactRoot,
    month: input.context.releaseMonth,
    ...(input.context.routeId === undefined ? {} : { routeId: input.context.routeId }),
  });
  input.rows.routeTreatmentFeatures = loaded.routeTreatmentFeatures;
  input.rows.routeSegmentTreatmentFeatures = loaded.routeSegmentTreatmentFeatures;
  input.rows.routeTreatmentSourceGapFeatures = loaded.routeTreatmentSourceGapFeatures;
  input.rows.routeTreatmentFeatureSummary = loaded.summary;
}

function orderedResolverIds(input: {
  readonly detectorId: string;
  readonly modelArtifacts: readonly string[];
  readonly featureGrains: readonly string[];
}): string[] {
  return [
    ...new Set([
      ...input.modelArtifacts,
      ...featureContractsForGrains(input.featureGrains)
        .filter((contract) => contract.materializationKind !== "sqlite_table")
        .map((contract) => contract.resolverId),
    ]),
  ];
}

export async function assembleDetectorStudySourceRows(input: {
  readonly context: DetectorInputAssemblyContext;
  readonly localRows: DetectorStudySourceRows;
}): Promise<DetectorStudySourceRows> {
  const detector = getAnalyticsDetector(input.context.detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${input.context.detectorId}`);

  const rows: MutableDetectorStudySourceRows = { ...input.localRows };
  for (const resolverId of orderedResolverIds({
    detectorId: detector.detectorId,
    modelArtifacts: detector.modelArtifacts ?? [],
    featureGrains: detector.featureGrains,
  })) {
    const resolver = MODEL_ARTIFACT_RESOLVERS[resolverId] ?? FEATURE_RESOLVERS[resolverId];
    if (resolver === undefined) continue;
    await resolver.resolve({ context: input.context, rows });
  }
  return rows;
}

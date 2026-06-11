import type { Database } from "bun:sqlite";
import { join } from "node:path";
import type { FeatureContractSatisfaction } from "@bp/analytics/core";
import { DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS } from "@bp/analytics/detectors";
import { featureContractsForGrains } from "@bp/analytics/features";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import { FindingSignalFeaturesArtifactSchema } from "@bp/domain/findings";
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
import { buildCustomerJourneyFeaturesFromMetricRows } from "../feature-resolvers/customer-journey";
import { buildPositiveDevianceFeatures } from "../feature-resolvers/detector-family-features";
import { loadCustomerJourneyMetricLocalDbRows } from "../local-db/customer-journey-rows";
import { loadRouteMonthSignalFeatureLocalDbRows } from "../local-db/detector-study-rows";
import type { DetectorStudySourceRows } from "./detector-study";

export type DetectorInputAssemblyContext = {
  readonly detectorId: string;
  readonly artifactRoot: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly observedRunId: string;
  readonly routeId?: string;
  readonly sqlite?: Database;
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

export type DetectorInputResolverSupport = Pick<FeatureContractSatisfaction, "status" | "reason">;

export type DetectorInputAssemblyResult = {
  readonly rows: DetectorStudySourceRows;
  readonly featureContracts: readonly FeatureContractSatisfaction[];
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

function signalFeaturesArtifactPath(input: DetectorInputAssemblyContext): string {
  return join(input.artifactRoot, "findings", input.releaseMonth, "signal-features.json");
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
  "artifact.signal_features.route_month.v1": {
    resolverId: "artifact.signal_features.route_month.v1",
    async resolve({ context, rows }) {
      if (rows.routeMonthSignalFeatures !== undefined) return;
      const file = Bun.file(signalFeaturesArtifactPath(context));
      if (!(await file.exists())) return;
      const artifact = FindingSignalFeaturesArtifactSchema.parse(await file.json());
      rows.routeMonthSignalFeatures = artifact.features.filter(
        (feature) => context.routeId === undefined || feature.routeId === context.routeId,
      );
      rows.routeMonthSignalFeatureSummary = {
        sourceKind: "route_month_signal_features_artifact",
        ...artifact.summary,
      };
    },
  },
  "sqlite.local_context_event_route_touch.month.v1": {
    resolverId: "sqlite.local_context_event_route_touch.month.v1",
    async resolve({ context, rows }) {
      if (context.sqlite === undefined || rows.routeMonthSignalFeatures !== undefined) return;
      const loaded = loadRouteMonthSignalFeatureLocalDbRows({
        sqlite: context.sqlite,
        month: context.releaseMonth,
        ...(context.routeId === undefined ? {} : { routeId: context.routeId }),
      });
      rows.routeMonthSignalFeatures = loaded.features;
      rows.routeMonthSignalFeatureSummary = loaded.summary;
    },
  },
  "sqlite.local_bus_customer_journey_metric.v1": {
    resolverId: "sqlite.local_bus_customer_journey_metric.v1",
    async resolve({ context, rows }) {
      if (context.sqlite === undefined || rows.customerJourneyFeatures !== undefined) return;
      const sourceRows = loadCustomerJourneyMetricLocalDbRows({
        sqlite: context.sqlite,
        historyStartMonth: context.historyStartMonth,
      });
      const resolved = buildCustomerJourneyFeaturesFromMetricRows({ rows: sourceRows });
      rows.customerJourneyMetricRows = sourceRows;
      rows.customerJourneyFeatures = resolved.features;
      rows.customerJourneyRouteRollups = resolved.rollups;
      rows.customerJourneySummary = resolved.summary;
    },
  },
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
  "artifact.positive_deviance.v1": {
    resolverId: "artifact.positive_deviance.v1",
    async resolve({ context, rows }) {
      if (rows.positiveDevianceFeatures !== undefined) return;
      if (rows.routeMetricHistoryRows === undefined) return;
      const resolved = buildPositiveDevianceFeatures({
        rows: rows.routeMetricHistoryRows,
        releaseMonth: context.releaseMonth,
        minPeerCount: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.minPeerCount,
        minStablePeriods: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.minStablePeriods,
      });
      rows.positiveDevianceFeatures = resolved.features;
      rows.positiveDevianceSummary = resolved.summary;
    },
  },
};

function localRowResolver(resolverId: string): DetectorInputResolver {
  return {
    resolverId,
    async resolve() {
      // Local SQLite rows are loaded before artifact assembly; this registration makes that
      // resolver path visible to the kernel contract audit.
    },
  };
}

const LOCAL_ROW_RESOLVERS: Readonly<Record<string, DetectorInputResolver>> = Object.fromEntries(
  [
    "sqlite.local_route_segment_speed.segment_daypart.v1",
    "sqlite.local_route_segment_speed.route_segment_month.v1",
    "sqlite.local_route_observed_reliability_summary.v1",
    "sqlite.route_direction_daypart.v1",
    "sqlite.local_route_month_trend.history.v1",
    "sqlite.local_route_intervention_comparison.window.v1",
  ].map((resolverId) => [resolverId, localRowResolver(resolverId)]),
);

const QUALITY_CARRIED_FEATURE_RESOLVER_IDS: ReadonlySet<string> = new Set([
  "embedded.feature_quality.v1",
  "sqlite.source_coverage.v1",
]);

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
        .filter((contract) => contract.materializationKind !== "embedded_quality_gate")
        .map((contract) => contract.resolverId),
    ]),
  ];
}

function featureResolverFor(resolverId: string): DetectorInputResolver | undefined {
  return FEATURE_RESOLVERS[resolverId] ?? LOCAL_ROW_RESOLVERS[resolverId];
}

export function listDetectorInputFeatureResolverIds(): string[] {
  return [
    ...new Set([
      ...Object.keys(FEATURE_RESOLVERS),
      ...Object.keys(LOCAL_ROW_RESOLVERS),
      ...QUALITY_CARRIED_FEATURE_RESOLVER_IDS,
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

export function detectorInputFeatureResolverSupport(
  resolverId: string,
): DetectorInputResolverSupport {
  if (QUALITY_CARRIED_FEATURE_RESOLVER_IDS.has(resolverId)) {
    return {
      status: "satisfied_by_feature_quality",
      reason:
        "Carried through feature-quality coverage/freshness/sample fields rather than a dedicated row resolver.",
    };
  }
  if (featureResolverFor(resolverId) !== undefined) {
    return {
      status: "resolved",
      reason:
        "Supplied by a registered applied-research detector-input resolver or local-row loader.",
    };
  }
  return {
    status: "unsupported",
    reason: "No applied-research detector-input resolver supplies this feature grain.",
  };
}

export function detectorInputFeatureContractSatisfaction(input: {
  readonly detectorId: string;
}): FeatureContractSatisfaction[] {
  const detector = getAnalyticsDetector(input.detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${input.detectorId}`);
  return featureContractsForGrains(detector.featureGrains).map((contract) => {
    const support = detectorInputFeatureResolverSupport(contract.resolverId);
    return {
      featureGrain: contract.featureGrain,
      resolverId: contract.resolverId,
      status: support.status,
      reason: support.reason,
    };
  });
}

export async function assembleDetectorStudyInput(input: {
  readonly context: DetectorInputAssemblyContext;
  readonly localRows: DetectorStudySourceRows;
}): Promise<DetectorInputAssemblyResult> {
  const detector = getAnalyticsDetector(input.context.detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${input.context.detectorId}`);

  const rows: MutableDetectorStudySourceRows = { ...input.localRows };
  for (const resolverId of orderedResolverIds({
    detectorId: detector.detectorId,
    modelArtifacts: detector.modelArtifacts ?? [],
    featureGrains: detector.featureGrains,
  })) {
    const resolver = MODEL_ARTIFACT_RESOLVERS[resolverId] ?? featureResolverFor(resolverId);
    if (resolver === undefined) continue;
    await resolver.resolve({ context: input.context, rows });
  }
  return {
    rows,
    featureContracts: detectorInputFeatureContractSatisfaction({ detectorId: detector.detectorId }),
  };
}

export async function assembleDetectorStudySourceRows(input: {
  readonly context: DetectorInputAssemblyContext;
  readonly localRows: DetectorStudySourceRows;
}): Promise<DetectorStudySourceRows> {
  return (await assembleDetectorStudyInput(input)).rows;
}

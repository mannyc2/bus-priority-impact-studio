import { summarizeInterventionGates } from "@bp/analytics/calibration";
import {
  type FeatureContractSatisfaction,
  type FeatureResolver,
  runAnalyticsDetector,
} from "@bp/analytics/core";
import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID,
  DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
  DEFAULT_CUSTOMER_JOURNEY_SHORTFALL_THRESHOLDS,
  DEFAULT_DEGRADATION_TREND_THRESHOLDS,
  DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
  DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS,
  DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS,
  DEFAULT_INTERVENTION_GAP_THRESHOLDS,
  DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
  DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
  DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
  DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS,
  DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS,
  DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS,
  DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS,
  DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
  DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
  DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS,
  DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
  DEFAULT_TREATMENT_SCOPE_GAP_THRESHOLDS,
  DEFAULT_TREATMENT_SCOPE_MISMATCH_THRESHOLDS,
  DEGRADATION_TREND_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  INTERVENTION_GAP_DETECTOR_ID,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
  type MultiMonthSpeedPeerRouteInput,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  type ObservedReliabilityRouteInput,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
  type PersistentSpeedHotspotRouteInput,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  SOURCE_GAP_DETECTOR_ID,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
  TREATMENT_SCOPE_GAP_DETECTOR_ID,
  TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
} from "@bp/analytics/detectors";
import type {
  CustomerJourneyFeature,
  InterventionPanelFeature,
  StopDirectionHourFeature,
} from "@bp/analytics/features";
import {
  featureContractsForGrains,
  ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN,
  ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN,
  ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN,
  type RouteSegmentTreatmentSummaryFeature,
  type RouteTreatmentSourceGapFeature,
  type RouteTreatmentSummaryFeature,
} from "@bp/analytics/features";
import type {
  DetectorClaimTier,
  DetectorModelArtifactId,
  RegisteredAnalyticsDetector,
} from "@bp/analytics/registry";
import { getAnalyticsDetector, listAnalyticsDetectors } from "@bp/analytics/registry";
import {
  FindingCoverageAuditSchema,
  FindingReasonCodeSchema,
  type RouteMonthSignalFeature,
} from "@bp/domain/findings";
import type {
  CustomerJourneyMetricSourceRow,
  CustomerJourneyRouteRollup,
} from "../feature-resolvers/customer-journey";
import type { DecouplingQuadrantRow } from "../feature-resolvers/decoupling-quadrants";
import {
  buildDelayConcentrationRoutes,
  buildPositiveDevianceFeatures,
  type DelayConcentrationSegmentSourceRow,
  type InterventionComparisonSourceRow,
  type RouteHourlyRidershipSourceRow,
} from "../feature-resolvers/detector-family-features";
import type { InterventionScopeFitRow } from "../feature-resolvers/intervention-scope-fit";
import type { PulseFingerprintRow } from "../feature-resolvers/pulse-fingerprint";
import {
  buildRiderWeightedExcessWaitFeaturesFromReliabilityExposurePanelRows,
  type ReliabilityExposurePanelRow,
} from "../feature-resolvers/reliability-exposure-panel";
import type { RoutePeerResidualRow } from "../feature-resolvers/route-peer-residuals";
import {
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
  type ObservedRuntimeSourceRow,
  type RouteMetricHistorySourceRow,
  type ScheduledRuntimeSourceRow,
} from "../feature-resolvers/runtime-history";
import type { SegmentDaypartResidualRow } from "../feature-resolvers/segment-daypart-residuals";
import {
  buildSegmentDaypartFeaturesFromSpeedRows,
  type SegmentDaypartSpeedSourceRow,
} from "../feature-resolvers/segment-daypart-speed";
import type { SegmentSpeedResidualRow } from "../feature-resolvers/segment-month-panel";
import type { SourceGapModelRow } from "../feature-resolvers/source-gap-model";
import {
  buildInterventionGapRoutesFromSourceGapModelRows,
  buildInterventionUnderperformanceRoutesFromTreatmentFeatures,
  buildTreatmentScopeGapSegmentsFromTreatmentFeatures,
  buildTreatmentScopeMismatchSegmentsFromTreatmentFeatures,
  type RoutePainSourceRow,
  type RouteSegmentDaypartSpeedSummarySourceRow,
  type RouteSegmentHistoricalSpeedSummarySourceRow,
  type RouteSegmentSpeedSummarySourceRow,
} from "../feature-resolvers/treatment-detector-inputs";
import { featureResolverSupport } from "./feature-resolver-support";
import {
  buildRegistryDetectorRunArtifact,
  type DetectorOutput,
  type ModelArtifactDependency,
  type RegistryDetectorRunArtifact,
} from "./run-artifact";

export const DEFAULT_REGISTRY_DETECTOR_STUDY_ID = SPEED_PACE_HOTSPOT_DETECTOR_ID;

const STOP_DIRECTION_HOUR_DETECTOR_IDS = new Set<string>([
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
]);

export type DetectorStudyMetadata = {
  readonly detectorId: string;
  readonly detectorRunId: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly wroteDb: boolean;
  readonly candidateLimit?: number;
};

export type DetectorStudySourceRows = {
  readonly speedRows?: readonly SegmentDaypartSpeedSourceRow[];
  readonly stopDirectionHourFeatures?: readonly StopDirectionHourFeature[];
  readonly stopDirectionHourSummary?: Record<string, unknown>;
  readonly routeHourlyRidershipRows?: readonly RouteHourlyRidershipSourceRow[];
  readonly reliabilityExposurePanelRows?: readonly ReliabilityExposurePanelRow[];
  readonly observedRuntimeRows?: readonly ObservedRuntimeSourceRow[];
  readonly scheduledRuntimeRows?: readonly ScheduledRuntimeSourceRow[];
  readonly routeMetricHistoryRows?: readonly RouteMetricHistorySourceRow[];
  readonly interventionComparisonRows?: readonly InterventionComparisonSourceRow[];
  readonly treatmentEventPanelRows?: readonly InterventionPanelFeature[];
  readonly delayConcentrationSegmentRows?: readonly DelayConcentrationSegmentSourceRow[];
  readonly routePainRows?: readonly RoutePainSourceRow[];
  readonly routeSegmentSpeedSummaryRows?: readonly RouteSegmentSpeedSummarySourceRow[];
  readonly routeSegmentDaypartSpeedSummaryRows?: readonly RouteSegmentDaypartSpeedSummarySourceRow[];
  readonly routeSegmentHistoricalSpeedSummaryRows?: readonly RouteSegmentHistoricalSpeedSummarySourceRow[];
  readonly segmentSpeedResidualRows?: readonly SegmentSpeedResidualRow[];
  readonly segmentDaypartResidualRows?: readonly SegmentDaypartResidualRow[];
  readonly routePeerResidualRows?: readonly RoutePeerResidualRow[];
  readonly routeTreatmentFeatures?: readonly RouteTreatmentSummaryFeature[];
  readonly routeSegmentTreatmentFeatures?: readonly RouteSegmentTreatmentSummaryFeature[];
  readonly routeTreatmentSourceGapFeatures?: readonly RouteTreatmentSourceGapFeature[];
  readonly interventionScopeFitRows?: readonly InterventionScopeFitRow[];
  readonly sourceGapModelRows?: readonly SourceGapModelRow[];
  readonly pulseFingerprintRows?: readonly PulseFingerprintRow[];
  readonly decouplingQuadrantRows?: readonly DecouplingQuadrantRow[];
  readonly customerJourneyMetricRows?: readonly CustomerJourneyMetricSourceRow[];
  readonly customerJourneyFeatures?: readonly CustomerJourneyFeature[];
  readonly customerJourneyRouteRollups?: readonly CustomerJourneyRouteRollup[];
  readonly customerJourneySummary?: Record<string, unknown>;
  readonly persistentSpeedHotspotRoutes?: readonly PersistentSpeedHotspotRouteInput[];
  readonly multiMonthSpeedPeerRoutes?: readonly MultiMonthSpeedPeerRouteInput[];
  readonly observedReliabilityRoutes?: readonly ObservedReliabilityRouteInput[];
  readonly routeMonthSignalFeatures?: readonly RouteMonthSignalFeature[];
  readonly routeMonthSignalFeatureSummary?: Record<string, unknown>;
  readonly routeTreatmentFeatureSummary?: Record<string, unknown>;
};

export type RegistryDetectorStudyResult = {
  readonly artifact: RegistryDetectorRunArtifact;
  readonly output: DetectorOutput;
};

export type DetectorStudyCatalogRow = {
  readonly detectorId: string;
  readonly claimTier: DetectorClaimTier;
  readonly featureGrains: readonly string[];
};

export function listDetectorStudyCatalogRows(): DetectorStudyCatalogRow[] {
  return listAnalyticsDetectors().map((detector) => ({
    detectorId: detector.detectorId,
    claimTier: detector.claimTier,
    featureGrains: [...detector.featureGrains],
  }));
}

export function detectorStudyNeedsStopDirectionHourFeatures(detectorId: string): boolean {
  return STOP_DIRECTION_HOUR_DETECTOR_IDS.has(detectorId);
}

export function detectorStudyNeedsRouteTreatmentFeatures(detectorId: string): boolean {
  const detector = getAnalyticsDetector(detectorId);
  if (detector === null) return false;
  return detector.featureGrains.some(
    (grain) =>
      grain === ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN ||
      grain === ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN ||
      grain === ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN,
  );
}

function requireRows<T>(
  rows: readonly T[] | undefined,
  detectorId: string,
  sourceName: string,
): readonly T[] {
  if (rows !== undefined) return rows;
  throw new Error(`Missing ${sourceName} for ${detectorId} detector study.`);
}

export function detectorStudyFeatureContractSatisfaction(input: {
  readonly detectorId: string;
}): FeatureContractSatisfaction[] {
  const detector = getAnalyticsDetector(input.detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${input.detectorId}`);
  return featureContractsForGrains(detector.featureGrains).map((contract) => {
    const support = featureResolverSupport(contract.resolverId);
    return {
      featureGrain: contract.featureGrain,
      resolverId: contract.resolverId,
      status: support.status,
      reason: support.reason,
    };
  });
}

function detectorForStudy(detectorId: string): RegisteredAnalyticsDetector {
  const detector = getAnalyticsDetector(detectorId);
  if (detector === null) throw new Error(`Missing ${detectorId} registry row`);
  return detector;
}

function runResolvedDetectorStudy(input: {
  readonly metadata: DetectorStudyMetadata;
  readonly detectorInput: unknown;
  readonly inputSummary: Record<string, unknown>;
  readonly modelDependencies: readonly ModelArtifactDependency[];
}): RegistryDetectorStudyResult {
  const detector = detectorForStudy(input.metadata.detectorId);
  const featureContracts = detectorStudyFeatureContractSatisfaction({
    detectorId: input.metadata.detectorId,
  });
  const resolver: FeatureResolver<unknown> = {
    resolverId: "applied_research.detector_study_rows.v1",
    resolve: (request) => {
      if (request.detector.detectorId !== detector.detectorId) {
        throw new Error(
          `Resolver request detector ${request.detector.detectorId} did not match ${detector.detectorId}.`,
        );
      }
      return {
        detectorInput: input.detectorInput,
        inputSummary: input.inputSummary,
        featureContracts,
      };
    },
  };

  const run = runAnalyticsDetector({
    detector,
    resolver,
    context: {
      detectorRunId: input.metadata.detectorRunId,
      month: input.metadata.releaseMonth,
      generatedAt: input.metadata.generatedAt,
      scope: { kind: detector.scope.kind, scopeId: null },
    },
  });

  return {
    output: run.output,
    artifact: artifactFor({
      metadata: input.metadata,
      inputSummary: run.inputSummary,
      output: run.output,
      featureContracts: run.featureContracts,
      modelDependencies: input.modelDependencies,
    }),
  };
}

function artifactFor(input: {
  readonly metadata: DetectorStudyMetadata;
  readonly inputSummary: Record<string, unknown>;
  readonly output: DetectorOutput;
  readonly featureContracts: readonly FeatureContractSatisfaction[];
  readonly modelDependencies?: readonly ModelArtifactDependency[];
}): RegistryDetectorRunArtifact {
  return buildRegistryDetectorRunArtifact({
    detectorId: input.metadata.detectorId,
    detectorRunId: input.metadata.detectorRunId,
    releaseMonth: input.metadata.releaseMonth,
    generatedAt: input.metadata.generatedAt,
    dbPath: input.metadata.dbPath,
    artifactPath: input.metadata.artifactPath,
    wroteDb: input.metadata.wroteDb,
    inputSummary: input.inputSummary,
    output: input.output,
    featureContracts: input.featureContracts,
    ...(input.modelDependencies === undefined
      ? {}
      : { modelDependencies: input.modelDependencies }),
    ...(input.metadata.candidateLimit === undefined
      ? {}
      : { candidateSampleLimit: input.metadata.candidateLimit }),
  });
}

function modelRowsFor(input: {
  readonly modelId: DetectorModelArtifactId | string;
  readonly rows: DetectorStudySourceRows;
}): { readonly fieldName: string; readonly rows: readonly unknown[] | undefined } | null {
  switch (input.modelId) {
    case "segment_speed_residuals_v1":
      return { fieldName: "segmentSpeedResidualRows", rows: input.rows.segmentSpeedResidualRows };
    case "segment_daypart_residuals_v1":
      return {
        fieldName: "segmentDaypartResidualRows",
        rows: input.rows.segmentDaypartResidualRows,
      };
    case "route_peer_residuals_v1":
      return { fieldName: "routePeerResidualRows", rows: input.rows.routePeerResidualRows };
    case "reliability_exposure_panel_v1":
      return {
        fieldName: "reliabilityExposurePanelRows",
        rows: input.rows.reliabilityExposurePanelRows,
      };
    case "intervention_scope_fit_v1":
      return { fieldName: "interventionScopeFitRows", rows: input.rows.interventionScopeFitRows };
    case "source_gap_model_v1":
      return { fieldName: "sourceGapModelRows", rows: input.rows.sourceGapModelRows };
    case "treatment_event_panel_v1":
      return { fieldName: "treatmentEventPanelRows", rows: input.rows.treatmentEventPanelRows };
    case "pulse_fingerprint_v1":
      return { fieldName: "pulseFingerprintRows", rows: input.rows.pulseFingerprintRows };
    case "decoupling_quadrants_v1":
      return { fieldName: "decouplingQuadrantRows", rows: input.rows.decouplingQuadrantRows };
    default:
      return null;
  }
}

export function detectorModelDependencySatisfaction(input: {
  readonly detectorId: string;
  readonly rows: DetectorStudySourceRows;
}): ModelArtifactDependency[] {
  const detector = getAnalyticsDetector(input.detectorId);
  if (detector === null) throw new Error(`Unknown detector: ${input.detectorId}`);
  return (detector.modelArtifacts ?? []).map((modelId) => {
    const modelRows = modelRowsFor({ modelId, rows: input.rows });
    if (modelRows === null) {
      return {
        modelId,
        status: "missing",
        rowCount: null,
        reason: `No registry runner row slot is registered for required model artifact ${modelId}.`,
      };
    }
    if (modelRows.rows === undefined) {
      return {
        modelId,
        status: "missing",
        rowCount: null,
        reason: `Required model artifact ${modelId} was not supplied as ${modelRows.fieldName}.`,
      };
    }
    return {
      modelId,
      status: "available",
      rowCount: modelRows.rows.length,
      reason: `Required model artifact ${modelId} was supplied as ${modelRows.fieldName}.`,
    };
  });
}

function missingModelDependencyOutput(input: {
  readonly metadata: DetectorStudyMetadata;
  readonly modelDependencies: readonly ModelArtifactDependency[];
}): DetectorOutput {
  const missingModelArtifacts = input.modelDependencies
    .filter((dependency) => dependency.status === "missing")
    .map((dependency) => dependency.modelId);
  const availableModelArtifacts = input.modelDependencies
    .filter((dependency) => dependency.status === "available")
    .map((dependency) => dependency.modelId);
  return {
    candidates: [],
    evidence: [],
    coverage: [
      FindingCoverageAuditSchema.parse({
        auditId: `${input.metadata.detectorRunId}:audit:model_dependencies`,
        detectorRunId: input.metadata.detectorRunId,
        detectorId: input.metadata.detectorId,
        month: input.metadata.releaseMonth,
        scopeKind: "system",
        scopeId: "model_dependencies",
        outcome: "skipped_missing_input",
        reasonCode: FindingReasonCodeSchema.parse("missing_model_artifact"),
        reason: `Missing required model artifact(s): ${missingModelArtifacts.join(", ")}.`,
        inputsSeenJson: JSON.stringify({ availableModelArtifacts }),
        inputsExpectedJson: JSON.stringify({
          requiredModelArtifacts: input.modelDependencies.map((dependency) => dependency.modelId),
          missingModelArtifacts,
        }),
        createdAt: input.metadata.generatedAt,
      }),
    ],
  };
}

function candidateLimitThreshold(input: {
  readonly candidateLimit: number | undefined;
  readonly defaultLimit: number;
}): { candidateLimit: number } {
  return {
    candidateLimit: input.candidateLimit ?? input.defaultLimit,
  };
}

function countStrings(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function interventionPanelGateStatusCounts(
  rows: readonly InterventionPanelFeature[],
): Record<string, Record<string, number>> {
  return {
    preTrendStatus: countStrings(rows.map((row) => row.preTrendStatus)),
    placeboInTimeStatus: countStrings(
      rows.map((row) => row.placeboInTimeStatus ?? row.placeboStatus),
    ),
    placeboInSpaceStatus: countStrings(
      rows.map((row) => row.placeboInSpaceStatus ?? row.placeboStatus),
    ),
    autocorrelationStatus: countStrings(
      rows.map((row) => row.autocorrelationStatus ?? "not_tested"),
    ),
    methodDivergenceStatus: countStrings(
      rows.map((row) => row.methodDivergenceStatus ?? "not_tested"),
    ),
  };
}

function interventionPanelCandidateCausalEligibleCount(
  rows: readonly InterventionPanelFeature[],
): number {
  return rows.filter(
    (row) =>
      summarizeInterventionGates({
        controlEligibilityStatus: row.controlEligibilityStatus,
        preTrendStatus: row.preTrendStatus,
        placeboInTimeStatus: row.placeboInTimeStatus ?? row.placeboStatus,
        placeboInSpaceStatus: row.placeboInSpaceStatus ?? row.placeboStatus,
        autocorrelationStatus: row.autocorrelationStatus ?? "not_tested",
        methodDivergenceStatus: row.methodDivergenceStatus ?? "not_tested",
      }).candidateCausalEligible,
  ).length;
}

export function runRegistryDetectorStudy(input: {
  readonly metadata: DetectorStudyMetadata;
  readonly rows: DetectorStudySourceRows;
}): RegistryDetectorStudyResult {
  const { metadata, rows } = input;
  const modelDependencies = detectorModelDependencySatisfaction({
    detectorId: metadata.detectorId,
    rows,
  });
  const missingModelDependencies = modelDependencies.filter(
    (dependency) => dependency.status === "missing",
  );
  if (missingModelDependencies.length > 0) {
    const output = missingModelDependencyOutput({ metadata, modelDependencies });
    return {
      output,
      artifact: artifactFor({
        metadata,
        inputSummary: {
          sourceKind: "blocked_missing_model_artifacts",
          featureCount: 0,
          requiredModelArtifacts: modelDependencies.map((dependency) => dependency.modelId),
          missingModelArtifacts: missingModelDependencies.map((dependency) => dependency.modelId),
        },
        output,
        featureContracts: detectorStudyFeatureContractSatisfaction({
          detectorId: metadata.detectorId,
        }),
        modelDependencies,
      }),
    };
  }

  if (metadata.detectorId === SPEED_PACE_HOTSPOT_DETECTOR_ID) {
    const resolved = buildSegmentDaypartFeaturesFromSpeedRows({
      rows: requireRows(rows.speedRows, metadata.detectorId, "speed rows"),
      minSampleCount: DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS.minTraversals,
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features: resolved.features,
        ...(metadata.candidateLimit === undefined
          ? {}
          : { thresholds: { candidateLimit: metadata.candidateLimit } }),
      },
      inputSummary: resolved.summary,
      modelDependencies,
    });
  }

  if (metadata.detectorId === PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID) {
    const routes = requireRows(
      rows.persistentSpeedHotspotRoutes,
      metadata.detectorId,
      "persistent speed hotspot routes",
    );
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes,
        thresholds: {
          candidateLimitPerRoute:
            metadata.candidateLimit ??
            DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS.candidateLimitPerRoute,
        },
      },
      inputSummary: {
        sourceKind: "persistent_speed_hotspot_from_local_route_hotspot",
        routeCount: routes.length,
        featureCount: routes.reduce((total, route) => total + route.hotspots.length, 0),
        hotspotCount: routes.reduce((total, route) => total + route.hotspots.length, 0),
        speedObservationCount: routes.reduce(
          (total, route) => total + route.speedObservationCount,
          0,
        ),
      },
      modelDependencies,
    });
  }

  if (
    metadata.detectorId === HEADWAY_RELIABILITY_EWT_DETECTOR_ID ||
    metadata.detectorId === BUNCHING_HOTSPOTS_DETECTOR_ID
  ) {
    const features = requireRows(
      rows.stopDirectionHourFeatures,
      metadata.detectorId,
      "stop-direction-hour features",
    );
    const defaultLimit =
      metadata.detectorId === HEADWAY_RELIABILITY_EWT_DETECTOR_ID
        ? DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS.candidateLimit
        : DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS.candidateLimit;
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit,
        }),
      },
      inputSummary: rows.stopDirectionHourSummary ?? { featureCount: features.length },
      modelDependencies,
    });
  }

  if (metadata.detectorId === OBSERVED_RELIABILITY_DETECTOR_ID) {
    const routes = requireRows(
      rows.observedReliabilityRoutes,
      metadata.detectorId,
      "observed reliability routes",
    );
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: {
        sourceKind: "observed_reliability_from_local_route_observed_reliability_summary",
        routeCount: routes.length,
        featureCount: routes.length,
        observedRouteCount: routes.filter((route) => route.reliabilityStatus === "observed").length,
        scheduledBaselineRouteCount: routes.filter(
          (route) => route.scheduledBaselineHeadwaySampleCount > 0,
        ).length,
        busWaitAssessmentRouteCount: routes.filter(
          (route) => route.busWaitAssessmentTripCount > 0 && route.busWaitAssessment !== null,
        ).length,
      },
      modelDependencies,
    });
  }

  if (metadata.detectorId === RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID) {
    const resolved = buildRiderWeightedExcessWaitFeaturesFromReliabilityExposurePanelRows({
      rows: requireRows(
        rows.reliabilityExposurePanelRows,
        metadata.detectorId,
        "reliability exposure panel rows",
      ),
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features: resolved.features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: { ...(rows.stopDirectionHourSummary ?? {}), ...resolved.summary },
      modelDependencies,
    });
  }

  if (metadata.detectorId === CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID) {
    const features = requireRows(
      rows.customerJourneyFeatures,
      metadata.detectorId,
      "customer journey features",
    );
    const asOfMonth =
      typeof rows.customerJourneySummary?.["asOfMonth"] === "string"
        ? rows.customerJourneySummary["asOfMonth"]
        : metadata.releaseMonth;
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: asOfMonth,
        generatedAt: metadata.generatedAt,
        features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_CUSTOMER_JOURNEY_SHORTFALL_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: {
        ...(rows.customerJourneySummary ?? {}),
        routeRollupCount: rows.customerJourneyRouteRollups?.length ?? 0,
        routeRollups: rows.customerJourneyRouteRollups ?? [],
      },
      modelDependencies,
    });
  }

  if (
    metadata.detectorId === SCHEDULE_MISMATCH_DETECTOR_ID ||
    metadata.detectorId === TRAVEL_TIME_VARIABILITY_DETECTOR_ID
  ) {
    const resolved = buildRouteDirectionDaypartFeatures({
      observedRows: requireRows(
        rows.observedRuntimeRows,
        metadata.detectorId,
        "observed runtime rows",
      ),
      scheduledRows: requireRows(
        rows.scheduledRuntimeRows,
        metadata.detectorId,
        "scheduled runtime rows",
      ),
      minObservedTrips: Math.min(
        DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS.minObservedTrips,
        DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS.minObservedTrips,
      ),
    });
    const defaultLimit =
      metadata.detectorId === SCHEDULE_MISMATCH_DETECTOR_ID
        ? DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS.candidateLimit
        : DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS.candidateLimit;
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features: resolved.features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit,
        }),
      },
      inputSummary: resolved.summary,
      modelDependencies,
    });
  }

  if (metadata.detectorId === DEGRADATION_TREND_DETECTOR_ID) {
    const resolved = buildRouteMetricHistoryFeatures({
      rows: requireRows(
        rows.routeMetricHistoryRows,
        metadata.detectorId,
        "route metric history rows",
      ),
      releaseMonth: metadata.releaseMonth,
      historyStartMonth: metadata.historyStartMonth,
      minHistoryPoints: DEFAULT_DEGRADATION_TREND_THRESHOLDS.minHistoryPoints,
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features: resolved.features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_DEGRADATION_TREND_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: resolved.summary,
      modelDependencies,
    });
  }

  if (metadata.detectorId === MULTI_MONTH_SPEED_PEER_DETECTOR_ID) {
    const routes = requireRows(
      rows.multiMonthSpeedPeerRoutes,
      metadata.detectorId,
      "multi-month speed peer routes",
    );
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: {
        sourceKind: "multi_month_speed_peer_from_route_month_trend_and_route_peer_residuals_v1",
        routeCount: routes.length,
        featureCount: routes.reduce((total, route) => total + route.observations.length, 0),
        observationCount: routes.reduce((total, route) => total + route.observations.length, 0),
        routePeerResidualRowCount: rows.routePeerResidualRows?.length ?? 0,
      },
      modelDependencies,
    });
  }

  if (metadata.detectorId === POSITIVE_DEVIANCE_DETECTOR_ID) {
    const resolved = buildPositiveDevianceFeatures({
      rows: requireRows(
        rows.routeMetricHistoryRows,
        metadata.detectorId,
        "route metric history rows",
      ),
      releaseMonth: metadata.releaseMonth,
      minPeerCount: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.minPeerCount,
      minStablePeriods: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.minStablePeriods,
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features: resolved.features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: resolved.summary,
      modelDependencies,
    });
  }

  if (metadata.detectorId === INTERVENTION_EVENT_STUDY_DETECTOR_ID) {
    const treatmentEventPanelRows = requireRows(
      rows.treatmentEventPanelRows,
      metadata.detectorId,
      "treatment event panel rows",
    );
    const resolved = {
      features: [...treatmentEventPanelRows],
      summary: {
        sourceKind: "intervention_panel_from_treatment_event_panel_v1",
        featureCount: treatmentEventPanelRows.length,
        supportedFeatureCount: treatmentEventPanelRows.filter(
          (row) => row.quality.sampleStatus === "supported",
        ).length,
        eligibleControlFeatureCount: treatmentEventPanelRows.filter(
          (row) => row.controlEligibilityStatus === "eligible",
        ).length,
        featureWithEffectEstimateCount: treatmentEventPanelRows.filter(
          (row) => row.eventStudyEstimate !== null && row.eventStudyEstimate !== undefined,
        ).length,
        candidateCausalEligibleFeatureCount:
          interventionPanelCandidateCausalEligibleCount(treatmentEventPanelRows),
        gateStatusCounts: interventionPanelGateStatusCounts(treatmentEventPanelRows),
      },
    };
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features: resolved.features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: {
        ...resolved.summary,
        treatmentEventPanelSummary: { panelRowCount: treatmentEventPanelRows.length },
      },
      modelDependencies,
    });
  }

  if (metadata.detectorId === INTERVENTION_GAP_DETECTOR_ID) {
    const routePainRows = requireRows(rows.routePainRows, metadata.detectorId, "route pain rows");
    const routeTreatmentFeatures = requireRows(
      rows.routeTreatmentFeatures,
      metadata.detectorId,
      "route treatment features",
    );
    const sourceGapModelRows = requireRows(
      rows.sourceGapModelRows,
      metadata.detectorId,
      "source gap model rows",
    );
    const resolved = buildInterventionGapRoutesFromSourceGapModelRows({
      routePainRows,
      routeTreatmentFeatures,
      sourceGapModelRows,
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes: resolved.routes,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_INTERVENTION_GAP_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: { ...(rows.routeTreatmentFeatureSummary ?? {}), ...resolved.summary },
      modelDependencies,
    });
  }

  if (metadata.detectorId === INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID) {
    const resolved = buildInterventionUnderperformanceRoutesFromTreatmentFeatures({
      routePainRows: requireRows(rows.routePainRows, metadata.detectorId, "route pain rows"),
      interventionComparisonRows: requireRows(
        rows.interventionComparisonRows,
        metadata.detectorId,
        "intervention comparison rows",
      ),
      routeTreatmentFeatures: requireRows(
        rows.routeTreatmentFeatures,
        metadata.detectorId,
        "route treatment features",
      ),
      routeSegmentTreatmentFeatures: requireRows(
        rows.routeSegmentTreatmentFeatures,
        metadata.detectorId,
        "route-segment treatment features",
      ),
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes: resolved.routes,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: { ...(rows.routeTreatmentFeatureSummary ?? {}), ...resolved.summary },
      modelDependencies,
    });
  }

  if (metadata.detectorId === SOURCE_GAP_DETECTOR_ID) {
    const sourceGapModelRows = requireRows(
      rows.sourceGapModelRows,
      metadata.detectorId,
      "source gap model rows",
    );
    const sourceGapCount = sourceGapModelRows.reduce((sum, row) => sum + row.sourceGapCount, 0);
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes: [],
        treatmentSourceGaps: sourceGapModelRows,
      },
      inputSummary: {
        ...(rows.routeTreatmentFeatureSummary ?? {}),
        sourceKind: "source_gap_from_source_gap_model_v1",
        featureCount: sourceGapModelRows.length,
        sourceGapModelRowCount: sourceGapModelRows.length,
        sourceGapModelSourceGapCount: sourceGapCount,
      },
      modelDependencies,
    });
  }

  if (
    metadata.detectorId === PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID ||
    metadata.detectorId === SERVICE_REQUEST_CONTEXT_DETECTOR_ID
  ) {
    const features = requireRows(
      rows.routeMonthSignalFeatures,
      metadata.detectorId,
      "route-month signal features",
    );
    const defaultLimit =
      metadata.detectorId === PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID
        ? DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS.candidateLimit
        : DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS.candidateLimit;
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        features,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit,
        }),
      },
      inputSummary: rows.routeMonthSignalFeatureSummary ?? {
        sourceKind: "route_month_signal_features",
        featureCount: features.length,
      },
      modelDependencies,
    });
  }

  if (metadata.detectorId === TREATMENT_SCOPE_MISMATCH_DETECTOR_ID) {
    const segmentHistoricalSpeedRows = requireRows(
      rows.routeSegmentHistoricalSpeedSummaryRows,
      metadata.detectorId,
      "route-segment historical speed summary rows",
    );
    const segmentSpeedResidualRows = requireRows(
      rows.segmentSpeedResidualRows,
      metadata.detectorId,
      "segment speed residual rows",
    );
    const interventionScopeFitRows = requireRows(
      rows.interventionScopeFitRows,
      metadata.detectorId,
      "intervention scope fit rows",
    );
    const resolved = buildTreatmentScopeMismatchSegmentsFromTreatmentFeatures({
      segmentSpeedRows: requireRows(
        rows.routeSegmentSpeedSummaryRows,
        metadata.detectorId,
        "route-segment speed summary rows",
      ),
      segmentDaypartSpeedRows: requireRows(
        rows.routeSegmentDaypartSpeedSummaryRows,
        metadata.detectorId,
        "route-segment daypart speed summary rows",
      ),
      segmentHistoricalSpeedRows,
      segmentSpeedResidualRows,
      routeSegmentTreatmentFeatures: requireRows(
        rows.routeSegmentTreatmentFeatures,
        metadata.detectorId,
        "route-segment treatment features",
      ),
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        segments: resolved.segments,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_TREATMENT_SCOPE_MISMATCH_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: {
        ...(rows.routeTreatmentFeatureSummary ?? {}),
        ...resolved.summary,
        interventionScopeFitSummary: { modeledReleaseRowCount: interventionScopeFitRows.length },
        segmentSpeedResidualSummary: { modeledReleaseRowCount: segmentSpeedResidualRows.length },
      },
      modelDependencies,
    });
  }

  if (metadata.detectorId === TREATMENT_SCOPE_GAP_DETECTOR_ID) {
    const segmentSpeedResidualRows = requireRows(
      rows.segmentSpeedResidualRows,
      metadata.detectorId,
      "segment speed residual rows",
    );
    const interventionScopeFitRows = requireRows(
      rows.interventionScopeFitRows,
      metadata.detectorId,
      "intervention scope fit rows",
    );
    const resolved = buildTreatmentScopeGapSegmentsFromTreatmentFeatures({
      segmentSpeedRows: requireRows(
        rows.routeSegmentSpeedSummaryRows,
        metadata.detectorId,
        "route-segment speed summary rows",
      ),
      segmentDaypartSpeedRows: requireRows(
        rows.routeSegmentDaypartSpeedSummaryRows,
        metadata.detectorId,
        "route-segment daypart speed summary rows",
      ),
      segmentSpeedResidualRows,
      routeTreatmentFeatures: requireRows(
        rows.routeTreatmentFeatures,
        metadata.detectorId,
        "route treatment features",
      ),
      routeSegmentTreatmentFeatures: requireRows(
        rows.routeSegmentTreatmentFeatures,
        metadata.detectorId,
        "route-segment treatment features",
      ),
      interventionScopeFitRows,
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        segments: resolved.segments,
        thresholds: candidateLimitThreshold({
          candidateLimit: metadata.candidateLimit,
          defaultLimit: DEFAULT_TREATMENT_SCOPE_GAP_THRESHOLDS.candidateLimit,
        }),
      },
      inputSummary: {
        ...(rows.routeTreatmentFeatureSummary ?? {}),
        ...resolved.summary,
        interventionScopeFitSummary: { modeledReleaseRowCount: interventionScopeFitRows.length },
        segmentSpeedResidualSummary: { modeledReleaseRowCount: segmentSpeedResidualRows.length },
      },
      modelDependencies,
    });
  }

  if (metadata.detectorId === DELAY_CONCENTRATION_DETECTOR_ID) {
    const resolved = buildDelayConcentrationRoutes({
      rows: requireRows(
        rows.delayConcentrationSegmentRows,
        metadata.detectorId,
        "delay-concentration segment rows",
      ),
    });
    return runResolvedDetectorStudy({
      metadata,
      detectorInput: {
        detectorRunId: metadata.detectorRunId,
        month: metadata.releaseMonth,
        generatedAt: metadata.generatedAt,
        routes: resolved.routes,
        thresholds: DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
      },
      inputSummary: resolved.summary,
      modelDependencies,
    });
  }

  throw new Error(`Registry detector study does not yet support ${metadata.detectorId}`);
}

import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
  DEFAULT_DEGRADATION_TREND_THRESHOLDS,
  DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
  DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS,
  DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS,
  DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS,
  DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS,
  DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
  DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS,
  DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
  DEGRADATION_TREND_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
} from "@bp/analytics/detectors";
import type { StopDirectionHourFeature } from "@bp/analytics/features";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import {
  buildDelayConcentrationRoutes,
  buildInterventionPanelFeatures,
  buildPositiveDevianceFeatures,
  buildRiderWeightedExcessWaitFeatures,
  type DelayConcentrationSegmentSourceRow,
  type InterventionComparisonSourceRow,
  type RouteHourlyRidershipSourceRow,
} from "../feature-resolvers/detector-family-features";
import {
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
  type ObservedRuntimeSourceRow,
  type RouteMetricHistorySourceRow,
  type ScheduledRuntimeSourceRow,
} from "../feature-resolvers/runtime-history";
import {
  buildSegmentDaypartFeaturesFromSpeedRows,
  type SegmentDaypartSpeedSourceRow,
} from "../feature-resolvers/segment-daypart-speed";
import {
  buildRegistryDetectorRunArtifact,
  type DetectorOutput,
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
  readonly observedRuntimeRows?: readonly ObservedRuntimeSourceRow[];
  readonly scheduledRuntimeRows?: readonly ScheduledRuntimeSourceRow[];
  readonly routeMetricHistoryRows?: readonly RouteMetricHistorySourceRow[];
  readonly interventionComparisonRows?: readonly InterventionComparisonSourceRow[];
  readonly delayConcentrationSegmentRows?: readonly DelayConcentrationSegmentSourceRow[];
};

export type RegistryDetectorStudyResult = {
  readonly artifact: RegistryDetectorRunArtifact;
  readonly output: DetectorOutput;
};

export function detectorStudyNeedsStopDirectionHourFeatures(detectorId: string): boolean {
  return STOP_DIRECTION_HOUR_DETECTOR_IDS.has(detectorId);
}

function requireRows<T>(
  rows: readonly T[] | undefined,
  detectorId: string,
  sourceName: string,
): readonly T[] {
  if (rows !== undefined) return rows;
  throw new Error(`Missing ${sourceName} for ${detectorId} detector study.`);
}

function runDetector(detectorId: string, input: unknown): DetectorOutput {
  const detector = getAnalyticsDetector(detectorId);
  if (detector === null) throw new Error(`Missing ${detectorId} registry row`);
  return detector.run(input);
}

function artifactFor(input: {
  readonly metadata: DetectorStudyMetadata;
  readonly inputSummary: Record<string, unknown>;
  readonly output: DetectorOutput;
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
  });
}

function candidateLimitThreshold(input: {
  readonly candidateLimit: number | undefined;
  readonly defaultLimit: number;
}): { candidateLimit: number } {
  return {
    candidateLimit: input.candidateLimit ?? input.defaultLimit,
  };
}

export function runRegistryDetectorStudy(input: {
  readonly metadata: DetectorStudyMetadata;
  readonly rows: DetectorStudySourceRows;
}): RegistryDetectorStudyResult {
  const { metadata, rows } = input;

  if (metadata.detectorId === SPEED_PACE_HOTSPOT_DETECTOR_ID) {
    const resolved = buildSegmentDaypartFeaturesFromSpeedRows({
      rows: requireRows(rows.speedRows, metadata.detectorId, "speed rows"),
      minSampleCount: DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS.minTraversals,
    });
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features: resolved.features,
      ...(metadata.candidateLimit === undefined
        ? {}
        : { thresholds: { candidateLimit: metadata.candidateLimit } }),
    });
    return { output, artifact: artifactFor({ metadata, inputSummary: resolved.summary, output }) };
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
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features,
      thresholds: candidateLimitThreshold({
        candidateLimit: metadata.candidateLimit,
        defaultLimit,
      }),
    });
    return {
      output,
      artifact: artifactFor({
        metadata,
        inputSummary: rows.stopDirectionHourSummary ?? { featureCount: features.length },
        output,
      }),
    };
  }

  if (metadata.detectorId === RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID) {
    const stopFeatures = requireRows(
      rows.stopDirectionHourFeatures,
      metadata.detectorId,
      "stop-direction-hour features",
    );
    const resolved = buildRiderWeightedExcessWaitFeatures({
      stopFeatures,
      ridershipRows: requireRows(
        rows.routeHourlyRidershipRows,
        metadata.detectorId,
        "route-hourly ridership rows",
      ),
    });
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features: resolved.features,
      thresholds: candidateLimitThreshold({
        candidateLimit: metadata.candidateLimit,
        defaultLimit: DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS.candidateLimit,
      }),
    });
    return {
      output,
      artifact: artifactFor({
        metadata,
        inputSummary: { ...(rows.stopDirectionHourSummary ?? {}), ...resolved.summary },
        output,
      }),
    };
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
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features: resolved.features,
      thresholds: candidateLimitThreshold({
        candidateLimit: metadata.candidateLimit,
        defaultLimit,
      }),
    });
    return { output, artifact: artifactFor({ metadata, inputSummary: resolved.summary, output }) };
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
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features: resolved.features,
      thresholds: candidateLimitThreshold({
        candidateLimit: metadata.candidateLimit,
        defaultLimit: DEFAULT_DEGRADATION_TREND_THRESHOLDS.candidateLimit,
      }),
    });
    return { output, artifact: artifactFor({ metadata, inputSummary: resolved.summary, output }) };
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
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features: resolved.features,
      thresholds: candidateLimitThreshold({
        candidateLimit: metadata.candidateLimit,
        defaultLimit: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.candidateLimit,
      }),
    });
    return { output, artifact: artifactFor({ metadata, inputSummary: resolved.summary, output }) };
  }

  if (metadata.detectorId === INTERVENTION_EVENT_STUDY_DETECTOR_ID) {
    const resolved = buildInterventionPanelFeatures({
      rows: requireRows(
        rows.interventionComparisonRows,
        metadata.detectorId,
        "intervention comparison rows",
      ),
    });
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      features: resolved.features,
      thresholds: candidateLimitThreshold({
        candidateLimit: metadata.candidateLimit,
        defaultLimit: DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS.candidateLimit,
      }),
    });
    return { output, artifact: artifactFor({ metadata, inputSummary: resolved.summary, output }) };
  }

  if (metadata.detectorId === DELAY_CONCENTRATION_DETECTOR_ID) {
    const resolved = buildDelayConcentrationRoutes({
      rows: requireRows(
        rows.delayConcentrationSegmentRows,
        metadata.detectorId,
        "delay-concentration segment rows",
      ),
    });
    const output = runDetector(metadata.detectorId, {
      detectorRunId: metadata.detectorRunId,
      month: metadata.releaseMonth,
      generatedAt: metadata.generatedAt,
      routes: resolved.routes,
      thresholds: DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
    });
    return { output, artifact: artifactFor({ metadata, inputSummary: resolved.summary, output }) };
  }

  throw new Error(`Registry detector study does not yet support ${metadata.detectorId}`);
}

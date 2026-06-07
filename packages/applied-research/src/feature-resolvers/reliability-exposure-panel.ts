import type {
  FeatureCoverageStatus,
  FeatureSampleStatus,
  RiderWeightedExcessWaitFeature,
  StopDirectionHourFeature,
} from "@bp/analytics/features";
import { riderWeightedExcessWaitFeatureKey } from "@bp/analytics/features";
import {
  buildRiderWeightedExcessWaitFeatures,
  type DetectorFeatureResolverResult,
  type RouteHourlyRidershipSourceRow,
} from "./detector-family-features";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const RELIABILITY_EXPOSURE_PANEL_V1_ID = "reliability_exposure_panel_v1" as const;

export type ReliabilityExposurePanelSpec = {
  readonly panelId: typeof RELIABILITY_EXPOSURE_PANEL_V1_ID;
  readonly releaseMonth: string;
  readonly runId: string;
  readonly routeId?: string;
};

export type ReliabilityExposurePanelRow = {
  readonly routeId: string;
  readonly stopId: string;
  readonly stopName: string;
  readonly direction: string;
  readonly serviceDate: string;
  readonly localHour: number;
  readonly timezone: string;
  readonly panelKey: string;
  readonly excessWaitTimeMinutes: number | null;
  readonly boardings: number | null;
  readonly riderDelayMinutes: number | null;
  readonly boardingsSource: string | null;
  readonly ridershipSnapshotId: string | null;
  readonly ewtDetectorVersion: string | null;
  readonly ewtCoverageStatus: string;
  readonly ewtSampleStatus: string;
  readonly ewtObservedPairCount: number;
  readonly ridershipCoverageStatus: string;
  readonly ridershipSampleStatus: string;
  readonly riderExposureSupported: boolean;
  readonly reliabilitySupported: boolean;
};

export type ReliabilityExposurePanelArtifactV1 = {
  readonly artifactKind: typeof RELIABILITY_EXPOSURE_PANEL_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly runId: string;
  readonly panelSpec: ReliabilityExposurePanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly stopFeatureCount: number;
    readonly ridershipRowCount: number;
    readonly panelRowCount: number;
    readonly supportedRowCount: number;
    readonly routeCount: number;
    readonly stopCount: number;
    readonly serviceDateCount: number;
    readonly hourCount: number;
    readonly rowWithRidershipCount: number;
    readonly rowWithExcessWaitCount: number;
    readonly rowWithRiderDelayCount: number;
    readonly totalEstimatedBoardings: number | null;
    readonly totalEstimatedRiderDelayMinutes: number | null;
  };
  readonly rows: readonly ReliabilityExposurePanelRow[];
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sumNullable(values: readonly (number | null)[]): number | null {
  const supported = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (supported.length === 0) return null;
  return round(supported.reduce((sum, value) => sum + value, 0), 4);
}

export function reliabilityExposurePanelSpecV1(input: ReliabilityExposurePanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: RELIABILITY_EXPOSURE_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + direction + stop_id + service_date + local_hour",
    timeKey: "service_date + local_hour",
    entityKeys: ["route_id", "direction", "stop_id"],
    measures: [
      "excess_wait_time_minutes",
      "boardings",
      "rider_delay_minutes",
      "ewt_quality",
      "ridership_quality",
    ],
    joins: [
      "stop_direction_hour_ewt_features",
      "local_route_hourly_ridership by route_id + day_type + hour",
    ],
    coverage: [
      "ewt_coverage_status",
      "ewt_sample_status",
      "ridership_coverage_status",
      "ridership_sample_status",
    ],
    historyWindow: {
      startMonth: input.releaseMonth,
      endMonth: input.releaseMonth,
    },
    releaseFilter: { month: input.releaseMonth },
    requiredProducts: [
      {
        productId: "stop_direction_hour_ewt_features",
        state: "available",
        role: "artifact",
        reason: "Stop-direction-hour reliability features generated from schedule and observed headway samples.",
      },
      {
        productId: "local_route_hourly_ridership_history",
        state: "available",
        role: "source",
        reason: "Route-hour ridership is used as a stop-hour exposure proxy.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "ewt_available",
        description: "Rows carry excess wait only when observed headways and schedule baselines support EWT.",
      },
      {
        ruleId: "ridership_proxy_available",
        description: "Rows carry boardings only when route-hour ridership can be joined and divided over stop-hour features.",
      },
    ],
    negativeMeaning:
      "A clean no-hit means the stop-direction-hour row was represented in the reliability panel; missing EWT or ridership support remains explicit in row quality fields.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

function manifest(input: {
  readonly spec: ReliabilityExposurePanelSpec;
  readonly generatedAt: string;
  readonly stopFeatureCount: number;
  readonly ridershipRowCount: number;
  readonly supportedRowCount: number;
  readonly panelRowCount: number;
  readonly routeCount: number;
  readonly stopCount: number;
  readonly serviceDateCount: number;
}): PanelManifest {
  return {
    panelId: RELIABILITY_EXPOSURE_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: reliabilityExposurePanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "artifact",
        refId: "analytics-stop-direction-hour-ewt",
        role: "reliability_panel_source",
        path: `data/artifacts/analytics-stop-direction-hour-ewt/${input.spec.releaseMonth}/${input.spec.runId}`,
      },
      {
        refKind: "local_table",
        refId: "local_route_hourly_ridership",
        role: "rider_exposure_proxy_source",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.stopFeatureCount + input.ridershipRowCount,
      supportedRowCount: input.supportedRowCount,
      panelRowCount: input.panelRowCount,
      routeCount: input.routeCount,
      entityCount: input.stopCount,
      monthCount: input.serviceDateCount,
    },
    limitations: [
      "Ridership exposure is a route-hour proxy allocated evenly across stop-direction-hour feature rows, not observed stop-level boardings.",
      "Rows can have reliability support without ridership support, or ridership support without computable EWT; both states are explicit.",
      "The panel currently covers the release month artifact set, not a multi-month reliability history.",
    ],
  };
}

function panelRow(feature: RiderWeightedExcessWaitFeature): ReliabilityExposurePanelRow {
  const riderDelayMinutes =
    feature.excessWaitTimeMinutes === null || feature.boardings === null
      ? null
      : round(feature.excessWaitTimeMinutes * feature.boardings, 4);
  return {
    routeId: feature.routeId,
    stopId: feature.stopId,
    stopName: feature.stopName,
    direction: feature.direction,
    serviceDate: feature.serviceDate,
    localHour: feature.localHour,
    timezone: feature.timezone,
    panelKey: riderWeightedExcessWaitFeatureKey(feature),
    excessWaitTimeMinutes:
      feature.excessWaitTimeMinutes === null ? null : round(feature.excessWaitTimeMinutes, 4),
    boardings: feature.boardings === null ? null : round(feature.boardings, 4),
    riderDelayMinutes,
    boardingsSource: feature.boardingsSource,
    ridershipSnapshotId: feature.ridershipSnapshotId,
    ewtDetectorVersion: feature.ewtDetectorVersion,
    ewtCoverageStatus: feature.quality.coverageStatus,
    ewtSampleStatus: feature.quality.sampleStatus,
    ewtObservedPairCount: feature.quality.sampleCount,
    ridershipCoverageStatus: feature.ridershipQuality.coverageStatus,
    ridershipSampleStatus: feature.ridershipQuality.sampleStatus,
    riderExposureSupported: feature.boardings !== null,
    reliabilitySupported: feature.excessWaitTimeMinutes !== null,
  };
}

function coverageStatus(value: string): FeatureCoverageStatus {
  if (value === "complete" || value === "partial" || value === "low_coverage" || value === "missing") {
    return value;
  }
  return "missing";
}

function sampleStatus(value: string): FeatureSampleStatus {
  if (value === "supported" || value === "insufficient_samples" || value === "missing_samples") {
    return value;
  }
  return "missing_samples";
}

export function buildRiderWeightedExcessWaitFeaturesFromReliabilityExposurePanelRows(input: {
  readonly rows: readonly ReliabilityExposurePanelRow[];
}): DetectorFeatureResolverResult<RiderWeightedExcessWaitFeature> {
  const features = input.rows.map((row): RiderWeightedExcessWaitFeature => {
    const ridershipSupported = row.boardings !== null && row.boardings > 0;
    return {
      routeId: row.routeId,
      stopId: row.stopId,
      stopName: row.stopName,
      direction: row.direction,
      serviceDate: row.serviceDate,
      localHour: row.localHour,
      timezone: row.timezone,
      excessWaitTimeMinutes: row.excessWaitTimeMinutes,
      boardings: row.boardings,
      boardingsSource: row.boardingsSource,
      ridershipSnapshotId: row.ridershipSnapshotId,
      ewtDetectorVersion: row.ewtDetectorVersion,
      quality: {
        coverageStatus: coverageStatus(row.ewtCoverageStatus),
        observedCount: row.ewtObservedPairCount,
        expectedCount: null,
        coverageShare: row.reliabilitySupported ? 1 : 0,
        freshnessStatus: "not_expected",
        sampleCount: row.ewtObservedPairCount,
        minSampleCount: null,
        sampleStatus: sampleStatus(row.ewtSampleStatus),
      },
      ridershipQuality: {
        coverageStatus: coverageStatus(row.ridershipCoverageStatus),
        observedCount: ridershipSupported ? 1 : 0,
        expectedCount: 1,
        coverageShare: ridershipSupported ? 1 : 0,
        freshnessStatus: "not_expected",
        sampleCount: ridershipSupported ? 1 : 0,
        minSampleCount: 1,
        sampleStatus: sampleStatus(row.ridershipSampleStatus),
      },
    };
  });
  return {
    features,
    summary: {
      sourceKind: "rider_weighted_excess_wait_from_reliability_exposure_panel_v1",
      panelRowCount: input.rows.length,
      featureCount: features.length,
      featureWithRidershipCount: features.filter((feature) => feature.boardings !== null).length,
      featureWithExcessWaitCount: features.filter((feature) => feature.excessWaitTimeMinutes !== null)
        .length,
      featureWithRiderDelayCount: input.rows.filter((row) => row.riderDelayMinutes !== null).length,
    },
  };
}

export function buildReliabilityExposurePanelArtifactV1(input: {
  readonly stopFeatures: readonly StopDirectionHourFeature[];
  readonly ridershipRows: readonly RouteHourlyRidershipSourceRow[];
  readonly spec: ReliabilityExposurePanelSpec;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): ReliabilityExposurePanelArtifactV1 {
  const resolved = buildRiderWeightedExcessWaitFeatures({
    stopFeatures: input.stopFeatures,
    ridershipRows: input.ridershipRows,
  });
  const rows = resolved.features.map(panelRow).sort((left, right) => left.panelKey.localeCompare(right.panelKey));
  const supportedRows = rows.filter((row) => row.riderDelayMinutes !== null);
  const routeCount = new Set(rows.map((row) => row.routeId)).size;
  const stopCount = new Set(rows.map((row) => `${row.routeId}\0${row.direction}\0${row.stopId}`)).size;
  const serviceDateCount = new Set(rows.map((row) => row.serviceDate)).size;
  const hourCount = new Set(rows.map((row) => row.localHour)).size;
  const summary = {
    stopFeatureCount: input.stopFeatures.length,
    ridershipRowCount: input.ridershipRows.length,
    panelRowCount: rows.length,
    supportedRowCount: supportedRows.length,
    routeCount,
    stopCount,
    serviceDateCount,
    hourCount,
    rowWithRidershipCount: rows.filter((row) => row.boardings !== null).length,
    rowWithExcessWaitCount: rows.filter((row) => row.excessWaitTimeMinutes !== null).length,
    rowWithRiderDelayCount: supportedRows.length,
    totalEstimatedBoardings: sumNullable(rows.map((row) => row.boardings)),
    totalEstimatedRiderDelayMinutes: sumNullable(rows.map((row) => row.riderDelayMinutes)),
  };
  return {
    artifactKind: RELIABILITY_EXPOSURE_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    releaseMonth: input.spec.releaseMonth,
    runId: input.spec.runId,
    panelSpec: input.spec,
    panelManifest: manifest({
      spec: input.spec,
      generatedAt: input.generatedAt,
      stopFeatureCount: input.stopFeatures.length,
      ridershipRowCount: input.ridershipRows.length,
      supportedRowCount: summary.supportedRowCount,
      panelRowCount: summary.panelRowCount,
      routeCount: summary.routeCount,
      stopCount: summary.stopCount,
      serviceDateCount: summary.serviceDateCount,
    }),
    summary,
    rows,
  };
}

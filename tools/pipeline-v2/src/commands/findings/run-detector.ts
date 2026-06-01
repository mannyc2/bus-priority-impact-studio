import { Glob } from "bun";
import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  DEGRADATION_TREND_DETECTOR_ID,
  DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
  DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
  DEFAULT_DEGRADATION_TREND_THRESHOLDS,
  DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS,
  DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS,
  DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS,
  DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS,
  DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
  DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS,
  DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
  detectBunchingHotspots,
  detectDelayConcentration,
  detectDegradationTrends,
  detectHeadwayReliabilityEwt,
  detectInterventionEventStudies,
  detectPositiveDeviance,
  detectRiderWeightedExcessWait,
  detectScheduleMismatch,
  detectSpeedPaceHotspots,
  detectTravelTimeVariability,
  DELAY_CONCENTRATION_DETECTOR_ID,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
} from "@bp/analytics";
import type { StopDirectionHourFeature } from "@bp/analytics/features";
import { getAnalyticsDetector } from "@bp/analytics/registry";
import { replaceFindingsForMonth } from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import {
  buildDelayConcentrationRoutes,
  buildInterventionPanelFeatures,
  buildPositiveDevianceFeatures,
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
  buildRiderWeightedExcessWaitFeatures,
  buildSegmentDaypartFeaturesFromSpeedRows,
  type DelayConcentrationSegmentSourceRow,
  type InterventionComparisonSourceRow,
  type ObservedRuntimeSourceRow,
  type RouteHourlyRidershipSourceRow,
  type RouteMetricHistorySourceRow,
  type ScheduledRuntimeSourceRow,
  type SegmentDaypartSpeedSourceRow,
} from "@bp/applied-research/feature-resolvers";
import {
  buildRegistryDetectorRunArtifact,
  type DetectorOutput,
  type RegistryDetectorRunArtifact,
} from "@bp/applied-research/detector-runs";

type ScheduledRuntimeRow = ScheduledRuntimeSourceRow;
type ObservedRuntimeRow = ObservedRuntimeSourceRow;
type RouteMetricHistoryRow = RouteMetricHistorySourceRow;
type RouteHourlyRidershipRow = RouteHourlyRidershipSourceRow;
type InterventionComparisonRow = InterventionComparisonSourceRow;
type DelayConcentrationSegmentRow = DelayConcentrationSegmentSourceRow;

type StopDirectionHourFeatureArtifact = {
  routeId?: unknown;
  summary?: Record<string, unknown>;
  features?: StopDirectionHourFeature[];
};

export type { RegistryDetectorRunArtifact } from "@bp/applied-research/detector-runs";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function detectorRunArtifactPath(input: {
  artifactRoot: string;
  releaseMonth: string;
  detectorId: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-runs",
    input.releaseMonth,
    `${input.detectorId}-run.json`,
  );
}

function querySpeedRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): SegmentDaypartSpeedSourceRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite
    .query(
      `
        SELECT
          route_id,
          month,
          hour_of_day,
          direction,
          stop_order,
          timepoint_stop_id,
          next_timepoint_stop_id,
          road_distance_miles,
          average_travel_time_minutes,
          average_road_speed_mph,
          bus_trip_count
        FROM local_route_segment_speed
        WHERE month = ?
          ${routeFilter}
        ORDER BY route_id, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id, hour_of_day
      `,
    );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as SegmentDaypartSpeedSourceRow[];
}

export function buildSpeedPaceHotspotRunArtifact(input: {
  rows: readonly SegmentDaypartSpeedSourceRow[];
  detectorRunId: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  wroteDb: boolean;
  candidateLimit?: number;
}): {
  artifact: RegistryDetectorRunArtifact;
  output: ReturnType<typeof detectSpeedPaceHotspots>;
} {
  const detector = getAnalyticsDetector(SPEED_PACE_HOTSPOT_DETECTOR_ID);
  if (detector === null) throw new Error(`Missing ${SPEED_PACE_HOTSPOT_DETECTOR_ID} registry row`);
  const resolved = buildSegmentDaypartFeaturesFromSpeedRows({
    rows: input.rows,
    minSampleCount: DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS.minTraversals,
  });
  const detectorInput = {
    detectorRunId: input.detectorRunId,
    month: input.releaseMonth,
    generatedAt: input.generatedAt,
    features: resolved.features,
    ...(input.candidateLimit === undefined
      ? {}
      : { thresholds: { candidateLimit: input.candidateLimit } }),
  };
  const output = detectSpeedPaceHotspots(detectorInput);
  return {
    output,
    artifact: buildRegistryDetectorRunArtifact({
      detectorId: SPEED_PACE_HOTSPOT_DETECTOR_ID,
      detectorRunId: input.detectorRunId,
      releaseMonth: input.releaseMonth,
      generatedAt: input.generatedAt,
      dbPath: input.dbPath,
      artifactPath: input.artifactPath,
      wroteDb: input.wroteDb,
      inputSummary: { ...resolved.summary },
      output,
    }),
  };
}

async function loadStopDirectionHourFeatures(input: {
  artifactRoot: string;
  month: string;
  runId: string;
  routeId?: string;
}): Promise<{ features: StopDirectionHourFeature[]; summary: Record<string, unknown> }> {
  const root = join(
    input.artifactRoot,
    "analytics-stop-direction-hour-ewt",
    input.month,
    input.runId,
  );
  const features: StopDirectionHourFeature[] = [];
  let artifactCount = 0;
  const totals = {
    featureCount: 0,
    readyFeatureCount: 0,
    baselineUnavailableCount: 0,
    insufficientHeadwayCount: 0,
    lowCoverageCount: 0,
    observedHeadwaySampleCount: 0,
  };
  const glob = new Glob("**/stop-direction-hour-ewt-features.json");
  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const artifact = (await Bun.file(join(root, relativePath)).json()) as StopDirectionHourFeatureArtifact;
    const artifactRouteId = text(artifact.routeId);
    if (input.routeId !== undefined && artifactRouteId !== input.routeId) continue;
    artifactCount += 1;
    features.push(...(Array.isArray(artifact.features) ? artifact.features : []));
    const summary = artifact.summary ?? {};
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] += numberValue(summary[key]) ?? 0;
    }
  }
  return {
    features,
    summary: {
      sourceKind: "stop_direction_hour_ewt_feature_artifacts",
      artifactCount,
      ...totals,
      loadedFeatureCount: features.length,
    },
  };
}

function queryRouteHourlyRidershipRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteHourlyRidershipRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        CASE
          WHEN day_of_week IN ('Saturday') THEN 'Saturday'
          WHEN day_of_week IN ('Sunday') THEN 'Sunday'
          ELSE 'Weekday'
        END AS day_of_week,
        hour_of_day,
        AVG(ridership) AS ridership
      FROM local_route_hourly_ridership
      WHERE month = ?
        ${routeFilter}
      GROUP BY
        route_id,
        month,
        CASE
          WHEN day_of_week IN ('Saturday') THEN 'Saturday'
          WHEN day_of_week IN ('Sunday') THEN 'Sunday'
          ELSE 'Weekday'
        END,
        hour_of_day
      ORDER BY route_id, day_of_week, hour_of_day
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as RouteHourlyRidershipRow[];
}

function queryObservedRuntimeRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): ObservedRuntimeRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        direction,
        CASE
          WHEN hour_of_day BETWEEN 6 AND 9 THEN 'am_peak'
          WHEN hour_of_day BETWEEN 10 AND 15 THEN 'midday'
          WHEN hour_of_day BETWEEN 16 AND 19 THEN 'pm_peak'
          ELSE 'off_peak'
        END AS daypart,
        timestamp,
        SUM(average_travel_time_minutes) AS runtime_minutes,
        SUM(bus_trip_count) AS observed_trip_count
      FROM local_route_segment_speed
      WHERE month = ?
        ${routeFilter}
      GROUP BY route_id, month, direction, daypart, timestamp
      HAVING runtime_minutes > 0
      ORDER BY route_id, direction, daypart, timestamp
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as ObservedRuntimeRow[];
}

function queryScheduledRuntimeRows(input: {
  sqlite: Database;
  sourceYear: number;
  routeId?: string;
}): ScheduledRuntimeRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      WITH trips AS (
        SELECT
          route_id,
          direction,
          day_type,
          block_id,
          shape_id,
          schedule_date,
          trip_headsign,
          MIN(CASE WHEN origin = 1 THEN schedule_time END) AS start_time,
          MAX(CASE WHEN destination = 1 THEN schedule_time END) AS end_time
        FROM local_route_schedule_stop
        WHERE source_year = ?
          AND (origin = 1 OR destination = 1)
          ${routeFilter}
        GROUP BY route_id, direction, day_type, block_id, shape_id, schedule_date, trip_headsign
      )
      SELECT
        route_id,
        direction,
        CASE
          WHEN CAST(strftime('%H', start_time) AS INTEGER) BETWEEN 6 AND 9 THEN 'am_peak'
          WHEN CAST(strftime('%H', start_time) AS INTEGER) BETWEEN 10 AND 15 THEN 'midday'
          WHEN CAST(strftime('%H', start_time) AS INTEGER) BETWEEN 16 AND 19 THEN 'pm_peak'
          ELSE 'off_peak'
        END AS daypart,
        (CAST(strftime('%s', end_time) AS REAL) - CAST(strftime('%s', start_time) AS REAL)) / 60.0 AS runtime_minutes
      FROM trips
      WHERE start_time IS NOT NULL
        AND end_time IS NOT NULL
        AND runtime_minutes BETWEEN 1 AND 300
      ORDER BY route_id, direction, daypart
    `,
  );
  return (
    input.routeId === undefined
      ? query.all(input.sourceYear)
      : query.all(input.sourceYear, input.routeId)
  ) as ScheduledRuntimeRow[];
}

function queryRouteMetricHistoryRows(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
  routeId?: string;
}): RouteMetricHistoryRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT route_id, month, speed_observation_count, average_speed_mph
      FROM local_route_month_trend
      WHERE month >= ?
        AND month <= ?
        ${routeFilter}
      ORDER BY route_id, month
    `,
  );
  return (
    input.routeId === undefined
      ? query.all(input.startMonth, input.endMonth)
      : query.all(input.startMonth, input.endMonth, input.routeId)
  ) as RouteMetricHistoryRow[];
}

function queryInterventionComparisonRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): InterventionComparisonRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND c.route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        c.route_id,
        c.month,
        c.event_id,
        c.intervention_type,
        e.implementation_date,
        e.implementation_month,
        c.comparison_status,
        c.pre_start_month,
        c.pre_end_month,
        c.post_start_month,
        c.post_end_month,
        c.comparison_route_count,
        c.comparison_route_ids,
        c.adjusted_speed_delta_mph,
        c.speed_delta_mph
      FROM local_route_intervention_comparison c
      LEFT JOIN local_intervention_event e ON e.event_id = c.event_id
      WHERE c.month = ?
        ${routeFilter}
      ORDER BY c.route_id, c.event_id
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as InterventionComparisonRow[];
}

function queryDelayConcentrationSegmentRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): DelayConcentrationSegmentRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        route_id || ':' || direction || ':' || stop_order || ':' ||
          timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
        direction,
        stop_order,
        timepoint_stop_name,
        next_timepoint_stop_name,
        COUNT(*) AS observation_count,
        SUM(bus_trip_count) AS bus_trip_count,
        SUM(average_road_speed_mph * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
          AS weighted_average_speed_mph,
        SUM(average_travel_time_minutes * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
          AS weighted_average_travel_time_minutes,
        AVG(road_distance_miles) AS average_road_distance_miles
      FROM local_route_segment_speed
      WHERE month = ?
        ${routeFilter}
      GROUP BY
        route_id,
        direction,
        stop_order,
        timepoint_stop_id,
        next_timepoint_stop_id,
        timepoint_stop_name,
        next_timepoint_stop_name
      ORDER BY route_id, direction, stop_order
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as DelayConcentrationSegmentRow[];
}

async function buildDetectorRun(input: {
  sqlite: Database;
  detectorId: string;
  detectorRunId: string;
  releaseMonth: string;
  historyStartMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  artifactRoot: string;
  wroteDb: boolean;
  routeId?: string;
  observedRunId: string;
  candidateLimit?: number;
}): Promise<{ artifact: RegistryDetectorRunArtifact; output: DetectorOutput }> {
  if (input.detectorId === SPEED_PACE_HOTSPOT_DETECTOR_ID) {
    return buildSpeedPaceHotspotRunArtifact({
      rows: querySpeedRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      detectorRunId: input.detectorRunId,
      releaseMonth: input.releaseMonth,
      generatedAt: input.generatedAt,
      dbPath: input.dbPath,
      artifactPath: input.artifactPath,
      wroteDb: input.wroteDb,
      ...(input.candidateLimit === undefined ? {} : { candidateLimit: input.candidateLimit }),
    });
  }

  if (
    input.detectorId === HEADWAY_RELIABILITY_EWT_DETECTOR_ID ||
    input.detectorId === BUNCHING_HOTSPOTS_DETECTOR_ID
  ) {
    const loaded = await loadStopDirectionHourFeatures({
      artifactRoot: input.artifactRoot,
      month: input.releaseMonth,
      runId: input.observedRunId,
      ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
    });
    const output =
      input.detectorId === HEADWAY_RELIABILITY_EWT_DETECTOR_ID
        ? detectHeadwayReliabilityEwt({
            detectorRunId: input.detectorRunId,
            month: input.releaseMonth,
            generatedAt: input.generatedAt,
            features: loaded.features,
            thresholds: {
              candidateLimit:
                input.candidateLimit ?? DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS.candidateLimit,
            },
          })
        : detectBunchingHotspots({
            detectorRunId: input.detectorRunId,
            month: input.releaseMonth,
            generatedAt: input.generatedAt,
            features: loaded.features,
            thresholds: {
              candidateLimit:
                input.candidateLimit ?? DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS.candidateLimit,
            },
          });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: loaded.summary,
        output,
      }),
    };
  }

  if (input.detectorId === RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID) {
    const loaded = await loadStopDirectionHourFeatures({
      artifactRoot: input.artifactRoot,
      month: input.releaseMonth,
      runId: input.observedRunId,
      ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
    });
    const resolved = buildRiderWeightedExcessWaitFeatures({
      stopFeatures: loaded.features,
      ridershipRows: queryRouteHourlyRidershipRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    });
    const output = detectRiderWeightedExcessWait({
      detectorRunId: input.detectorRunId,
      month: input.releaseMonth,
      generatedAt: input.generatedAt,
      features: resolved.features,
      thresholds: {
        candidateLimit:
          input.candidateLimit ?? DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS.candidateLimit,
      },
    });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: { ...loaded.summary, ...resolved.summary },
        output,
      }),
    };
  }

  if (
    input.detectorId === SCHEDULE_MISMATCH_DETECTOR_ID ||
    input.detectorId === TRAVEL_TIME_VARIABILITY_DETECTOR_ID
  ) {
    const runtime = buildRouteDirectionDaypartFeatures({
      observedRows: queryObservedRuntimeRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      scheduledRows: queryScheduledRuntimeRows({
        sqlite: input.sqlite,
        sourceYear: Number(input.releaseMonth.slice(0, 4)),
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      minObservedTrips: Math.min(
        DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS.minObservedTrips,
        DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS.minObservedTrips,
      ),
    });
    const output =
      input.detectorId === SCHEDULE_MISMATCH_DETECTOR_ID
        ? detectScheduleMismatch({
            detectorRunId: input.detectorRunId,
            month: input.releaseMonth,
            generatedAt: input.generatedAt,
            features: runtime.features,
            thresholds: {
              candidateLimit:
                input.candidateLimit ?? DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS.candidateLimit,
            },
          })
        : detectTravelTimeVariability({
            detectorRunId: input.detectorRunId,
            month: input.releaseMonth,
            generatedAt: input.generatedAt,
            features: runtime.features,
            thresholds: {
              candidateLimit:
                input.candidateLimit ??
                DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS.candidateLimit,
            },
          });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: runtime.summary,
        output,
      }),
    };
  }

  if (input.detectorId === DEGRADATION_TREND_DETECTOR_ID) {
    const history = buildRouteMetricHistoryFeatures({
      rows: queryRouteMetricHistoryRows({
        sqlite: input.sqlite,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      releaseMonth: input.releaseMonth,
      historyStartMonth: input.historyStartMonth,
      minHistoryPoints: DEFAULT_DEGRADATION_TREND_THRESHOLDS.minHistoryPoints,
    });
    const output = detectDegradationTrends({
      detectorRunId: input.detectorRunId,
      month: input.releaseMonth,
      generatedAt: input.generatedAt,
      features: history.features,
      thresholds: {
        candidateLimit: input.candidateLimit ?? DEFAULT_DEGRADATION_TREND_THRESHOLDS.candidateLimit,
      },
    });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: history.summary,
        output,
      }),
    };
  }

  if (input.detectorId === POSITIVE_DEVIANCE_DETECTOR_ID) {
    const resolved = buildPositiveDevianceFeatures({
      rows: queryRouteMetricHistoryRows({
        sqlite: input.sqlite,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      releaseMonth: input.releaseMonth,
      minPeerCount: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.minPeerCount,
      minStablePeriods: DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.minStablePeriods,
    });
    const output = detectPositiveDeviance({
      detectorRunId: input.detectorRunId,
      month: input.releaseMonth,
      generatedAt: input.generatedAt,
      features: resolved.features,
      thresholds: {
        candidateLimit: input.candidateLimit ?? DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS.candidateLimit,
      },
    });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: resolved.summary,
        output,
      }),
    };
  }

  if (input.detectorId === INTERVENTION_EVENT_STUDY_DETECTOR_ID) {
    const resolved = buildInterventionPanelFeatures({
      rows: queryInterventionComparisonRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    });
    const output = detectInterventionEventStudies({
      detectorRunId: input.detectorRunId,
      month: input.releaseMonth,
      generatedAt: input.generatedAt,
      features: resolved.features,
      thresholds: {
        candidateLimit:
          input.candidateLimit ?? DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS.candidateLimit,
      },
    });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: resolved.summary,
        output,
      }),
    };
  }

  if (input.detectorId === DELAY_CONCENTRATION_DETECTOR_ID) {
    const resolved = buildDelayConcentrationRoutes({
      rows: queryDelayConcentrationSegmentRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    });
    const output = detectDelayConcentration({
      detectorRunId: input.detectorRunId,
      month: input.releaseMonth,
      generatedAt: input.generatedAt,
      routes: resolved.routes,
      thresholds: DEFAULT_DELAY_CONCENTRATION_THRESHOLDS,
    });
    return {
      output,
      artifact: buildRegistryDetectorRunArtifact({
        detectorId: input.detectorId,
        detectorRunId: input.detectorRunId,
        releaseMonth: input.releaseMonth,
        generatedAt: input.generatedAt,
        dbPath: input.dbPath,
        artifactPath: input.artifactPath,
        wroteDb: input.wroteDb,
        inputSummary: resolved.summary,
        output,
      }),
    };
  }

  throw new Error(`findings run-detector does not yet support ${input.detectorId}`);
}

export default defineCommand({
  path: ["findings", "run-detector"],
  summary: "Run a registry detector through typed feature-contract resolvers.",
  input: {
    options: dbOptions.extend({
      detectorId: z.string().default(SPEED_PACE_HOTSPOT_DETECTOR_ID),
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z.string().regex(/^\d{4}-\d{2}$/).default("2023-04"),
      runId: z.string().optional(),
      observedRunId: z.string().optional(),
      routeId: z.string().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      writeDb: z.coerce.boolean().default(false),
      candidateLimit: arg.positiveInt().optional(),
    }),
  },
  output: z.object({
    detectorId: z.string(),
    releaseMonth: z.string(),
    outputPath: z.string(),
    wroteDb: z.boolean(),
    featureCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    coverageCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const detectorId = input.options.detectorId;
    const detectorRunId = input.options.runId ?? `${detectorId}-${releaseMonth}`;
    const observedRunId = input.options.observedRunId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? detectorRunArtifactPath({
            artifactRoot,
            releaseMonth,
            detectorId,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const local = await openLocalPipelineDb(dbPath);
    try {
      const buildInput = {
        sqlite: local.sqlite,
        detectorId,
        detectorRunId,
        releaseMonth,
        historyStartMonth: input.options.historyStartMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        artifactRoot,
        wroteDb: input.options.writeDb,
        observedRunId,
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
        ...(input.options.candidateLimit === undefined
          ? {}
          : { candidateLimit: input.options.candidateLimit }),
      };
      const { artifact, output } = await buildDetectorRun(buildInput);
      if (input.options.writeDb) {
        await replaceFindingsForMonth(local.db, {
          month: releaseMonth,
          detectorId,
          candidates: output.candidates,
          evidence: output.evidence,
          coverage: output.coverage,
        });
      }
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        detectorId,
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        wroteDb: artifact.wroteDb,
        featureCount: Number(
          artifact.inputSummary["featureCount"] ?? artifact.inputSummary["loadedFeatureCount"] ?? 0,
        ),
        candidateCount: artifact.outputSummary.candidateCount,
        coverageCount: artifact.outputSummary.coverageCount,
      };
    } finally {
      local.sqlite.close();
    }
  },
});

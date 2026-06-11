import type { Database } from "bun:sqlite";
import {
  DEGRADATION_TREND_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
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
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
  TREATMENT_SCOPE_GAP_DETECTOR_ID,
  TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
} from "@bp/analytics/detectors";
import {
  FindingReasonCodeSchema,
  type RouteMonthContextEventFeature,
  type RouteMonthSignalFeature,
  RouteMonthSignalFeatureSchema,
} from "@bp/domain/findings";
import type { DetectorStudySourceRows } from "../detector-runs/detector-study";
import type {
  DelayConcentrationSegmentSourceRow,
  InterventionComparisonSourceRow,
  RouteHourlyRidershipSourceRow,
} from "../feature-resolvers/detector-family-features";
import type {
  ObservedRuntimeSourceRow,
  RouteMetricHistorySourceRow,
  ScheduledRuntimeSourceRow,
} from "../feature-resolvers/runtime-history";
import type { SegmentDaypartSpeedSourceRow } from "../feature-resolvers/segment-daypart-speed";
import type {
  RoutePainSourceRow,
  RouteSegmentDaypartSpeedSummarySourceRow,
  RouteSegmentHistoricalSpeedSummarySourceRow,
  RouteSegmentSpeedSummarySourceRow,
} from "../feature-resolvers/treatment-detector-inputs";

export type DetectorStudyLocalDbQuery = {
  readonly sqlite: Database;
  readonly detectorId: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly observedRunId?: string;
  readonly routeId?: string;
};

function textValue(value: unknown): string | null {
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

function intValue(value: unknown, fallback = 0): number {
  return Math.trunc(numberValue(value) ?? fallback);
}

function median(values: readonly number[]): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint] ?? null;
  const left = sorted[midpoint - 1];
  const right = sorted[midpoint];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function querySpeedRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): SegmentDaypartSpeedSourceRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
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

function queryRouteHourlyRidershipRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteHourlyRidershipSourceRow[] {
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
  ) as RouteHourlyRidershipSourceRow[];
}

function queryObservedRuntimeRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): ObservedRuntimeSourceRow[] {
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
  ) as ObservedRuntimeSourceRow[];
}

function queryScheduledRuntimeRows(input: {
  sqlite: Database;
  sourceYear: number;
  routeId?: string;
}): ScheduledRuntimeSourceRow[] {
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
  ) as ScheduledRuntimeSourceRow[];
}

function queryRouteMetricHistoryRows(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
  routeId?: string;
}): RouteMetricHistorySourceRow[] {
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
  ) as RouteMetricHistorySourceRow[];
}

function buildMultiMonthSpeedPeerRoutesFromHistory(input: {
  rows: readonly RouteMetricHistorySourceRow[];
  routeId?: string;
}): MultiMonthSpeedPeerRouteInput[] {
  const parsedRows = input.rows
    .map((row) => {
      const routeId = textValue(row.route_id);
      const month = textValue(row.month);
      if (routeId === null || month === null) return null;
      return {
        routeId,
        month,
        averageSpeedMph: numberValue(row.average_speed_mph),
        speedObservationCount: intValue(row.speed_observation_count),
      };
    })
    .filter(
      (
        row,
      ): row is {
        routeId: string;
        month: string;
        averageSpeedMph: number | null;
        speedObservationCount: number;
      } => row !== null,
    );
  const rowsByMonth = new Map<string, typeof parsedRows>();
  const rowsByRoute = new Map<string, typeof parsedRows>();
  for (const row of parsedRows) {
    rowsByMonth.set(row.month, [...(rowsByMonth.get(row.month) ?? []), row]);
    rowsByRoute.set(row.routeId, [...(rowsByRoute.get(row.routeId) ?? []), row]);
  }
  const routeIds =
    input.routeId === undefined ? [...rowsByRoute.keys()].sort() : [input.routeId].sort();

  const routes: MultiMonthSpeedPeerRouteInput[] = [];
  for (const routeId of routeIds) {
    const routeRows = rowsByRoute.get(routeId);
    if (routeRows === undefined) continue;
    routes.push({
      routeId,
      observations: routeRows
        .slice()
        .sort((left, right) => left.month.localeCompare(right.month))
        .map((row) => {
          const peerRows = (rowsByMonth.get(row.month) ?? []).filter(
            (peer) =>
              peer.routeId !== routeId &&
              peer.averageSpeedMph !== null &&
              peer.speedObservationCount > 0,
          );
          const peerRouteIds = peerRows.map((peer) => peer.routeId).sort();
          return {
            month: row.month,
            hasSpeedTrend: row.averageSpeedMph !== null && row.speedObservationCount > 0,
            averageSpeedMph: row.averageSpeedMph,
            speedObservationCount: row.speedObservationCount,
            peerMedianSpeedMph: median(
              peerRows
                .map((peer) => peer.averageSpeedMph)
                .filter((speed): speed is number => speed !== null),
            ),
            peerRouteCount: peerRouteIds.length,
            peerGroupId: "system",
            peerGroupLabel: "System routes",
            peerGroupMethod: "system" as const,
            peerRouteIds,
          };
        }),
    });
  }
  return routes;
}

function queryInterventionComparisonRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): InterventionComparisonSourceRow[] {
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
  ) as InterventionComparisonSourceRow[];
}

function queryDelayConcentrationSegmentRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): DelayConcentrationSegmentSourceRow[] {
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
  ) as DelayConcentrationSegmentSourceRow[];
}

function queryRoutePainRows(input: {
  sqlite: Database;
  month: string;
  observedRunId: string;
  routeId?: string;
}): RoutePainSourceRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND b.route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        b.route_id,
        b.month,
        b.route_score,
        b.public_visible,
        b.public_visibility_reason,
        b.average_speed_mph,
        b.hotspot_count,
        r.reliability_status,
        r.min_sample_threshold,
        r.sample_count,
        r.observed_long_gap_share,
        r.excess_wait_minutes,
        r.wait_reliability_ratio
      FROM local_route_brief_summary b
      LEFT JOIN local_route_observed_reliability_summary r
        ON r.route_id = b.route_id
       AND r.month = b.month
       AND r.run_id = ?
      WHERE b.month = ?
        ${routeFilter}
      ORDER BY b.route_id
    `,
  );
  return (
    input.routeId === undefined
      ? query.all(input.observedRunId, input.month)
      : query.all(input.observedRunId, input.month, input.routeId)
  ) as RoutePainSourceRow[];
}

function queryRouteSegmentSpeedSummaryRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteSegmentSpeedSummarySourceRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        route_id || ':' || month || ':' || direction || ':' || stop_order || ':' ||
          timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
        direction,
        stop_order,
        SUM(average_road_speed_mph * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
          AS average_speed_mph,
        AVG(road_distance_miles) * 5280 AS segment_length_feet,
        COUNT(*) AS observation_count,
        SUM(bus_trip_count) AS bus_trip_count
      FROM local_route_segment_speed
      WHERE month = ?
        ${routeFilter}
      GROUP BY
        route_id,
        month,
        direction,
        stop_order,
        timepoint_stop_id,
        next_timepoint_stop_id
      ORDER BY route_id, direction, stop_order
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as RouteSegmentSpeedSummarySourceRow[];
}

function queryRouteSegmentDaypartSpeedSummaryRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteSegmentDaypartSpeedSummarySourceRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        route_id || ':' || month || ':' || direction || ':' || stop_order || ':' ||
          timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
        direction,
        stop_order,
        CASE
          WHEN hour_of_day BETWEEN 6 AND 9 THEN 'am_peak'
          WHEN hour_of_day BETWEEN 10 AND 15 THEN 'midday'
          WHEN hour_of_day BETWEEN 16 AND 19 THEN 'pm_peak'
          ELSE 'off_peak'
        END AS daypart,
        SUM(average_road_speed_mph * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
          AS average_speed_mph,
        COUNT(*) AS observation_count,
        SUM(bus_trip_count) AS bus_trip_count
      FROM local_route_segment_speed
      WHERE month = ?
        ${routeFilter}
      GROUP BY
        route_id,
        month,
        direction,
        stop_order,
        timepoint_stop_id,
        next_timepoint_stop_id,
        CASE
          WHEN hour_of_day BETWEEN 6 AND 9 THEN 'am_peak'
          WHEN hour_of_day BETWEEN 10 AND 15 THEN 'midday'
          WHEN hour_of_day BETWEEN 16 AND 19 THEN 'pm_peak'
          ELSE 'off_peak'
        END
      ORDER BY route_id, direction, stop_order, daypart
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as RouteSegmentDaypartSpeedSummarySourceRow[];
}

function queryRouteSegmentHistoricalSpeedSummaryRows(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
  routeId?: string;
}): RouteSegmentHistoricalSpeedSummarySourceRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        route_id || ':' || month || ':' || direction || ':' || stop_order || ':' ||
          timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
        route_id || ':' || direction || ':' || stop_order || ':' ||
          timepoint_stop_id || ':' || next_timepoint_stop_id AS stable_segment_key,
        direction,
        stop_order,
        SUM(average_road_speed_mph * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
          AS average_speed_mph,
        AVG(road_distance_miles) * 5280 AS segment_length_feet,
        COUNT(*) AS observation_count,
        SUM(bus_trip_count) AS bus_trip_count
      FROM local_route_segment_speed
      WHERE month >= ?
        AND month <= ?
        ${routeFilter}
      GROUP BY
        route_id,
        month,
        direction,
        stop_order,
        timepoint_stop_id,
        next_timepoint_stop_id
      ORDER BY route_id, direction, stop_order, month
    `,
  );
  return (
    input.routeId === undefined
      ? query.all(input.startMonth, input.endMonth)
      : query.all(input.startMonth, input.endMonth, input.routeId)
  ) as RouteSegmentHistoricalSpeedSummarySourceRow[];
}

type PersistentHotspotQueryRow = {
  readonly routeId: unknown;
  readonly speedObservationCount: unknown;
  readonly segmentCount: unknown;
  readonly segmentId: unknown;
  readonly hotspotRank: unknown;
  readonly direction: unknown;
  readonly stopOrder: unknown;
  readonly timepointStopName: unknown;
  readonly nextTimepointStopName: unknown;
  readonly observationCount: unknown;
  readonly busTripCount: unknown;
  readonly weightedAverageSpeedMph: unknown;
  readonly slowWindowShare: unknown;
  readonly speedSeverity: unknown;
  readonly hotspotScore: unknown;
  readonly riderImpactScore: unknown;
  readonly ridershipExposure: unknown;
};

type MutablePersistentSpeedHotspotRouteInput = Omit<
  PersistentSpeedHotspotRouteInput,
  "hotspots"
> & {
  readonly hotspots: PersistentSpeedHotspotRouteInput["hotspots"][number][];
};

function queryPersistentSpeedHotspotRoutes(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): PersistentSpeedHotspotRouteInput[] {
  const routeFilter = input.routeId === undefined ? "" : "AND s.route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        s.route_id AS routeId,
        s.observation_count AS speedObservationCount,
        s.segment_count AS segmentCount,
        h.segment_id AS segmentId,
        h.hotspot_rank AS hotspotRank,
        h.direction AS direction,
        h.stop_order AS stopOrder,
        h.timepoint_stop_name AS timepointStopName,
        h.next_timepoint_stop_name AS nextTimepointStopName,
        h.observation_count AS observationCount,
        h.bus_trip_count AS busTripCount,
        h.weighted_average_speed_mph AS weightedAverageSpeedMph,
        h.slow_window_share AS slowWindowShare,
        h.speed_severity AS speedSeverity,
        h.hotspot_score AS hotspotScore,
        h.rider_impact_score AS riderImpactScore,
        h.ridership_exposure AS ridershipExposure
      FROM local_route_hotspot_summary s
      LEFT JOIN local_route_hotspot h
        ON h.route_id = s.route_id
       AND h.month = s.month
      WHERE s.month = ?
        ${routeFilter}
      ORDER BY s.route_id, h.hotspot_rank
    `,
  );
  const rows = (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as PersistentHotspotQueryRow[];
  const routes = new Map<string, MutablePersistentSpeedHotspotRouteInput>();

  for (const row of rows) {
    const routeId = textValue(row.routeId);
    if (routeId === null) continue;
    const route = routes.get(routeId) ?? {
      routeId,
      hasSpeedData: intValue(row.speedObservationCount) > 0,
      speedObservationCount: intValue(row.speedObservationCount),
      segmentCount: intValue(row.segmentCount),
      hotspots: [],
    };
    const segmentId = textValue(row.segmentId);
    if (segmentId !== null) {
      const direction = textValue(row.direction);
      const timepointStopName = textValue(row.timepointStopName);
      const nextTimepointStopName = textValue(row.nextTimepointStopName);
      const weightedAverageSpeedMph = numberValue(row.weightedAverageSpeedMph);
      const slowWindowShare = numberValue(row.slowWindowShare);
      const speedSeverity = numberValue(row.speedSeverity);
      const hotspotScore = numberValue(row.hotspotScore);
      if (
        direction !== null &&
        timepointStopName !== null &&
        nextTimepointStopName !== null &&
        weightedAverageSpeedMph !== null &&
        slowWindowShare !== null &&
        speedSeverity !== null &&
        hotspotScore !== null
      ) {
        route.hotspots.push({
          segmentId,
          hotspotRank: intValue(row.hotspotRank),
          direction,
          stopOrder: intValue(row.stopOrder),
          timepointStopName,
          nextTimepointStopName,
          observationCount: intValue(row.observationCount),
          busTripCount: intValue(row.busTripCount),
          weightedAverageSpeedMph,
          slowWindowShare,
          speedSeverity,
          hotspotScore,
          riderImpactScore: numberValue(row.riderImpactScore),
          ridershipExposure: numberValue(row.ridershipExposure),
        });
      }
    }
    routes.set(routeId, route);
  }
  return [...routes.values()];
}

type ObservedReliabilityQueryRow = {
  readonly routeId: unknown;
  readonly reliabilityStatus: unknown;
  readonly sampleCount: unknown;
  readonly minSampleThreshold: unknown;
  readonly observedLongGapShare: unknown;
  readonly waitReliabilityRatio: unknown;
  readonly excessWaitMinutes: unknown;
  readonly scheduledBaselineHeadwaySampleCount: unknown;
  readonly busWaitAssessmentTripCount: unknown;
  readonly busWaitAssessment: unknown;
};

function observedReliabilityStatus(
  value: unknown,
): ObservedReliabilityRouteInput["reliabilityStatus"] {
  const status = textValue(value);
  if (status === "observed" || status === "insufficient_gtfs_rt_samples") return status;
  return "missing";
}

function queryObservedReliabilityRoutes(input: {
  sqlite: Database;
  month: string;
  observedRunId: string;
  routeId?: string;
}): ObservedReliabilityRouteInput[] {
  const routeFilter = input.routeId === undefined ? "" : "AND r.route_id = ?";
  const query = input.sqlite.query(
    `
      WITH bus_wait AS (
        SELECT
          route_id,
          month,
          SUM(trips_passing_wait) AS busWaitAssessmentTripCount,
          SUM(wait_assessment * COALESCE(NULLIF(scheduled_trips, 0), trips_passing_wait)) /
            NULLIF(SUM(COALESCE(NULLIF(scheduled_trips, 0), trips_passing_wait)), 0)
            AS busWaitAssessment
        FROM local_bus_wait_assessment
        WHERE month = ?
        GROUP BY route_id, month
      )
      SELECT
        r.route_id AS routeId,
        r.reliability_status AS reliabilityStatus,
        r.sample_count AS sampleCount,
        r.min_sample_threshold AS minSampleThreshold,
        r.observed_long_gap_share AS observedLongGapShare,
        r.wait_reliability_ratio AS waitReliabilityRatio,
        r.excess_wait_minutes AS excessWaitMinutes,
        COALESCE(b.headway_sample_count, 0) AS scheduledBaselineHeadwaySampleCount,
        COALESCE(w.busWaitAssessmentTripCount, 0) AS busWaitAssessmentTripCount,
        w.busWaitAssessment AS busWaitAssessment
      FROM local_route_observed_reliability_summary r
      LEFT JOIN local_route_reliability_baseline b
        ON b.route_id = r.route_id
       AND b.month = r.month
      LEFT JOIN bus_wait w
        ON w.route_id = r.route_id
       AND w.month = r.month
      WHERE r.month = ?
        AND r.run_id = ?
        ${routeFilter}
      ORDER BY r.route_id
    `,
  );
  const rows = (
    input.routeId === undefined
      ? query.all(input.month, input.month, input.observedRunId)
      : query.all(input.month, input.month, input.observedRunId, input.routeId)
  ) as ObservedReliabilityQueryRow[];

  return rows
    .map((row) => {
      const routeId = textValue(row.routeId);
      if (routeId === null) return null;
      return {
        routeId,
        reliabilityStatus: observedReliabilityStatus(row.reliabilityStatus),
        sampleCount: intValue(row.sampleCount),
        minSampleThreshold: intValue(row.minSampleThreshold),
        observedLongGapShare: numberValue(row.observedLongGapShare),
        waitReliabilityRatio: numberValue(row.waitReliabilityRatio),
        excessWaitMinutes: numberValue(row.excessWaitMinutes),
        scheduledBaselineHeadwaySampleCount: intValue(row.scheduledBaselineHeadwaySampleCount),
        busWaitAssessmentTripCount: intValue(row.busWaitAssessmentTripCount),
        busWaitAssessment: numberValue(row.busWaitAssessment),
      };
    })
    .filter((row): row is ObservedReliabilityRouteInput => row !== null);
}

type RouteMonthSignalBaseRow = {
  readonly routeId: unknown;
  readonly month: unknown;
  readonly routeWeightedAverageSpeedMph: unknown;
  readonly speedObservationCount: unknown;
  readonly hotspotCount: unknown;
  readonly maxHotspotScore: unknown;
  readonly ridershipExposure: unknown;
};

type RouteMonthSignalContextRow = {
  readonly routeId: unknown;
  readonly sourceId: unknown;
  readonly eventKind: unknown;
  readonly touchedEventCount: unknown;
  readonly touchCount: unknown;
  readonly primaryTouchCount: unknown;
  readonly contextTouchCount: unknown;
  readonly highConfidenceTouchCount: unknown;
  readonly matchWeightSum: unknown;
  readonly averageMatchWeight: unknown;
  readonly maxRouteFanout: unknown;
  readonly computedAt: unknown;
};

type RouteMonthSignalFeatureLocalRows = {
  readonly features: RouteMonthSignalFeature[];
  readonly summary: Record<string, unknown>;
};

function isoDateTimeValue(value: unknown, fallback: string): string {
  const text = textValue(value);
  if (text === null) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function queryRouteMonthSignalBaseRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteMonthSignalBaseRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND t.route_id = ?";
  const query = input.sqlite.query(
    `
      WITH hotspot_max AS (
        SELECT route_id, month, MAX(hotspot_score) AS maxHotspotScore
        FROM local_route_hotspot
        WHERE month = ?
        GROUP BY route_id, month
      )
      SELECT
        t.route_id AS routeId,
        t.month AS month,
        COALESCE(h.route_weighted_average_speed_mph, t.average_speed_mph)
          AS routeWeightedAverageSpeedMph,
        t.speed_observation_count AS speedObservationCount,
        COALESCE(h.hotspot_count, 0) AS hotspotCount,
        hm.maxHotspotScore AS maxHotspotScore,
        COALESCE(h.ridership_exposure, t.ridership) AS ridershipExposure
      FROM local_route_month_trend t
      LEFT JOIN local_route_hotspot_summary h
        ON h.route_id = t.route_id
       AND h.month = t.month
      LEFT JOIN hotspot_max hm
        ON hm.route_id = t.route_id
       AND hm.month = t.month
      WHERE t.month = ?
        ${routeFilter}
      ORDER BY t.route_id
    `,
  );
  return (
    input.routeId === undefined
      ? query.all(input.month, input.month)
      : query.all(input.month, input.month, input.routeId)
  ) as RouteMonthSignalBaseRow[];
}

function queryRouteMonthSignalContextRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteMonthSignalContextRow[] {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id AS routeId,
        source_id AS sourceId,
        event_kind AS eventKind,
        COUNT(DISTINCT event_id) AS touchedEventCount,
        COUNT(*) AS touchCount,
        SUM(CASE WHEN evidence_role = 'primary' THEN 1 ELSE 0 END) AS primaryTouchCount,
        SUM(CASE WHEN evidence_role = 'context' THEN 1 ELSE 0 END) AS contextTouchCount,
        SUM(CASE
          WHEN join_confidence = 'high' THEN 1
          WHEN join_confidence IS NULL AND match_weight >= 0.5 AND route_fanout <= 3 THEN 1
          ELSE 0
        END)
          AS highConfidenceTouchCount,
        COALESCE(SUM(match_weight), 0) AS matchWeightSum,
        COALESCE(AVG(match_weight), 0) AS averageMatchWeight,
        COALESCE(MAX(route_fanout), 0) AS maxRouteFanout,
        MAX(computed_at) AS computedAt
      FROM local_context_event_route_touch
      WHERE substr(occurred_at, 1, 7) = ?
        ${routeFilter}
      GROUP BY route_id, source_id, event_kind
      ORDER BY route_id, source_id, event_kind
    `,
  );
  return (
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
  ) as RouteMonthSignalContextRow[];
}

function contextFeatureFromRow(row: RouteMonthSignalContextRow): {
  readonly routeId: string;
  readonly computedAt: string | null;
  readonly feature: RouteMonthContextEventFeature;
} | null {
  const routeId = textValue(row.routeId);
  const sourceId = textValue(row.sourceId);
  const eventKind = textValue(row.eventKind);
  if (routeId === null || sourceId === null || eventKind === null) return null;
  return {
    routeId,
    computedAt: textValue(row.computedAt),
    feature: {
      sourceId,
      eventKind,
      touchedEventCount: intValue(row.touchedEventCount),
      touchCount: intValue(row.touchCount),
      primaryTouchCount: intValue(row.primaryTouchCount),
      contextTouchCount: intValue(row.contextTouchCount),
      highConfidenceTouchCount: intValue(row.highConfidenceTouchCount),
      matchWeightSum: numberValue(row.matchWeightSum) ?? 0,
      averageMatchWeight: numberValue(row.averageMatchWeight) ?? 0,
      maxRouteFanout: intValue(row.maxRouteFanout),
    },
  };
}

export function loadRouteMonthSignalFeatureLocalDbRows(input: {
  sqlite: Database;
  month: string;
  routeId?: string;
}): RouteMonthSignalFeatureLocalRows {
  const defaultComputedAt = `${input.month}-01T00:00:00.000Z`;
  const bases = queryRouteMonthSignalBaseRows(input);
  const contextRows = queryRouteMonthSignalContextRows(input)
    .map(contextFeatureFromRow)
    .filter(
      (
        row,
      ): row is {
        readonly routeId: string;
        readonly computedAt: string | null;
        readonly feature: RouteMonthContextEventFeature;
      } => row !== null,
    );
  const baseByRoute = new Map<
    string,
    {
      routeId: string;
      month: string;
      routeWeightedAverageSpeedMph: number | null;
      speedObservationCount: number;
      hotspotCount: number;
      maxHotspotScore: number | null;
      ridershipExposure: number | null;
      hasTrendRow: boolean;
    }
  >();
  for (const row of bases) {
    const routeId = textValue(row.routeId);
    const month = textValue(row.month) ?? input.month;
    if (routeId === null) continue;
    baseByRoute.set(routeId, {
      routeId,
      month,
      routeWeightedAverageSpeedMph: numberValue(row.routeWeightedAverageSpeedMph),
      speedObservationCount: intValue(row.speedObservationCount),
      hotspotCount: intValue(row.hotspotCount),
      maxHotspotScore: numberValue(row.maxHotspotScore),
      ridershipExposure: numberValue(row.ridershipExposure),
      hasTrendRow: true,
    });
  }

  const contextByRoute = new Map<string, typeof contextRows>();
  for (const row of contextRows) {
    contextByRoute.set(row.routeId, [...(contextByRoute.get(row.routeId) ?? []), row]);
    if (!baseByRoute.has(row.routeId)) {
      baseByRoute.set(row.routeId, {
        routeId: row.routeId,
        month: input.month,
        routeWeightedAverageSpeedMph: null,
        speedObservationCount: 0,
        hotspotCount: 0,
        maxHotspotScore: null,
        ridershipExposure: null,
        hasTrendRow: false,
      });
    }
  }

  const features = [...baseByRoute.values()]
    .sort((left, right) => left.routeId.localeCompare(right.routeId))
    .map((base) => {
      const context = contextByRoute.get(base.routeId) ?? [];
      const contextEventCounts = context.map((row) => row.feature);
      const permitRows = contextEventCounts.filter((row) => row.eventKind === "permit");
      const permitTouchedEventCount = permitRows.reduce(
        (total, row) => total + row.touchedEventCount,
        0,
      );
      const contextTouchedEventCount = contextEventCounts.reduce(
        (total, row) => total + row.touchedEventCount,
        0,
      );
      const contextHighConfidenceTouchCount = contextEventCounts.reduce(
        (total, row) => total + row.highConfidenceTouchCount,
        0,
      );
      const isComputable =
        base.routeWeightedAverageSpeedMph !== null && base.speedObservationCount > 0;
      const sourceRefs = [
        ...(base.hasTrendRow ? [`local_route_month_trend:${base.routeId}:${base.month}`] : []),
        ...(base.hotspotCount > 0 || base.maxHotspotScore !== null
          ? [`local_route_hotspot_summary:${base.routeId}:${base.month}`]
          : []),
        ...(contextEventCounts.length > 0
          ? [`local_context_event_route_touch:${base.routeId}:${base.month}`]
          : []),
      ];
      const latestComputedAt = context
        .map((row) => isoDateTimeValue(row.computedAt, defaultComputedAt))
        .sort()
        .at(-1);

      return RouteMonthSignalFeatureSchema.parse({
        scope: "route",
        scopeId: base.routeId,
        routeId: base.routeId,
        month: base.month,
        window: "all_day",
        direction: null,
        routeWeightedAverageSpeedMph: base.routeWeightedAverageSpeedMph,
        speedObservationCount: base.speedObservationCount,
        hotspotCount: base.hotspotCount,
        maxHotspotScore: base.maxHotspotScore,
        ridershipExposure: base.ridershipExposure,
        permitTouchedEventCount,
        permitTouchCount: permitRows.reduce((total, row) => total + row.touchCount, 0),
        permitRouteCount: permitRows.reduce((max, row) => Math.max(max, row.maxRouteFanout), 0),
        permitSources: [...new Set(permitRows.map((row) => row.sourceId))].sort(),
        contextTouchedEventCount,
        contextTouchCount: contextEventCounts.reduce((total, row) => total + row.touchCount, 0),
        contextPrimaryTouchCount: contextEventCounts.reduce(
          (total, row) => total + row.primaryTouchCount,
          0,
        ),
        contextHighConfidenceTouchCount,
        contextEventCounts,
        sampleSupport: base.speedObservationCount,
        uncertainty: {
          speedObservationCount: base.speedObservationCount,
          permitTouchedEventCount,
          contextTouchedEventCount,
          contextHighConfidenceTouchCount,
        },
        provenance: {
          featureComputedAt: latestComputedAt ?? defaultComputedAt,
          derivationVersion: "local-route-month-signal-v1",
          sourceRefs,
        },
        coverage: {
          isComputable,
          skippedReasonCode: isComputable ? null : FindingReasonCodeSchema.parse("missing_speed"),
          inputsSeenJson: JSON.stringify({
            routeWeightedAverageSpeedMph: base.routeWeightedAverageSpeedMph,
            speedObservationCount: base.speedObservationCount,
            hotspotCount: base.hotspotCount,
            maxHotspotScore: base.maxHotspotScore,
            contextEventCountRowCount: contextEventCounts.length,
          }),
          inputsExpectedJson: JSON.stringify({
            requiredTables: [
              "local_route_month_trend",
              "local_route_hotspot_summary",
              "local_context_event_route_touch",
            ],
            window: "all_day",
            routeWeightedAverageSpeedMph: "number",
            speedObservationCount: ">0",
          }),
        },
      });
    });

  return {
    features,
    summary: {
      sourceKind: "route_month_signal_features_from_local_sqlite",
      featureCount: features.length,
      computableFeatureCount: features.filter((feature) => feature.coverage.isComputable).length,
      permitTouchedFeatureCount: features.filter((feature) => feature.permitTouchedEventCount > 0)
        .length,
      contextTouchedFeatureCount: features.filter((feature) => feature.contextTouchedEventCount > 0)
        .length,
      contextSourceCount: new Set(contextRows.map((row) => row.feature.sourceId)).size,
      detectorCandidateCount: 0,
    },
  };
}

export function loadDetectorStudyLocalDbRows(
  input: DetectorStudyLocalDbQuery,
): DetectorStudySourceRows {
  if (input.detectorId === SPEED_PACE_HOTSPOT_DETECTOR_ID) {
    return {
      speedRows: querySpeedRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (input.detectorId === RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID) {
    return {
      routeHourlyRidershipRows: queryRouteHourlyRidershipRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (
    input.detectorId === SCHEDULE_MISMATCH_DETECTOR_ID ||
    input.detectorId === TRAVEL_TIME_VARIABILITY_DETECTOR_ID
  ) {
    return {
      observedRuntimeRows: queryObservedRuntimeRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      scheduledRuntimeRows: queryScheduledRuntimeRows({
        sqlite: input.sqlite,
        sourceYear: Number(input.releaseMonth.slice(0, 4)),
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (
    input.detectorId === DEGRADATION_TREND_DETECTOR_ID ||
    input.detectorId === POSITIVE_DEVIANCE_DETECTOR_ID
  ) {
    return {
      routeMetricHistoryRows: queryRouteMetricHistoryRows({
        sqlite: input.sqlite,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (input.detectorId === MULTI_MONTH_SPEED_PEER_DETECTOR_ID) {
    const routeMetricHistoryRows = queryRouteMetricHistoryRows({
      sqlite: input.sqlite,
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    });
    return {
      routeMetricHistoryRows,
      multiMonthSpeedPeerRoutes: buildMultiMonthSpeedPeerRoutesFromHistory({
        rows: routeMetricHistoryRows,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (input.detectorId === INTERVENTION_EVENT_STUDY_DETECTOR_ID) {
    return {
      interventionComparisonRows: queryInterventionComparisonRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      routeMetricHistoryRows: queryRouteMetricHistoryRows({
        sqlite: input.sqlite,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
      }),
    };
  }

  if (input.detectorId === INTERVENTION_GAP_DETECTOR_ID) {
    return {
      routePainRows: queryRoutePainRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        observedRunId: input.observedRunId ?? `bus-observatory-${input.releaseMonth}`,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (input.detectorId === INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID) {
    return {
      routePainRows: queryRoutePainRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        observedRunId: input.observedRunId ?? `bus-observatory-${input.releaseMonth}`,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      interventionComparisonRows: queryInterventionComparisonRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (
    input.detectorId === TREATMENT_SCOPE_MISMATCH_DETECTOR_ID ||
    input.detectorId === TREATMENT_SCOPE_GAP_DETECTOR_ID
  ) {
    return {
      routeSegmentSpeedSummaryRows: queryRouteSegmentSpeedSummaryRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      routeSegmentDaypartSpeedSummaryRows: queryRouteSegmentDaypartSpeedSummaryRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
      routeSegmentHistoricalSpeedSummaryRows: queryRouteSegmentHistoricalSpeedSummaryRows({
        sqlite: input.sqlite,
        startMonth: input.historyStartMonth,
        endMonth: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (input.detectorId === PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID) {
    return {
      persistentSpeedHotspotRoutes: queryPersistentSpeedHotspotRoutes({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (input.detectorId === OBSERVED_RELIABILITY_DETECTOR_ID) {
    return {
      observedReliabilityRoutes: queryObservedReliabilityRoutes({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        observedRunId: input.observedRunId ?? `bus-observatory-${input.releaseMonth}`,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  if (
    input.detectorId === PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID ||
    input.detectorId === SERVICE_REQUEST_CONTEXT_DETECTOR_ID
  ) {
    const loaded = loadRouteMonthSignalFeatureLocalDbRows({
      sqlite: input.sqlite,
      month: input.releaseMonth,
      ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
    });
    return {
      routeMonthSignalFeatures: loaded.features,
      routeMonthSignalFeatureSummary: loaded.summary,
    };
  }

  if (input.detectorId === DELAY_CONCENTRATION_DETECTOR_ID) {
    return {
      delayConcentrationSegmentRows: queryDelayConcentrationSegmentRows({
        sqlite: input.sqlite,
        month: input.releaseMonth,
        ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
      }),
    };
  }

  return {};
}

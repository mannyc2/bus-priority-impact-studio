import type { Database } from "bun:sqlite";
import {
  DEGRADATION_TREND_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
  INTERVENTION_GAP_DETECTOR_ID,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  TREATMENT_SCOPE_GAP_DETECTOR_ID,
  TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
} from "@bp/analytics/detectors";
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

import type { Database } from "bun:sqlite";
import type {
  ObservedRuntimeSourceRow,
  RouteMetricHistorySourceRow,
  ScheduledRuntimeSourceRow,
} from "../feature-resolvers";

export type RuntimeTrendScoreVectorLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

export type RuntimeTrendScoreVectorLocalDbRows = {
  readonly months: string[];
  readonly scheduledRowsByYear: ReadonlyMap<number, readonly ScheduledRuntimeSourceRow[]>;
  readonly observedRowsByMonth: ReadonlyMap<string, readonly ObservedRuntimeSourceRow[]>;
  readonly routeMetricHistoryRows: readonly RouteMetricHistorySourceRow[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function queryMonths(input: RuntimeTrendScoreVectorLocalDbQuery): string[] {
  const rows = input.sqlite
    .query(
      `
        SELECT DISTINCT month
        FROM local_route_segment_speed
        WHERE month >= ? AND month <= ?
        ORDER BY month
      `,
    )
    .all(input.startMonth, input.endMonth) as Array<{ month?: unknown }>;
  return rows.map((row) => text(row.month)).filter((month): month is string => month !== null);
}

function queryObservedRuntimeRows(
  input: RuntimeTrendScoreVectorLocalDbQuery & { readonly month: string },
): ObservedRuntimeSourceRow[] {
  return input.sqlite
    .query(
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
        GROUP BY route_id, month, direction, daypart, timestamp
        HAVING runtime_minutes > 0
        ORDER BY route_id, direction, daypart, timestamp
      `,
    )
    .all(input.month) as ObservedRuntimeSourceRow[];
}

function queryScheduledRuntimeRows(
  input: RuntimeTrendScoreVectorLocalDbQuery & { readonly sourceYear: number },
): ScheduledRuntimeSourceRow[] {
  return input.sqlite
    .query(
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
          (CAST(strftime('%s', end_time) AS REAL) - CAST(strftime('%s', start_time) AS REAL)) / 60.0
            AS runtime_minutes
        FROM trips
        WHERE start_time IS NOT NULL
          AND end_time IS NOT NULL
          AND runtime_minutes BETWEEN 1 AND 300
        ORDER BY route_id, direction, daypart
      `,
    )
    .all(input.sourceYear) as ScheduledRuntimeSourceRow[];
}

function queryRouteMetricHistoryRows(
  input: RuntimeTrendScoreVectorLocalDbQuery,
): RouteMetricHistorySourceRow[] {
  return input.sqlite
    .query(
      `
        SELECT route_id, month, speed_observation_count, average_speed_mph
        FROM local_route_month_trend
        WHERE month >= ?
          AND month <= ?
        ORDER BY route_id, month
      `,
    )
    .all(input.startMonth, input.endMonth) as RouteMetricHistorySourceRow[];
}

export function loadRuntimeTrendScoreVectorLocalDbRows(
  input: RuntimeTrendScoreVectorLocalDbQuery,
): RuntimeTrendScoreVectorLocalDbRows {
  const months = queryMonths(input);
  const scheduledRowsByYear = new Map<number, readonly ScheduledRuntimeSourceRow[]>();
  const observedRowsByMonth = new Map<string, readonly ObservedRuntimeSourceRow[]>();
  for (const month of months) {
    const year = Number(month.slice(0, 4));
    if (!scheduledRowsByYear.has(year)) {
      scheduledRowsByYear.set(year, queryScheduledRuntimeRows({ ...input, sourceYear: year }));
    }
    observedRowsByMonth.set(month, queryObservedRuntimeRows({ ...input, month }));
  }

  return {
    months,
    scheduledRowsByYear,
    observedRowsByMonth,
    routeMetricHistoryRows: queryRouteMetricHistoryRows(input),
  };
}

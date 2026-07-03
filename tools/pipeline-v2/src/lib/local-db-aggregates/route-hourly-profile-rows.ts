import type { Database } from "bun:sqlite";

export type RouteMonthHourlyProfileRow = {
  route_id: string;
  month: string;
  hourly_row_count: number;
  total_ridership: number;
  total_transfers: number;
  peak_day_of_week: string | null;
  peak_hour_of_day: number | null;
  peak_ridership: number | null;
};

export type RouteHourlyProfileHourRow = {
  route_id: string;
  month: string;
  hour_of_day: number;
  ridership_hourly_row_count: number;
  ridership: number | null;
  transfers: number | null;
  speed_observation_count: number;
  speed_bus_trip_count: number;
  average_speed_mph: number | null;
};

export type RouteHourlyProfileSlowestWindowRow = {
  route_id: string;
  month: string;
  day_of_week: string;
  hour_of_day: number;
  observation_count: number;
  bus_trip_count: number;
  weighted_average_speed_mph: number | null;
};

export type RouteHourlyProfileReliabilitySampleRow = {
  route_id: string;
  month: string;
  hour_of_day: number;
  sample_count: number;
  average_observed_headway_minutes: number;
};

export type RouteHourlyProfileLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

export function loadRouteHourlyProfileLocalDbRows(
  input: RouteHourlyProfileLocalDbQuery,
): readonly RouteMonthHourlyProfileRow[] {
  return input.sqlite
    .query<RouteMonthHourlyProfileRow, [string, string, string, string]>(
      `
        WITH ranked AS (
          SELECT
            route_id,
            month,
            day_of_week,
            hour_of_day,
            ridership,
            ROW_NUMBER() OVER (
              PARTITION BY route_id, month
              ORDER BY ridership DESC, transfers DESC, day_of_week, hour_of_day
            ) AS ridership_rank
          FROM local_route_hourly_ridership
          WHERE month >= ? AND month <= ?
        ),
        totals AS (
          SELECT
            route_id,
            month,
            COUNT(*) AS hourly_row_count,
            SUM(ridership) AS total_ridership,
            SUM(transfers) AS total_transfers
          FROM local_route_hourly_ridership
          WHERE month >= ? AND month <= ?
          GROUP BY route_id, month
        )
        SELECT
          totals.route_id,
          totals.month,
          totals.hourly_row_count,
          totals.total_ridership,
          totals.total_transfers,
          ranked.day_of_week AS peak_day_of_week,
          ranked.hour_of_day AS peak_hour_of_day,
          ranked.ridership AS peak_ridership
        FROM totals
        LEFT JOIN ranked
          ON ranked.route_id = totals.route_id
         AND ranked.month = totals.month
         AND ranked.ridership_rank = 1
        ORDER BY totals.month, totals.route_id
      `,
    )
    .all(input.startMonth, input.endMonth, input.startMonth, input.endMonth);
}

export function loadRouteHourlyProfileHourRows(
  input: RouteHourlyProfileLocalDbQuery,
): readonly RouteHourlyProfileHourRow[] {
  return input.sqlite
    .query<RouteHourlyProfileHourRow, [string, string, string, string]>(
      `
        WITH ridership AS (
          SELECT
            route_id,
            month,
            hour_of_day,
            COUNT(*) AS ridership_hourly_row_count,
            SUM(ridership) AS ridership,
            SUM(transfers) AS transfers
          FROM local_route_hourly_ridership
          WHERE month >= ? AND month <= ?
          GROUP BY route_id, month, hour_of_day
        ),
        speed AS (
          SELECT
            route_id,
            month,
            hour_of_day,
            COUNT(*) AS speed_observation_count,
            SUM(bus_trip_count) AS speed_bus_trip_count,
            CASE
              WHEN SUM(bus_trip_count) > 0
              THEN ROUND(SUM(average_road_speed_mph * bus_trip_count) / SUM(bus_trip_count), 2)
              ELSE NULL
            END AS average_speed_mph
          FROM local_route_segment_speed
          WHERE month >= ? AND month <= ?
          GROUP BY route_id, month, hour_of_day
        ),
        keys AS (
          SELECT route_id, month, hour_of_day FROM ridership
          UNION
          SELECT route_id, month, hour_of_day FROM speed
        )
        SELECT
          keys.route_id,
          keys.month,
          keys.hour_of_day,
          COALESCE(ridership.ridership_hourly_row_count, 0) AS ridership_hourly_row_count,
          ridership.ridership,
          ridership.transfers,
          COALESCE(speed.speed_observation_count, 0) AS speed_observation_count,
          COALESCE(speed.speed_bus_trip_count, 0) AS speed_bus_trip_count,
          speed.average_speed_mph
        FROM keys
        LEFT JOIN ridership
          ON ridership.route_id = keys.route_id
         AND ridership.month = keys.month
         AND ridership.hour_of_day = keys.hour_of_day
        LEFT JOIN speed
          ON speed.route_id = keys.route_id
         AND speed.month = keys.month
         AND speed.hour_of_day = keys.hour_of_day
        ORDER BY keys.route_id, keys.month, keys.hour_of_day
      `,
    )
    .all(input.startMonth, input.endMonth, input.startMonth, input.endMonth);
}

export function loadRouteHourlyProfileSlowestWindowRows(
  input: RouteHourlyProfileLocalDbQuery,
): readonly RouteHourlyProfileSlowestWindowRow[] {
  return input.sqlite
    .query<RouteHourlyProfileSlowestWindowRow, [string, string]>(
      `
        WITH scored AS (
          SELECT
            route_id,
            month,
            day_of_week,
            hour_of_day,
            COUNT(*) AS observation_count,
            SUM(bus_trip_count) AS bus_trip_count,
            CASE
              WHEN SUM(bus_trip_count) > 0
              THEN ROUND(SUM(average_road_speed_mph * bus_trip_count) / SUM(bus_trip_count), 2)
              ELSE NULL
            END AS weighted_average_speed_mph
          FROM local_route_segment_speed
          WHERE month >= ? AND month <= ?
          GROUP BY route_id, month, day_of_week, hour_of_day
          HAVING SUM(bus_trip_count) > 0
        ),
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY route_id, month
              ORDER BY weighted_average_speed_mph ASC, observation_count DESC, day_of_week, hour_of_day
            ) AS speed_rank
          FROM scored
        )
        SELECT
          route_id,
          month,
          day_of_week,
          hour_of_day,
          observation_count,
          bus_trip_count,
          weighted_average_speed_mph
        FROM ranked
        WHERE speed_rank = 1
        ORDER BY route_id, month
      `,
    )
    .all(input.startMonth, input.endMonth);
}

export function loadRouteHourlyProfileReliabilitySampleRows(
  input: RouteHourlyProfileLocalDbQuery,
): readonly RouteHourlyProfileReliabilitySampleRow[] {
  return input.sqlite
    .query<RouteHourlyProfileReliabilitySampleRow, [string]>(
      `
        WITH observed AS (
          SELECT route_id, month, run_id
          FROM local_route_observed_reliability_summary
          WHERE month = ?
            AND reliability_status = 'observed'
            AND sample_count > 0
        )
        SELECT
          samples.route_id,
          observed.month,
          CAST(strftime('%H', samples.observed_timestamp, 'unixepoch') AS INTEGER) AS hour_of_day,
          COUNT(*) AS sample_count,
          ROUND(AVG(samples.headway_minutes), 2) AS average_observed_headway_minutes
        FROM local_observed_headway_sample samples
        INNER JOIN observed
          ON observed.run_id = samples.run_id
         AND observed.route_id = samples.route_id
        GROUP BY samples.route_id, observed.month, hour_of_day
        ORDER BY samples.route_id, observed.month, hour_of_day
      `,
    )
    .all(input.endMonth);
}

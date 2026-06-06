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

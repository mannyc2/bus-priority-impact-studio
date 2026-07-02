import type { Database } from "bun:sqlite";
import type {
  RouteSpeedHistorySourceRow,
  RouteSpeedScheduleStopRow,
} from "@bp/analytics/feature-history";

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function monthStart(month: string): string {
  return `${month}-01T00:00:00.000`;
}

function nextMonthStart(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const date = new Date(Date.UTC(year, monthIndex + 1, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}-01T00:00:00.000`;
}

function daysInMonth(month: string): number {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function monthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  let cursor = startMonth;
  while (cursor <= endMonth) {
    months.push(cursor);
    cursor = nextMonthStart(cursor).slice(0, 7);
  }
  return months;
}

export function loadCompleteRouteSpeedScheduleMonths(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
}): Set<string> {
  if (!tableExists(input.sqlite, "local_route_schedule_stop")) return new Set();
  const months = monthRange(input.startMonth, input.endMonth);
  const rows = input.sqlite
    .query(
      `
        SELECT
          substr(schedule_date, 1, 7) AS month,
          COUNT(DISTINCT substr(schedule_date, 1, 10)) AS day_count
        FROM local_route_schedule_stop
        WHERE schedule_date >= ? AND schedule_date < ?
        GROUP BY month
      `,
    )
    .all(monthStart(input.startMonth), nextMonthStart(input.endMonth)) as Array<{
    month?: unknown;
    day_count?: unknown;
  }>;
  const daysByMonth = new Map(
    rows
      .filter((row) => typeof row.month === "string")
      .map((row) => [row.month as string, Number(row.day_count ?? 0)]),
  );
  return new Set(months.filter((month) => (daysByMonth.get(month) ?? 0) >= daysInMonth(month)));
}

export function loadRouteSpeedScheduleLocalDbRows(input: {
  sqlite: Database;
  routeId: string;
  startMonth: string;
  endMonth: string;
}): RouteSpeedScheduleStopRow[] {
  if (!tableExists(input.sqlite, "local_route_schedule_stop")) return [];
  const startYear = Number(input.startMonth.slice(0, 4));
  const endYear = Number(input.endMonth.slice(0, 4));
  const sourceYears = Array.from(
    { length: endYear - startYear + 1 },
    (_, index) => startYear + index,
  );
  const placeholders = sourceYears.map(() => "?").join(", ");
  return input.sqlite
    .query(
      `
        SELECT
          schedule_date,
          direction,
          shape_id,
          stop_sequence,
          stop_id,
          schedule_time,
          block_id,
          origin,
          destination
        FROM local_route_schedule_stop
        WHERE source_year IN (${placeholders})
          AND route_id = ?
          AND schedule_date >= ?
          AND schedule_date < ?
        ORDER BY schedule_date, direction, shape_id, block_id, schedule_time, stop_sequence
      `,
    )
    .all(
      ...sourceYears,
      input.routeId,
      monthStart(input.startMonth),
      nextMonthStart(input.endMonth),
    ) as RouteSpeedScheduleStopRow[];
}

export function loadRouteSpeedHistoryLocalDbRows(input: {
  sqlite: Database;
  routeId: string;
  startMonth: string;
  endMonth: string;
}): RouteSpeedHistorySourceRow[] {
  return input.sqlite
    .query(
      `
        SELECT
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
          END AS daypart,
          COUNT(*) AS observation_count,
          SUM(bus_trip_count) AS traversal_count,
          SUM(average_road_speed_mph * bus_trip_count)
            / NULLIF(SUM(CASE WHEN average_road_speed_mph IS NULL THEN 0 ELSE bus_trip_count END), 0)
            AS average_speed_mph,
          SUM(average_travel_time_minutes * bus_trip_count)
            / NULLIF(SUM(CASE WHEN average_travel_time_minutes IS NULL THEN 0 ELSE bus_trip_count END), 0)
            AS average_travel_time_minutes,
          SUM(road_distance_miles * bus_trip_count)
            / NULLIF(SUM(CASE WHEN road_distance_miles IS NULL THEN 0 ELSE bus_trip_count END), 0)
            AS average_road_distance_miles
        FROM local_route_segment_speed
        WHERE route_id = ? AND month >= ? AND month <= ?
        GROUP BY
          route_id,
          month,
          direction,
          stop_order,
          timepoint_stop_id,
          next_timepoint_stop_id,
          daypart
        ORDER BY month, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id, daypart
      `,
    )
    .all(input.routeId, input.startMonth, input.endMonth) as RouteSpeedHistorySourceRow[];
}

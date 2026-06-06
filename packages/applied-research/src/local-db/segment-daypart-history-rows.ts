import type { Database } from "bun:sqlite";

export type SegmentDaypartHistoryRow = {
  route_id: string;
  month: string;
  segment_id: string;
  direction: string;
  daypart: string;
  observation_count: number;
  traversal_count: number;
  average_speed_mph: number | null;
  average_travel_time_minutes: number | null;
  average_road_distance_miles: number | null;
};

export type SegmentDaypartHistoryLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

export function loadSegmentDaypartHistoryLocalDbRows(
  input: SegmentDaypartHistoryLocalDbQuery,
): readonly SegmentDaypartHistoryRow[] {
  return input.sqlite
    .query<SegmentDaypartHistoryRow, [string, string]>(
      `
        SELECT
          route_id,
          month,
          route_id || ':' || direction || ':' || stop_order || ':' ||
            timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
          direction,
          CASE
            WHEN hour_of_day BETWEEN 6 AND 9 THEN 'am_peak'
            WHEN hour_of_day BETWEEN 10 AND 15 THEN 'midday'
            WHEN hour_of_day BETWEEN 16 AND 19 THEN 'pm_peak'
            ELSE 'off_peak'
          END AS daypart,
          COUNT(*) AS observation_count,
          SUM(bus_trip_count) AS traversal_count,
          AVG(average_road_speed_mph) AS average_speed_mph,
          AVG(average_travel_time_minutes) AS average_travel_time_minutes,
          AVG(road_distance_miles) AS average_road_distance_miles
        FROM local_route_segment_speed
        WHERE month >= ? AND month <= ?
        GROUP BY route_id, month, segment_id, direction, daypart
        ORDER BY month, route_id, direction, segment_id, daypart
      `,
    )
    .all(input.startMonth, input.endMonth);
}

import type { Database } from "bun:sqlite";
import type { SegmentDaypartSpeedSourceRow } from "../feature-resolvers";

export type SpeedPaceScoreVectorLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

export type SpeedPaceScoreVectorLocalDbRows = {
  readonly months: string[];
  readonly rowsByMonth: ReadonlyMap<string, readonly SegmentDaypartSpeedSourceRow[]>;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function queryMonths(input: SpeedPaceScoreVectorLocalDbQuery): string[] {
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

function queryRowsForMonth(
  input: SpeedPaceScoreVectorLocalDbQuery & { readonly month: string },
): SegmentDaypartSpeedSourceRow[] {
  return input.sqlite
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
        ORDER BY route_id, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id, hour_of_day
      `,
    )
    .all(input.month) as SegmentDaypartSpeedSourceRow[];
}

export function loadSpeedPaceScoreVectorLocalDbRows(
  input: SpeedPaceScoreVectorLocalDbQuery,
): SpeedPaceScoreVectorLocalDbRows {
  const months = queryMonths(input);
  const rowsByMonth = new Map<string, readonly SegmentDaypartSpeedSourceRow[]>();
  for (const month of months) {
    rowsByMonth.set(month, queryRowsForMonth({ ...input, month }));
  }
  return { months, rowsByMonth };
}

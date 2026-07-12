import type { Database } from "bun:sqlite";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";
import { SqlNumberSchema } from "./sqlite-schema.ts";

const StudyPanelSqlRowSchema = Schema.Struct({
  route_id: Schema.String.check(Schema.isMinLength(1)),
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/u)),
  direction: Schema.String.check(Schema.isMinLength(1)),
  stop_order: SqlNumberSchema,
  from_stop_id: Schema.String.check(Schema.isMinLength(1)),
  to_stop_id: Schema.String.check(Schema.isMinLength(1)),
  hour_of_day: SqlNumberSchema,
  borough: Schema.String.check(Schema.isMinLength(1)),
  average_speed_mph: SqlNumberSchema,
  bus_trip_count: SqlNumberSchema,
});

const StudyPanelRouteSqlRowSchema = Schema.Struct({
  route_id: Schema.String.check(Schema.isMinLength(1)),
});

export type StudyPanelSourceRow = {
  readonly routeId: string;
  readonly month: string;
  readonly direction: string;
  readonly stopOrder: number;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly hourOfDay: number;
  readonly borough: string;
  readonly averageSpeedMph: number;
  readonly busTripCount: number;
};

export function loadStudyPanelSourceRows(input: {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly routeIds: readonly string[];
}): readonly StudyPanelSourceRow[] {
  if (input.routeIds.length === 0) return [];
  const routeIds = [...new Set(input.routeIds.map((routeId) => routeId.trim().toUpperCase()))]
    .filter((routeId) => routeId.length > 0)
    .toSorted();
  if (routeIds.length === 0) return [];
  const placeholders = routeIds.map(() => "?").join(", ");
  const rows = decodeStrict(Schema.Array(StudyPanelSqlRowSchema))(
    input.sqlite
      .query(
        `
          SELECT route_id,
                 month,
                 direction,
                 stop_order,
                 timepoint_stop_id AS from_stop_id,
                 next_timepoint_stop_id AS to_stop_id,
                 hour_of_day,
                 borough,
                 SUM(average_road_speed_mph * bus_trip_count) /
                   NULLIF(SUM(bus_trip_count), 0) AS average_speed_mph,
                 SUM(bus_trip_count) AS bus_trip_count
          FROM local_route_segment_speed
          WHERE month >= ?
            AND month <= ?
            AND route_id IN (${placeholders})
            AND timepoint_stop_id IS NOT NULL
            AND next_timepoint_stop_id IS NOT NULL
            AND bus_trip_count > 0
          GROUP BY route_id, month, direction, stop_order, timepoint_stop_id,
                   next_timepoint_stop_id, hour_of_day, borough
          ORDER BY route_id, month, direction, stop_order, hour_of_day
        `,
      )
      .all(input.startMonth, input.endMonth, ...routeIds),
  );
  return rows.map((row) => ({
    routeId: row.route_id,
    month: row.month,
    direction: row.direction,
    stopOrder: row.stop_order,
    fromStopId: row.from_stop_id,
    toStopId: row.to_stop_id,
    hourOfDay: row.hour_of_day,
    borough: row.borough,
    averageSpeedMph: row.average_speed_mph,
    busTripCount: row.bus_trip_count,
  }));
}

export function loadStudyPanelRouteIds(input: {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly boroughs: readonly string[];
}): readonly string[] {
  const boroughs = [...new Set(input.boroughs.map((borough) => borough.trim()))]
    .filter((borough) => borough.length > 0)
    .toSorted();
  if (boroughs.length === 0) return [];
  const placeholders = boroughs.map(() => "?").join(", ");
  const rows = decodeStrict(Schema.Array(StudyPanelRouteSqlRowSchema))(
    input.sqlite
      .query(
        `
          SELECT DISTINCT route_id
          FROM local_route_segment_speed
          WHERE month >= ?
            AND month <= ?
            AND borough IN (${placeholders})
            AND timepoint_stop_id IS NOT NULL
            AND next_timepoint_stop_id IS NOT NULL
            AND bus_trip_count > 0
          ORDER BY route_id
        `,
      )
      .all(input.startMonth, input.endMonth, ...boroughs),
  );
  return rows.map((row) => row.route_id);
}

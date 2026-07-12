import type { Database } from "bun:sqlite";
import {
  type SegmentDaypartPanelSpec,
  segmentDaypartPanelSpecV1,
} from "@bp/analytics/feature-history";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
} from "./panel-resolution";
import { SqlNullableNumberSchema, SqlNumberSchema } from "./sqlite-schema.ts";

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

export type SegmentDaypartPanelLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: SegmentDaypartPanelSpec;
  readonly generatedAt?: string | null;
  readonly dbPath?: string;
};

export const SegmentDaypartHistoryRowSchema = Schema.Struct({
  route_id: Schema.String.check(Schema.isMinLength(1)),
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  segment_id: Schema.String.check(Schema.isMinLength(1)),
  direction: Schema.String.check(Schema.isMinLength(1)),
  daypart: Schema.String.check(Schema.isMinLength(1)),
  observation_count: SqlNumberSchema,
  traversal_count: SqlNumberSchema,
  average_speed_mph: SqlNullableNumberSchema,
  average_travel_time_minutes: SqlNullableNumberSchema,
  average_road_distance_miles: SqlNullableNumberSchema,
});

export function parseSegmentDaypartHistoryRows(
  rows: readonly unknown[],
): readonly SegmentDaypartHistoryRow[] {
  return decodeStrict(Schema.Array(SegmentDaypartHistoryRowSchema))(rows);
}

export const SEGMENT_DAYPART_HISTORY_SQL = `
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
      `;

export function loadSegmentDaypartHistoryLocalDbRows(
  input: SegmentDaypartHistoryLocalDbQuery,
): readonly SegmentDaypartHistoryRow[] {
  return parseSegmentDaypartHistoryRows(
    input.sqlite
      .query<SegmentDaypartHistoryRow, [string, string]>(SEGMENT_DAYPART_HISTORY_SQL)
      .all(input.startMonth, input.endMonth),
  );
}

export function loadSegmentDaypartPanelV1Resolution(
  input: SegmentDaypartPanelLocalDbResolutionQuery,
): LocalDbPanelResolution<SegmentDaypartHistoryRow> {
  const rows = loadSegmentDaypartHistoryLocalDbRows({
    sqlite: input.sqlite,
    startMonth: input.spec.startMonth,
    endMonth: input.spec.endMonth,
  }).filter((row) => input.spec.routeId === undefined || row.route_id === input.spec.routeId);
  const panelSpec = segmentDaypartPanelSpecV1(input.spec);
  return {
    rows,
    panelManifest: buildLocalDbPanelResolutionManifest({
      panelSpec,
      generatedAt: input.generatedAt,
      inputRefs: [
        {
          refKind: "query",
          refId: "SEGMENT_DAYPART_HISTORY_SQL",
          role: "local_db_segment_daypart_panel_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_segment_speed",
          role: "primary_daypart_speed_panel_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: rows.length,
      routeIds: rows.map((row) => row.route_id),
      entityIds: rows.map((row) => [row.segment_id, row.daypart].join(":")),
      months: rows.map((row) => row.month),
    }),
  };
}

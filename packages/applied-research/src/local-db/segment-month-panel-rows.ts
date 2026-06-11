import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  type SegmentMonthPanelSourceRow,
  type SegmentMonthPanelSpec,
  segmentMonthPanelSpecV1,
} from "../feature-resolvers/segment-month-panel";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
  uniqueSortedStrings,
} from "./panel-resolution";

export type SegmentMonthPanelLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly routeId?: string;
};

export type SegmentMonthPanelLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: SegmentMonthPanelSpec;
  readonly generatedAt?: string | null;
  readonly dbPath?: string;
};

const SqlNumberSchema = z.union([
  z.number(),
  z.bigint().transform(Number),
  z.string().pipe(z.coerce.number()),
]);

const SqlNullableNumberSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  SqlNumberSchema.nullable(),
);

export const SegmentMonthPanelSourceRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  segment_id: z.string().min(1),
  stable_segment_key: z.string().min(1).optional(),
  direction: z.string().min(1),
  stop_order: SqlNumberSchema,
  average_speed_mph: SqlNumberSchema,
  segment_length_feet: SqlNullableNumberSchema.optional(),
  observation_count: SqlNumberSchema,
  bus_trip_count: SqlNumberSchema,
});

export function parseSegmentMonthPanelSourceRows(
  rows: readonly unknown[],
): readonly SegmentMonthPanelSourceRow[] {
  return z.array(SegmentMonthPanelSourceRowSchema).parse(rows) as SegmentMonthPanelSourceRow[];
}

export function segmentMonthPanelV1Sql(input: { readonly routeFiltered?: boolean } = {}): string {
  const routeFilter = input.routeFiltered === true ? "AND route_id = ?" : "";
  return `
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
    `;
}

export function loadSegmentMonthPanelV1Rows(
  input: SegmentMonthPanelLocalDbQuery,
): readonly SegmentMonthPanelSourceRow[] {
  const query = input.sqlite.query(
    segmentMonthPanelV1Sql({ routeFiltered: input.routeId !== undefined }),
  );
  return parseSegmentMonthPanelSourceRows(
    input.routeId === undefined
      ? query.all(input.startMonth, input.endMonth)
      : query.all(input.startMonth, input.endMonth, input.routeId),
  );
}

export function loadSegmentMonthPanelV1Resolution(
  input: SegmentMonthPanelLocalDbResolutionQuery,
): LocalDbPanelResolution<SegmentMonthPanelSourceRow> {
  const rows = loadSegmentMonthPanelV1Rows({
    sqlite: input.sqlite,
    startMonth: input.spec.startMonth,
    endMonth: input.spec.endMonth,
    ...(input.spec.routeId === undefined ? {} : { routeId: input.spec.routeId }),
  });
  const panelSpec = segmentMonthPanelSpecV1(input.spec);
  const routeIds = rows.map((row) => row.route_id as string);
  const segmentIds = rows.map((row) =>
    typeof row.stable_segment_key === "string"
      ? row.stable_segment_key
      : (row.segment_id as string),
  );
  const months = rows.map((row) => row.month as string);
  return {
    rows,
    panelManifest: buildLocalDbPanelResolutionManifest({
      panelSpec,
      generatedAt: input.generatedAt,
      inputRefs: [
        {
          refKind: "query",
          refId: "segmentMonthPanelV1Sql",
          role: "local_db_segment_month_panel_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_segment_speed",
          role: "primary_speed_panel_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: rows.length,
      routeIds,
      entityIds: uniqueSortedStrings(segmentIds),
      months,
    }),
  };
}

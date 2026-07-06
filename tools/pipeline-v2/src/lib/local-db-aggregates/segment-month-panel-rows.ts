import type { Database } from "bun:sqlite";
import type { PanelSpec } from "@bp/analytics/feature-history";
import * as z from "@bp/domain/schema-compat";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
  uniqueSortedStrings,
} from "./panel-resolution";

export const SEGMENT_MONTH_PANEL_V1_ID = "segment_month_panel_v1" as const;

export type SegmentMonthPanelSpec = {
  readonly panelId: typeof SEGMENT_MONTH_PANEL_V1_ID;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly minObservationCount: number;
  readonly routeId?: string;
};

export type SegmentMonthPanelSourceRow = {
  readonly route_id: unknown;
  readonly month: unknown;
  readonly segment_id: unknown;
  readonly stable_segment_key?: unknown;
  readonly direction: unknown;
  readonly stop_order: unknown;
  readonly average_speed_mph: unknown;
  readonly segment_length_feet?: unknown;
  readonly observation_count: unknown;
  readonly bus_trip_count: unknown;
};

export function segmentMonthPanelSpecV1(input: SegmentMonthPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: SEGMENT_MONTH_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month + direction + stable_segment_key",
    timeKey: "month",
    entityKeys: ["route_id", "direction", "stop_order", "timepoint_pair"],
    measures: ["average_speed_mph", "segment_length_feet", "observation_count", "bus_trip_count"],
    joins: [],
    coverage: [
      "source_row_count",
      "supported_row_count",
      "segment_history_month_count",
      "residual_month_count",
    ],
    historyWindow: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    releaseFilter: {
      month: input.endMonth,
    },
    requiredProducts: [
      {
        productId: "local_route_segment_speed_history",
        state: "available",
        role: "source",
        reason:
          "Monthly MTA route-segment speed rows aggregated by route, month, direction, and timepoint pair.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_observation_count",
        description: "Rows with too few source observations are excluded from residual modeling.",
        threshold: input.minObservationCount,
      },
      {
        ruleId: "positive_bus_trip_count",
        description: "Rows must have positive bus trip support to avoid empty weighted averages.",
        threshold: "> 0",
      },
    ],
    negativeMeaning:
      "A clean no-hit means the segment-month was eligible for residual modeling and was not abnormal under this model; missing or unsupported rows must be represented separately.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

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
  z.preprocess((value) => (typeof value === "string" ? value : Number.NaN), z.coerce.number()),
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

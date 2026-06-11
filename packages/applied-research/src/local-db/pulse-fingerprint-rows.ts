import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  type PulseFingerprintSpec,
  pulseFingerprintPanelSpecV1,
} from "../feature-resolvers/pulse-fingerprint";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
} from "./panel-resolution";

export type PulseFingerprintSourceRow = {
  route_id: string;
  month: string;
  day_of_week: string;
  hour_of_day: number;
  direction: string;
  segment_hour_row_count: number;
  trip_count: number;
  average_speed_mph: number | null;
  average_travel_time_minutes: number | null;
};

export type PulseFingerprintLocalDbRows = {
  readonly rows: readonly PulseFingerprintSourceRow[];
};

export type PulseFingerprintLocalDbQuery = {
  readonly sqlite: Database;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly routeId?: string;
};

export type PulseFingerprintLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: PulseFingerprintSpec;
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

export const PulseFingerprintSourceRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  day_of_week: z.string().min(1),
  hour_of_day: SqlNumberSchema,
  direction: z.string().min(1),
  segment_hour_row_count: SqlNumberSchema,
  trip_count: SqlNumberSchema,
  average_speed_mph: SqlNullableNumberSchema,
  average_travel_time_minutes: SqlNullableNumberSchema,
});

export function parsePulseFingerprintSourceRows(
  rows: readonly unknown[],
): readonly PulseFingerprintSourceRow[] {
  return z.array(PulseFingerprintSourceRowSchema).parse(rows) as PulseFingerprintSourceRow[];
}

export function pulseFingerprintSql(input: { readonly routeFiltered?: boolean } = {}): string {
  const routeFilter = input.routeFiltered === true ? "AND route_id = ?" : "";
  return `
      SELECT
        route_id,
        month,
        day_of_week,
        hour_of_day,
        direction,
        COUNT(*) AS segment_hour_row_count,
        SUM(bus_trip_count) AS trip_count,
        AVG(average_road_speed_mph) AS average_speed_mph,
        AVG(average_travel_time_minutes) AS average_travel_time_minutes
      FROM local_route_segment_speed
      WHERE month >= ?
        AND month <= ?
        ${routeFilter}
      GROUP BY route_id, month, day_of_week, hour_of_day, direction
      ORDER BY route_id, direction, month, day_of_week, hour_of_day
    `;
}

export function loadPulseFingerprintLocalDbRows(
  input: PulseFingerprintLocalDbQuery,
): PulseFingerprintLocalDbRows {
  const query = input.sqlite.query(
    pulseFingerprintSql({ routeFiltered: input.routeId !== undefined }),
  );
  return {
    rows: parsePulseFingerprintSourceRows(
      input.routeId === undefined
        ? query.all(input.historyStartMonth, input.releaseMonth)
        : query.all(input.historyStartMonth, input.releaseMonth, input.routeId),
    ),
  };
}

export function loadPulseFingerprintPanelV1Resolution(
  input: PulseFingerprintLocalDbResolutionQuery,
): LocalDbPanelResolution<PulseFingerprintSourceRow> {
  const rows = loadPulseFingerprintLocalDbRows({
    sqlite: input.sqlite,
    historyStartMonth: input.spec.historyStartMonth,
    releaseMonth: input.spec.releaseMonth,
    ...(input.spec.routeId === undefined ? {} : { routeId: input.spec.routeId }),
  }).rows;
  const panelSpec = pulseFingerprintPanelSpecV1(input.spec);
  return {
    rows,
    panelManifest: buildLocalDbPanelResolutionManifest({
      panelSpec,
      generatedAt: input.generatedAt,
      inputRefs: [
        {
          refKind: "query",
          refId: "pulseFingerprintSql",
          role: "local_db_hour_of_week_pulse_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_segment_speed",
          role: "primary_pulse_fingerprint_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: rows.length,
      routeIds: rows.map((row) => row.route_id),
      entityIds: rows.map((row) => [row.route_id, row.direction].join(":")),
      months: rows.map((row) => row.month),
    }),
  };
}

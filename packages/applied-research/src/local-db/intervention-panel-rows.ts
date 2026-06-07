import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  type TreatmentEventPanelSpec,
  treatmentEventPanelSpecV1,
} from "../feature-resolvers/treatment-event-panel";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
} from "./panel-resolution";

export type InterventionComparisonRow = {
  route_id: string;
  month: string;
  event_id: string;
  intervention_type: string;
  source_id: string;
  evaluation_level: string;
  comparison_status: string;
  pre_start_month: string | null;
  pre_end_month: string | null;
  post_start_month: string | null;
  post_end_month: string | null;
  comparison_route_count: number;
  comparison_route_ids: string | null;
  speed_delta_mph: number | null;
  adjusted_speed_delta_mph: number | null;
  ridership_delta: number | null;
  adjusted_ridership_delta: number | null;
  caveat: string;
};

export type InterventionPanelLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

export type TreatmentEventPanelLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: TreatmentEventPanelSpec;
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

export const InterventionComparisonRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  event_id: z.string().min(1),
  intervention_type: z.string().min(1),
  source_id: z.string().min(1),
  evaluation_level: z.string().min(1),
  comparison_status: z.string().min(1),
  pre_start_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  pre_end_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  post_start_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  post_end_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  comparison_route_count: SqlNumberSchema,
  comparison_route_ids: z.string().nullable(),
  speed_delta_mph: SqlNullableNumberSchema,
  adjusted_speed_delta_mph: SqlNullableNumberSchema,
  ridership_delta: SqlNullableNumberSchema,
  adjusted_ridership_delta: SqlNullableNumberSchema,
  caveat: z.string(),
});

export function parseInterventionComparisonRows(
  rows: readonly unknown[],
): readonly InterventionComparisonRow[] {
  return z.array(InterventionComparisonRowSchema).parse(rows) as InterventionComparisonRow[];
}

export const INTERVENTION_PANEL_SQL = `
        SELECT
          route_id,
          month,
          event_id,
          intervention_type,
          source_id,
          evaluation_level,
          comparison_status,
          pre_start_month,
          pre_end_month,
          post_start_month,
          post_end_month,
          comparison_route_count,
          comparison_route_ids,
          speed_delta_mph,
          adjusted_speed_delta_mph,
          ridership_delta,
          adjusted_ridership_delta,
          caveat
        FROM local_route_intervention_comparison
        WHERE month >= ? AND month <= ?
        ORDER BY month, route_id, event_id
      `;

export function loadInterventionPanelLocalDbRows(
  input: InterventionPanelLocalDbQuery,
): readonly InterventionComparisonRow[] {
  return parseInterventionComparisonRows(
    input.sqlite
      .query<InterventionComparisonRow, [string, string]>(INTERVENTION_PANEL_SQL)
      .all(input.startMonth, input.endMonth),
  );
}

export function loadTreatmentEventPanelV1Resolution(
  input: TreatmentEventPanelLocalDbResolutionQuery,
): LocalDbPanelResolution<InterventionComparisonRow> {
  const rows = loadInterventionPanelLocalDbRows({
    sqlite: input.sqlite,
    startMonth: input.spec.historyStartMonth,
    endMonth: input.spec.releaseMonth,
  }).filter((row) => input.spec.routeId === undefined || row.route_id === input.spec.routeId);
  const panelSpec = treatmentEventPanelSpecV1(input.spec);
  return {
    rows,
    panelManifest: buildLocalDbPanelResolutionManifest({
      panelSpec,
      generatedAt: input.generatedAt,
      inputRefs: [
        {
          refKind: "query",
          refId: "INTERVENTION_PANEL_SQL",
          role: "local_db_treatment_event_panel_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_intervention_comparison",
          role: "route_intervention_comparison_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: rows.length,
      routeIds: rows.map((row) => row.route_id),
      entityIds: rows.map((row) => row.event_id),
      months: rows.map((row) => row.month),
    }),
  };
}

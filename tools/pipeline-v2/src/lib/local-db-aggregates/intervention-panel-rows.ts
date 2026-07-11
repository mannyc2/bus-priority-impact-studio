import type { Database } from "bun:sqlite";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";
import { SqlNullableNumberSchema, SqlNumberSchema } from "./sqlite-schema.ts";

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

export const InterventionComparisonRowSchema = Schema.Struct({
  route_id: Schema.String.check(Schema.isMinLength(1)),
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  event_id: Schema.String.check(Schema.isMinLength(1)),
  intervention_type: Schema.String.check(Schema.isMinLength(1)),
  source_id: Schema.String.check(Schema.isMinLength(1)),
  evaluation_level: Schema.String.check(Schema.isMinLength(1)),
  comparison_status: Schema.String.check(Schema.isMinLength(1)),
  pre_start_month: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  pre_end_month: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  post_start_month: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  post_end_month: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  comparison_route_count: SqlNumberSchema,
  comparison_route_ids: Schema.NullOr(Schema.String),
  speed_delta_mph: SqlNullableNumberSchema,
  adjusted_speed_delta_mph: SqlNullableNumberSchema,
  ridership_delta: SqlNullableNumberSchema,
  adjusted_ridership_delta: SqlNullableNumberSchema,
  caveat: Schema.String,
});

export function parseInterventionComparisonRows(
  rows: readonly unknown[],
): readonly InterventionComparisonRow[] {
  return decodeStrict(Schema.Array(InterventionComparisonRowSchema))(rows);
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

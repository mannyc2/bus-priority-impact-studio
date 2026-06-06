import type { Database } from "bun:sqlite";

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

export function loadInterventionPanelLocalDbRows(
  input: InterventionPanelLocalDbQuery,
): readonly InterventionComparisonRow[] {
  return input.sqlite
    .query<InterventionComparisonRow, [string, string]>(
      `
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
      `,
    )
    .all(input.startMonth, input.endMonth);
}

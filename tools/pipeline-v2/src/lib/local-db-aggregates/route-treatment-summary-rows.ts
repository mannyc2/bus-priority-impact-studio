import type { Database, SQLQueryBindings } from "bun:sqlite";
import type {
  RouteTreatmentAceRow,
  RouteTreatmentBriefSummaryRow,
  RouteTreatmentInterventionEventRow,
} from "@bp/analytics/interventions";

export type RouteTreatmentCatalogRow = {
  route_id: string;
};

export type RouteTreatmentSegmentUniverseRow = {
  route_id: string;
  month: string;
  direction: string;
  stop_order: number;
  timepoint_stop_id: string;
  next_timepoint_stop_id: string;
};

export type RouteTreatmentSummaryLocalDbRows = {
  routeRows: readonly RouteTreatmentCatalogRow[];
  aceRows: readonly RouteTreatmentAceRow[];
  routeBriefRows: readonly RouteTreatmentBriefSummaryRow[];
  interventionEventRows: readonly RouteTreatmentInterventionEventRow[];
  segmentUniverseRows: readonly RouteTreatmentSegmentUniverseRow[];
  missingTables: readonly string[];
};

export type RouteTreatmentSummaryLocalDbQuery = {
  sqlite: Database;
  month: string;
};

const REQUIRED_TABLES = [
  "local_route_catalog",
  "local_ace_route",
  "local_route_brief_summary",
  "local_route_segment_speed",
  "local_intervention_event",
] as const;

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function missingTables(sqlite: Database): string[] {
  return REQUIRED_TABLES.filter((tableName) => !tableExists(sqlite, tableName));
}

function loadRows<T>(
  sqlite: Database,
  tableName: string,
  sql: string,
  ...params: SQLQueryBindings[]
): T[] {
  if (!tableExists(sqlite, tableName)) return [];
  return sqlite.query<T, SQLQueryBindings[]>(sql).all(...params);
}

export function loadRouteTreatmentSummaryLocalDbRows(
  input: RouteTreatmentSummaryLocalDbQuery,
): RouteTreatmentSummaryLocalDbRows {
  const missing = missingTables(input.sqlite);

  return {
    routeRows: loadRows<RouteTreatmentCatalogRow>(
      input.sqlite,
      "local_route_catalog",
      `
        SELECT route_id
        FROM local_route_catalog
        ORDER BY route_id
      `,
    ),
    aceRows: loadRows<RouteTreatmentAceRow>(
      input.sqlite,
      "local_ace_route",
      `
        SELECT
          route_id,
          program,
          implementation_date
        FROM local_ace_route
        ORDER BY route_id, implementation_date, program
      `,
    ),
    routeBriefRows: loadRows<RouteTreatmentBriefSummaryRow>(
      input.sqlite,
      "local_route_brief_summary",
      `
        SELECT
          route_id,
          month,
          bus_lane_matched_lane_count,
          ace_active
        FROM local_route_brief_summary
        WHERE month = ?
        ORDER BY route_id
      `,
      input.month,
    ),
    interventionEventRows: loadRows<RouteTreatmentInterventionEventRow>(
      input.sqlite,
      "local_intervention_event",
      `
        SELECT
          event_id,
          route_id,
          intervention_type,
          source_id,
          program,
          implementation_date,
          implementation_month,
          event_status,
          description
        FROM local_intervention_event
        ORDER BY route_id, implementation_month, event_id
      `,
    ),
    segmentUniverseRows: loadRows<RouteTreatmentSegmentUniverseRow>(
      input.sqlite,
      "local_route_segment_speed",
      `
        SELECT
          route_id,
          month,
          direction,
          stop_order,
          timepoint_stop_id,
          next_timepoint_stop_id
        FROM local_route_segment_speed
        WHERE month = ?
        GROUP BY
          route_id,
          month,
          direction,
          stop_order,
          timepoint_stop_id,
          next_timepoint_stop_id
        ORDER BY
          route_id,
          direction,
          stop_order,
          timepoint_stop_id,
          next_timepoint_stop_id
      `,
      input.month,
    ),
    missingTables: missing,
  };
}

import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { RouteTreatmentInterventionEventRow } from "@bp/analytics/interventions";

const STUDY_EVENT_TABLE = "local_intervention_event";

function tableExists(sqlite: Database, tableName: string): boolean {
  return (
    sqlite
      .query<{ present: number }, SQLQueryBindings[]>(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName) !== null
  );
}

/**
 * Load the complete event registry used by the study candidate gate.
 *
 * Absence is an error rather than an empty registry: silently producing an
 * empty candidate set would make a missing local build look like a data finding.
 */
export function loadStudyEventRegistryRows(input: {
  readonly sqlite: Database;
}): RouteTreatmentInterventionEventRow[] {
  if (!tableExists(input.sqlite, STUDY_EVENT_TABLE)) {
    throw new Error(`Required study-event registry table is missing: ${STUDY_EVENT_TABLE}`);
  }

  return input.sqlite
    .query<RouteTreatmentInterventionEventRow, []>(`
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
    `)
    .all();
}

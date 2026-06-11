import type { Database } from "bun:sqlite";
import { PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID } from "@bp/analytics";
import type { MissingPersistentSpeedSegmentCoverageRow } from "../evaluation";

export type PersistentSpeedSegmentCoverageRepairLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
};

export type PersistentSpeedSegmentCoverageRepairLocalDbRows = {
  readonly rows: MissingPersistentSpeedSegmentCoverageRow[];
};

export function loadPersistentSpeedSegmentCoverageRepairLocalDbRows(
  input: PersistentSpeedSegmentCoverageRepairLocalDbQuery,
): PersistentSpeedSegmentCoverageRepairLocalDbRows {
  return {
    rows: input.sqlite
      .query(
        `
          SELECT
            c.candidate_id,
            c.detector_run_id,
            c.detector_id,
            c.month,
            c.scope_kind,
            c.scope_id,
            c.route_id,
            MIN(e.evidence_ref) AS evidence_ref,
            c.created_at
          FROM local_finding_candidate c
          LEFT JOIN local_finding_coverage_audit a
            ON a.detector_run_id = c.detector_run_id
           AND a.detector_id = c.detector_id
           AND a.month = c.month
           AND a.scope_kind = c.scope_kind
           AND a.scope_id = c.scope_id
          LEFT JOIN local_finding_evidence_link e
            ON e.candidate_id = c.candidate_id
           AND e.evidence_role = 'primary'
          WHERE c.month = ?
            AND c.detector_id = ?
            AND c.scope_kind = 'segment'
            AND a.audit_id IS NULL
          GROUP BY
            c.candidate_id,
            c.detector_run_id,
            c.detector_id,
            c.month,
            c.scope_kind,
            c.scope_id,
            c.route_id,
            c.created_at
          ORDER BY c.detector_score DESC, c.candidate_id
        `,
      )
      .all(
        input.month,
        PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
      ) as MissingPersistentSpeedSegmentCoverageRow[],
  };
}

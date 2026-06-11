import type { Database } from "bun:sqlite";
import type { DetectorEvaluationCoverageRow } from "../evaluation";

export type DetectorEvaluationLabelLocalDbQuery = {
  readonly sqlite: Database;
  readonly releaseMonth: string;
  readonly maxCleanNoHitPerDetector: number | null;
  readonly maxMissingDataScopesPerDetector: number;
};

export type DetectorEvaluationLabelLocalDbRows = {
  readonly rows: DetectorEvaluationCoverageRow[];
};

export function loadDetectorEvaluationLabelLocalDbRows(
  input: DetectorEvaluationLabelLocalDbQuery,
): DetectorEvaluationLabelLocalDbRows {
  const cleanLimit = input.maxCleanNoHitPerDetector ?? 2_147_483_647;
  return {
    rows: input.sqlite
      .query(
        `
          WITH ranked AS (
            SELECT
              detector_id,
              month,
              scope_kind,
              scope_id,
              outcome,
              reason_code,
              reason,
              inputs_seen_json,
              inputs_expected_json,
              ROW_NUMBER() OVER (
                PARTITION BY detector_id, outcome
                ORDER BY scope_kind, scope_id
              ) AS row_number
            FROM local_finding_coverage_audit
            WHERE month = ?
              AND outcome IN (
                'clean_no_hit',
                'skipped_missing_input',
                'skipped_failed_join',
                'source_lag'
              )
          )
          SELECT
            detector_id,
            month,
            scope_kind,
            scope_id,
            outcome,
            reason_code,
            reason,
            inputs_seen_json,
            inputs_expected_json
          FROM ranked
          WHERE
            (outcome = 'clean_no_hit' AND row_number <= ?)
            OR (outcome <> 'clean_no_hit' AND row_number <= ?)
          ORDER BY detector_id, outcome, scope_kind, scope_id
        `,
      )
      .all(
        input.releaseMonth,
        cleanLimit,
        input.maxMissingDataScopesPerDetector,
      ) as DetectorEvaluationCoverageRow[],
  };
}

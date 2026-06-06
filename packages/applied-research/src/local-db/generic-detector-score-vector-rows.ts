import type { Database } from "bun:sqlite";
import type {
  GenericDetectorScoreVectorCandidateRow,
  GenericDetectorScoreVectorCoverageRow,
} from "../score-vectors";

export type GenericDetectorScoreVectorLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

export type GenericDetectorScoreVectorLocalDbRows = {
  readonly coverageRows: GenericDetectorScoreVectorCoverageRow[];
  readonly candidateRows: GenericDetectorScoreVectorCandidateRow[];
};

function queryCoverageRows(input: {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
}): GenericDetectorScoreVectorCoverageRow[] {
  return input.sqlite
    .query(
      `
        SELECT detector_id, month, scope_kind, scope_id, outcome, reason_code
        FROM local_finding_coverage_audit
        WHERE month >= ? AND month <= ?
        ORDER BY detector_id, month, scope_kind, scope_id
      `,
    )
    .all(input.startMonth, input.endMonth) as GenericDetectorScoreVectorCoverageRow[];
}

function queryCandidateRows(input: {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
}): GenericDetectorScoreVectorCandidateRow[] {
  return input.sqlite
    .query(
      `
        SELECT
          candidate_id,
          detector_id,
          month,
          scope_kind,
          scope_id,
          route_id,
          detector_score,
          reason_code,
          confidence,
          severity
        FROM local_finding_candidate
        WHERE month >= ? AND month <= ?
        ORDER BY detector_id, month, scope_kind, scope_id
      `,
    )
    .all(input.startMonth, input.endMonth) as GenericDetectorScoreVectorCandidateRow[];
}

export function loadGenericDetectorScoreVectorLocalDbRows(
  input: GenericDetectorScoreVectorLocalDbQuery,
): GenericDetectorScoreVectorLocalDbRows {
  return {
    coverageRows: queryCoverageRows(input),
    candidateRows: queryCandidateRows(input),
  };
}

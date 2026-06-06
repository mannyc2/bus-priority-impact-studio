import type { Database } from "bun:sqlite";
import type {
  DetectorCoverageAuditCandidateReasonSummaryRow,
  DetectorCoverageAuditCandidateSummaryRow,
  DetectorCoverageAuditCoverageSummaryRow,
  DetectorCoverageAuditEvidenceSummaryRow,
  DetectorCoverageAuditTopCandidateRow,
} from "../evaluation";

export type DetectorCoverageAuditLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
};

export type DetectorCoverageAuditLocalDbRows = {
  readonly candidateSummaries: DetectorCoverageAuditCandidateSummaryRow[];
  readonly evidenceSummaries: DetectorCoverageAuditEvidenceSummaryRow[];
  readonly coverageSummaries: DetectorCoverageAuditCoverageSummaryRow[];
  readonly candidateReasonSummaries: DetectorCoverageAuditCandidateReasonSummaryRow[];
  readonly topCandidatesByDetectorId: ReadonlyMap<
    string,
    readonly DetectorCoverageAuditTopCandidateRow[]
  >;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function queryCandidateSummaries(
  input: DetectorCoverageAuditLocalDbQuery,
): DetectorCoverageAuditCandidateSummaryRow[] {
  return input.sqlite
    .query(
      `
        SELECT detector_id, COUNT(*) AS candidate_count
        FROM local_finding_candidate
        WHERE month = ?
        GROUP BY detector_id
      `,
    )
    .all(input.month) as DetectorCoverageAuditCandidateSummaryRow[];
}

function queryEvidenceSummaries(
  input: DetectorCoverageAuditLocalDbQuery,
): DetectorCoverageAuditEvidenceSummaryRow[] {
  return input.sqlite
    .query(
      `
        SELECT c.detector_id, COUNT(*) AS evidence_count
        FROM local_finding_evidence_link e
        INNER JOIN local_finding_candidate c ON c.candidate_id = e.candidate_id
        WHERE c.month = ?
        GROUP BY c.detector_id
      `,
    )
    .all(input.month) as DetectorCoverageAuditEvidenceSummaryRow[];
}

function queryCoverageSummaries(
  input: DetectorCoverageAuditLocalDbQuery,
): DetectorCoverageAuditCoverageSummaryRow[] {
  return input.sqlite
    .query(
      `
        SELECT detector_id, outcome, reason_code, COUNT(*) AS coverage_count
        FROM local_finding_coverage_audit
        WHERE month = ?
        GROUP BY detector_id, outcome, reason_code
      `,
    )
    .all(input.month) as DetectorCoverageAuditCoverageSummaryRow[];
}

function queryCandidateReasonSummaries(
  input: DetectorCoverageAuditLocalDbQuery,
): DetectorCoverageAuditCandidateReasonSummaryRow[] {
  return input.sqlite
    .query(
      `
        SELECT detector_id, reason_code, COUNT(*) AS candidate_count
        FROM local_finding_candidate
        WHERE month = ?
        GROUP BY detector_id, reason_code
      `,
    )
    .all(input.month) as DetectorCoverageAuditCandidateReasonSummaryRow[];
}

function queryTopCandidates(
  input: DetectorCoverageAuditLocalDbQuery & { readonly detectorId: string },
): DetectorCoverageAuditTopCandidateRow[] {
  return input.sqlite
    .query(
      `
        SELECT
          candidate_id,
          detector_id,
          route_id,
          scope_kind,
          scope_id,
          reason_code,
          severity,
          confidence,
          detector_score,
          claim_safe_label,
          claim_text
        FROM local_finding_candidate
        WHERE month = ?
          AND detector_id = ?
        ORDER BY detector_score DESC, candidate_id
        LIMIT 10
      `,
    )
    .all(input.month, input.detectorId) as DetectorCoverageAuditTopCandidateRow[];
}

export function loadDetectorCoverageAuditLocalDbRows(
  input: DetectorCoverageAuditLocalDbQuery,
): DetectorCoverageAuditLocalDbRows {
  const candidateSummaries = queryCandidateSummaries(input);
  const topCandidatesByDetectorId = new Map<
    string,
    readonly DetectorCoverageAuditTopCandidateRow[]
  >();
  for (const row of candidateSummaries) {
    const detectorId = text(row.detector_id);
    if (detectorId !== null) {
      topCandidatesByDetectorId.set(detectorId, queryTopCandidates({ ...input, detectorId }));
    }
  }

  return {
    candidateSummaries,
    evidenceSummaries: queryEvidenceSummaries(input),
    coverageSummaries: queryCoverageSummaries(input),
    candidateReasonSummaries: queryCandidateReasonSummaries(input),
    topCandidatesByDetectorId,
  };
}

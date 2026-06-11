import type { Database } from "bun:sqlite";
import {
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
  type FindingEvidenceLink,
  FindingEvidenceLinkSchema,
} from "@bp/domain/findings";

type CandidateRow = {
  candidate_id: unknown;
  detector_id: unknown;
  detector_run_id: unknown;
  month: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  route_id: unknown;
  physical_id: unknown;
  category: unknown;
  severity: unknown;
  confidence: unknown;
  detector_score: unknown;
  reason_code: unknown;
  claim_safe_label: unknown;
  claim_text: unknown;
  status: unknown;
  review_state: unknown;
  window_start: unknown;
  window_end: unknown;
  created_at: unknown;
};

type EvidenceRow = {
  link_id: unknown;
  candidate_id: unknown;
  evidence_kind: unknown;
  evidence_role: unknown;
  evidence_ref: unknown;
  evidence_weight: unknown;
  note: unknown;
};

type CoverageRow = {
  audit_id: unknown;
  detector_run_id: unknown;
  detector_id: unknown;
  month: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  outcome: unknown;
  reason_code: unknown;
  reason: unknown;
  inputs_seen_json: unknown;
  inputs_expected_json: unknown;
  created_at: unknown;
};

export type ReviewPacketLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
};

export type ReviewPacketLocalDbRows = {
  readonly candidates: FindingCandidate[];
  readonly evidenceLinks: FindingEvidenceLink[];
  readonly coverageRows: FindingCoverageAudit[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseCandidate(row: CandidateRow): FindingCandidate {
  return FindingCandidateSchema.parse({
    candidateId: text(row.candidate_id),
    detectorId: text(row.detector_id),
    detectorRunId: text(row.detector_run_id),
    month: text(row.month),
    scopeKind: text(row.scope_kind),
    scopeId: text(row.scope_id),
    routeId: nullableText(row.route_id),
    physicalId: nullableText(row.physical_id),
    category: text(row.category),
    severity: text(row.severity),
    confidence: text(row.confidence),
    detectorScore: numberValue(row.detector_score),
    reasonCode: text(row.reason_code),
    claimSafeLabel: text(row.claim_safe_label),
    claimText: text(row.claim_text),
    status: text(row.status),
    reviewState: text(row.review_state),
    windowStart: nullableText(row.window_start),
    windowEnd: nullableText(row.window_end),
    createdAt: text(row.created_at),
  });
}

function parseEvidence(row: EvidenceRow): FindingEvidenceLink {
  return FindingEvidenceLinkSchema.parse({
    linkId: text(row.link_id),
    candidateId: text(row.candidate_id),
    evidenceKind: text(row.evidence_kind),
    evidenceRole: text(row.evidence_role),
    evidenceRef: text(row.evidence_ref),
    evidenceWeight: row.evidence_weight === null ? null : numberValue(row.evidence_weight),
    note: nullableText(row.note),
  });
}

function parseCoverage(row: CoverageRow): FindingCoverageAudit {
  return FindingCoverageAuditSchema.parse({
    auditId: text(row.audit_id),
    detectorRunId: text(row.detector_run_id),
    detectorId: text(row.detector_id),
    month: text(row.month),
    scopeKind: text(row.scope_kind),
    scopeId: text(row.scope_id),
    outcome: text(row.outcome),
    reasonCode: nullableText(row.reason_code),
    reason: nullableText(row.reason),
    inputsSeenJson: nullableText(row.inputs_seen_json),
    inputsExpectedJson: nullableText(row.inputs_expected_json),
    createdAt: text(row.created_at),
  });
}

function queryCandidates(input: ReviewPacketLocalDbQuery): FindingCandidate[] {
  const rows = input.sqlite
    .query(
      `
        SELECT
          candidate_id,
          detector_id,
          detector_run_id,
          month,
          scope_kind,
          scope_id,
          route_id,
          physical_id,
          category,
          severity,
          confidence,
          detector_score,
          reason_code,
          claim_safe_label,
          claim_text,
          status,
          review_state,
          window_start,
          window_end,
          created_at
        FROM local_finding_candidate
        WHERE month = ?
        ORDER BY detector_score DESC, detector_id, candidate_id
      `,
    )
    .all(input.month) as CandidateRow[];
  return rows.map(parseCandidate);
}

function queryEvidence(input: ReviewPacketLocalDbQuery): FindingEvidenceLink[] {
  const rows = input.sqlite
    .query(
      `
        SELECT
          e.link_id,
          e.candidate_id,
          e.evidence_kind,
          e.evidence_role,
          e.evidence_ref,
          e.evidence_weight,
          e.note
        FROM local_finding_evidence_link e
        INNER JOIN local_finding_candidate c ON c.candidate_id = e.candidate_id
        WHERE c.month = ?
        ORDER BY c.detector_id, c.candidate_id, e.evidence_role, e.link_id
      `,
    )
    .all(input.month) as EvidenceRow[];
  return rows.map(parseEvidence);
}

function queryCoverage(input: ReviewPacketLocalDbQuery): FindingCoverageAudit[] {
  const rows = input.sqlite
    .query(
      `
        SELECT
          audit_id,
          detector_run_id,
          detector_id,
          month,
          scope_kind,
          scope_id,
          outcome,
          reason_code,
          reason,
          inputs_seen_json,
          inputs_expected_json,
          created_at
        FROM local_finding_coverage_audit
        WHERE month = ?
        ORDER BY detector_id, detector_run_id, scope_kind, scope_id
      `,
    )
    .all(input.month) as CoverageRow[];
  return rows.map(parseCoverage);
}

export function loadReviewPacketLocalDbRows(
  input: ReviewPacketLocalDbQuery,
): ReviewPacketLocalDbRows {
  return {
    candidates: queryCandidates(input),
    evidenceLinks: queryEvidence(input),
    coverageRows: queryCoverage(input),
  };
}

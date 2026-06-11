import { PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID } from "@bp/analytics";
import { stableId } from "@bp/analytics/core";
import { type FindingCoverageAudit, FindingCoverageAuditSchema } from "@bp/domain/findings";

export const PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID =
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID;

export type MissingPersistentSpeedSegmentCoverageRow = {
  candidate_id: unknown;
  detector_run_id: unknown;
  detector_id: unknown;
  month: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  route_id: unknown;
  evidence_ref: unknown;
  created_at: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseEvidenceRef(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function buildPersistentSpeedSegmentCoverageRepairs(input: {
  generatedAt: string;
  rows: readonly MissingPersistentSpeedSegmentCoverageRow[];
}): FindingCoverageAudit[] {
  const output: FindingCoverageAudit[] = [];
  for (const row of input.rows) {
    const candidateId = text(row.candidate_id);
    const detectorRunId = text(row.detector_run_id);
    const detectorId = text(row.detector_id);
    const month = text(row.month);
    const scopeKind = text(row.scope_kind);
    const scopeId = text(row.scope_id);
    if (
      candidateId === null ||
      detectorRunId === null ||
      detectorId === null ||
      month === null ||
      scopeKind !== "segment" ||
      scopeId === null
    ) {
      continue;
    }
    output.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(
          detectorRunId,
          "audit",
          "segment",
          text(row.route_id) ?? "unknown",
          scopeId,
        ),
        detectorRunId,
        detectorId,
        month,
        scopeKind,
        scopeId,
        outcome: "hit",
        reasonCode: null,
        reason: null,
        inputsSeenJson: JSON.stringify({
          candidateId,
          routeId: text(row.route_id),
          scopeId,
          repairedFrom: "local_finding_candidate",
          primaryEvidence: parseEvidenceRef(row.evidence_ref),
        }),
        inputsExpectedJson: JSON.stringify({
          scopeKind: "segment",
          detectorCandidate: PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID,
          exactScopeCoverageRequired: true,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }
  return output;
}

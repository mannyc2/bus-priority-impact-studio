import {
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
} from "@bp/domain";

export type CoveragePayload = string | Record<string, unknown> | null;

export type BuildCoverageAuditInput = {
  auditId: string;
  detectorRunId: string;
  detectorId: string;
  month: string;
  scopeKind: string;
  scopeId: string;
  outcome: string;
  reasonCode: string | null;
  reason: string | null;
  inputsSeenJson: CoveragePayload;
  inputsExpectedJson: CoveragePayload;
  createdAt: string;
};

function serializePayload(payload: CoveragePayload): string | null {
  if (payload === null) return null;
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

export function buildCoverageAudit(input: BuildCoverageAuditInput): FindingCoverageAudit {
  return FindingCoverageAuditSchema.parse({
    auditId: input.auditId,
    detectorRunId: input.detectorRunId,
    detectorId: input.detectorId,
    month: input.month,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    reason: input.reason,
    inputsSeenJson: serializePayload(input.inputsSeenJson),
    inputsExpectedJson: serializePayload(input.inputsExpectedJson),
    createdAt: input.createdAt,
  });
}

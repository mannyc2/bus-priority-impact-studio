export type DetectorCoverageAuditCandidateSummaryRow = {
  detector_id: unknown;
  candidate_count: unknown;
};

export type DetectorCoverageAuditEvidenceSummaryRow = {
  detector_id: unknown;
  evidence_count: unknown;
};

export type DetectorCoverageAuditCoverageSummaryRow = {
  detector_id: unknown;
  outcome: unknown;
  reason_code: unknown;
  coverage_count: unknown;
};

export type DetectorCoverageAuditCandidateReasonSummaryRow = {
  detector_id: unknown;
  reason_code: unknown;
  candidate_count: unknown;
};

export type DetectorCoverageAuditTopCandidateRow = {
  candidate_id: unknown;
  detector_id: unknown;
  route_id: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  reason_code: unknown;
  severity: unknown;
  confidence: unknown;
  detector_score: unknown;
  claim_safe_label: unknown;
  claim_text: unknown;
};

type DetectorCoverageAuditTopCandidate = {
  candidateId: string;
  routeId: string | null;
  scopeKind: string;
  scopeId: string;
  reasonCode: string;
  severity: string;
  confidence: string;
  detectorScore: number;
  claimSafeLabel: string;
  claimText: string;
};

type DetectorCoverageAuditDetector = {
  detectorId: string;
  candidateCount: number;
  evidenceCount: number;
  coverageCount: number;
  outcomeCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  candidateReasonCounts: Record<string, number>;
  topCandidates: DetectorCoverageAuditTopCandidate[];
};

export type FindingDetectorCoverageAuditArtifact = {
  artifactKind: "finding_detector_coverage_audit";
  schemaVersion: 1;
  generatedAt: string;
  month: string;
  detectorCount: number;
  detectors: DetectorCoverageAuditDetector[];
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

function addCount(map: Map<string, number>, key: string | null, count: unknown): void {
  if (key === null) return;
  map.set(key, (map.get(key) ?? 0) + numberValue(count));
}

function plainCounts(map: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function topCandidate(
  row: DetectorCoverageAuditTopCandidateRow,
): DetectorCoverageAuditTopCandidate | null {
  const candidateId = text(row.candidate_id);
  const scopeKind = text(row.scope_kind);
  const scopeId = text(row.scope_id);
  const reasonCode = text(row.reason_code);
  const severity = text(row.severity);
  const confidence = text(row.confidence);
  const claimSafeLabel = text(row.claim_safe_label);
  const claimText = text(row.claim_text);
  if (
    candidateId === null ||
    scopeKind === null ||
    scopeId === null ||
    reasonCode === null ||
    severity === null ||
    confidence === null ||
    claimSafeLabel === null ||
    claimText === null
  ) {
    return null;
  }
  return {
    candidateId,
    routeId: text(row.route_id),
    scopeKind,
    scopeId,
    reasonCode,
    severity,
    confidence,
    detectorScore: numberValue(row.detector_score),
    claimSafeLabel,
    claimText,
  };
}

export function buildDetectorCoverageAuditArtifact(input: {
  month: string;
  generatedAt: string;
  candidateSummaries: readonly DetectorCoverageAuditCandidateSummaryRow[];
  evidenceSummaries: readonly DetectorCoverageAuditEvidenceSummaryRow[];
  coverageSummaries: readonly DetectorCoverageAuditCoverageSummaryRow[];
  candidateReasonSummaries: readonly DetectorCoverageAuditCandidateReasonSummaryRow[];
  topCandidatesByDetectorId: ReadonlyMap<string, readonly DetectorCoverageAuditTopCandidateRow[]>;
}): FindingDetectorCoverageAuditArtifact {
  const detectorIds = new Set<string>();
  const candidateCounts = new Map<string, number>();
  const evidenceCounts = new Map<string, number>();
  const outcomeCountsByDetector = new Map<string, Map<string, number>>();
  const reasonCountsByDetector = new Map<string, Map<string, number>>();
  const candidateReasonCountsByDetector = new Map<string, Map<string, number>>();

  for (const row of input.candidateSummaries) {
    const detectorId = text(row.detector_id);
    if (detectorId === null) continue;
    detectorIds.add(detectorId);
    addCount(candidateCounts, detectorId, row.candidate_count);
  }
  for (const row of input.evidenceSummaries) {
    const detectorId = text(row.detector_id);
    if (detectorId === null) continue;
    detectorIds.add(detectorId);
    addCount(evidenceCounts, detectorId, row.evidence_count);
  }
  for (const row of input.coverageSummaries) {
    const detectorId = text(row.detector_id);
    const outcome = text(row.outcome);
    if (detectorId === null || outcome === null) continue;
    detectorIds.add(detectorId);
    const outcomeCounts = outcomeCountsByDetector.get(detectorId) ?? new Map<string, number>();
    addCount(outcomeCounts, outcome, row.coverage_count);
    outcomeCountsByDetector.set(detectorId, outcomeCounts);
    const reasonCode = text(row.reason_code);
    if (reasonCode !== null) {
      const reasonCounts = reasonCountsByDetector.get(detectorId) ?? new Map<string, number>();
      addCount(reasonCounts, reasonCode, row.coverage_count);
      reasonCountsByDetector.set(detectorId, reasonCounts);
    }
  }
  for (const row of input.candidateReasonSummaries) {
    const detectorId = text(row.detector_id);
    const reasonCode = text(row.reason_code);
    if (detectorId === null || reasonCode === null) continue;
    detectorIds.add(detectorId);
    const reasonCounts =
      candidateReasonCountsByDetector.get(detectorId) ?? new Map<string, number>();
    addCount(reasonCounts, reasonCode, row.candidate_count);
    candidateReasonCountsByDetector.set(detectorId, reasonCounts);
  }

  const detectors = [...detectorIds].sort().map((detectorId) => {
    const outcomeCounts = outcomeCountsByDetector.get(detectorId) ?? new Map<string, number>();
    const topCandidates = (input.topCandidatesByDetectorId.get(detectorId) ?? [])
      .map(topCandidate)
      .filter((candidate): candidate is DetectorCoverageAuditTopCandidate => candidate !== null);
    return {
      detectorId,
      candidateCount: candidateCounts.get(detectorId) ?? 0,
      evidenceCount: evidenceCounts.get(detectorId) ?? 0,
      coverageCount: [...outcomeCounts.values()].reduce((sum, count) => sum + count, 0),
      outcomeCounts: plainCounts(outcomeCounts),
      reasonCounts: plainCounts(reasonCountsByDetector.get(detectorId) ?? new Map()),
      candidateReasonCounts: plainCounts(
        candidateReasonCountsByDetector.get(detectorId) ?? new Map(),
      ),
      topCandidates,
    };
  });

  return {
    artifactKind: "finding_detector_coverage_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    month: input.month,
    detectorCount: detectors.length,
    detectors,
  };
}

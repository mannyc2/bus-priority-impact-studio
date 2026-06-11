// Evidence-packet completeness as an eval metric (S5.3 in docs/research/backend-goal-finish-detectors.md).
//
// "A candidate with no counter-evidence and no missing-evidence section is not mature — it is just a
// hit." This pure helper reports, per detector family, the share of emitted candidates that carry
// primary, counter-evidence, and missing-evidence links, plus a maturity rate. Thresholds are
// documented in the artifact, NOT enforced silently — the metric surfaces packet quality; promotion
// gating stays in the reviewed-gold/readiness layer.

export const EVIDENCE_PACKET_ROLES = {
  primary: "primary",
  counterEvidence: "counter_evidence",
  missingEvidence: "missing_data",
} as const;

export type EvidencePacketCompletenessThresholds = {
  // Documented expectations (not enforced here): a mature candidate has primary + counter-evidence.
  readonly minPrimaryShare: number;
  readonly minCounterEvidenceShare: number;
};

export const DEFAULT_EVIDENCE_PACKET_COMPLETENESS_THRESHOLDS: EvidencePacketCompletenessThresholds =
  {
    minPrimaryShare: 1,
    minCounterEvidenceShare: 0.9,
  };

export type EvidencePacketCandidateLike = {
  readonly candidateId?: unknown;
  readonly detectorId?: unknown;
};

export type EvidencePacketEvidenceLike = {
  readonly candidateId?: unknown;
  readonly evidenceRole?: unknown;
};

export type EvidencePacketFamilyCompleteness = {
  readonly detectorId: string;
  readonly candidateCount: number;
  readonly withPrimaryCount: number;
  readonly withCounterEvidenceCount: number;
  readonly withMissingEvidenceCount: number;
  readonly matureCount: number;
  readonly bareHitCount: number;
  readonly primaryShare: number;
  readonly counterEvidenceShare: number;
  readonly missingEvidenceShare: number;
  readonly matureShare: number;
};

export type EvidencePacketCompleteness = {
  readonly artifactKind: "evidence_packet_completeness";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly thresholds: EvidencePacketCompletenessThresholds;
  readonly summary: EvidencePacketFamilyCompleteness;
  readonly byDetector: readonly EvidencePacketFamilyCompleteness[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function share(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1e4) / 1e4;
}

type FamilyTally = {
  detectorId: string;
  candidateCount: number;
  withPrimaryCount: number;
  withCounterEvidenceCount: number;
  withMissingEvidenceCount: number;
  matureCount: number;
  bareHitCount: number;
};

function finalizeFamily(tally: FamilyTally): EvidencePacketFamilyCompleteness {
  return {
    detectorId: tally.detectorId,
    candidateCount: tally.candidateCount,
    withPrimaryCount: tally.withPrimaryCount,
    withCounterEvidenceCount: tally.withCounterEvidenceCount,
    withMissingEvidenceCount: tally.withMissingEvidenceCount,
    matureCount: tally.matureCount,
    bareHitCount: tally.bareHitCount,
    primaryShare: share(tally.withPrimaryCount, tally.candidateCount),
    counterEvidenceShare: share(tally.withCounterEvidenceCount, tally.candidateCount),
    missingEvidenceShare: share(tally.withMissingEvidenceCount, tally.candidateCount),
    matureShare: share(tally.matureCount, tally.candidateCount),
  };
}

export function buildEvidencePacketCompleteness(input: {
  readonly generatedAt: string;
  readonly candidates: readonly EvidencePacketCandidateLike[];
  readonly evidence: readonly EvidencePacketEvidenceLike[];
  readonly thresholds?: Partial<EvidencePacketCompletenessThresholds>;
}): EvidencePacketCompleteness {
  const thresholds: EvidencePacketCompletenessThresholds = {
    ...DEFAULT_EVIDENCE_PACKET_COMPLETENESS_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const rolesByCandidate = new Map<string, Set<string>>();
  for (const link of input.evidence) {
    const candidateId = text(link.candidateId);
    const role = text(link.evidenceRole);
    if (candidateId === null || role === null) continue;
    const roles = rolesByCandidate.get(candidateId) ?? new Set<string>();
    roles.add(role);
    rolesByCandidate.set(candidateId, roles);
  }

  const families = new Map<string, FamilyTally>();
  const total: FamilyTally = {
    detectorId: "__all__",
    candidateCount: 0,
    withPrimaryCount: 0,
    withCounterEvidenceCount: 0,
    withMissingEvidenceCount: 0,
    matureCount: 0,
    bareHitCount: 0,
  };

  for (const candidate of input.candidates) {
    const candidateId = text(candidate.candidateId);
    const detectorId = text(candidate.detectorId) ?? "__unknown__";
    if (candidateId === null) continue;
    const roles = rolesByCandidate.get(candidateId) ?? new Set<string>();
    const hasPrimary = roles.has(EVIDENCE_PACKET_ROLES.primary);
    const hasCounter = roles.has(EVIDENCE_PACKET_ROLES.counterEvidence);
    const hasMissing = roles.has(EVIDENCE_PACKET_ROLES.missingEvidence);
    // Mature = primary evidence + at least one counter-evidence link (the maturity marker).
    const mature = hasPrimary && hasCounter;
    // A bare hit has primary but neither counter-evidence nor a missing-evidence section.
    const bareHit = hasPrimary && !hasCounter && !hasMissing;

    const family = families.get(detectorId) ?? {
      detectorId,
      candidateCount: 0,
      withPrimaryCount: 0,
      withCounterEvidenceCount: 0,
      withMissingEvidenceCount: 0,
      matureCount: 0,
      bareHitCount: 0,
    };
    for (const tally of [family, total]) {
      tally.candidateCount += 1;
      if (hasPrimary) tally.withPrimaryCount += 1;
      if (hasCounter) tally.withCounterEvidenceCount += 1;
      if (hasMissing) tally.withMissingEvidenceCount += 1;
      if (mature) tally.matureCount += 1;
      if (bareHit) tally.bareHitCount += 1;
    }
    families.set(detectorId, family);
  }

  const byDetector = [...families.values()]
    .map(finalizeFamily)
    .sort((left, right) => left.detectorId.localeCompare(right.detectorId));

  return {
    artifactKind: "evidence_packet_completeness",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    thresholds,
    summary: finalizeFamily(total),
    byDetector,
  };
}

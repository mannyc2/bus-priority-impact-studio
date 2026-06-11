type JsonRecord = Record<string, unknown> & {
  readonly sources?: unknown;
  readonly evidence?: unknown;
  readonly summary?: unknown;
  readonly detectors?: unknown;
  readonly primaryEvidenceAllowed?: unknown;
  readonly automaticPromotionAllowed?: unknown;
  readonly detectorEligibility?: unknown;
};

export type EvidenceCorpusAuditStatus = "pass" | "warn" | "fail";

export type EvidenceCorpusAudit = {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly month: string;
  readonly status: EvidenceCorpusAuditStatus;
  readonly sources: {
    readonly sourceCount: number;
    readonly primaryEvidenceAllowedCount: number;
    readonly automaticPromotionAllowedCount: number;
    readonly manualReviewPrimaryCount: number;
    readonly contextOnlyCount: number;
    readonly blockedCount: number;
  };
  readonly features: {
    readonly featureCount: number;
    readonly contextTouchedFeatureCount: number;
    readonly contextSourceCount: number;
  };
  readonly detectors: {
    readonly detectorCount: number;
    readonly candidateCount: number;
    readonly evidenceCount: number;
    readonly coverageCount: number;
  };
  readonly reviewQueue: {
    readonly totalCandidateCount: number;
    readonly candidateCount: number;
    readonly evidenceLinkedCandidateCount: number;
    readonly unlinkedCandidateCount: number;
    readonly omittedCandidateCount: number;
  };
  readonly gaps: readonly string[];
  readonly outputPath: string;
};

export type BuildEvidenceCorpusAuditInput = {
  readonly month: string;
  readonly generatedAt: string;
  readonly outputPath: string;
  readonly sourceLedger: unknown | null;
  readonly signalFeatures: unknown | null;
  readonly detectorAudit: unknown | null;
  readonly reviewQueue: unknown | null;
};

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildEvidenceCorpusAudit(
  input: BuildEvidenceCorpusAuditInput,
): EvidenceCorpusAudit {
  const gaps: string[] = [];
  if (input.sourceLedger === null) gaps.push("source coverage/evidence ledger is missing");
  if (input.signalFeatures === null) gaps.push("route-month signal feature artifact is missing");
  if (input.detectorAudit === null) gaps.push("detector coverage audit artifact is missing");
  if (input.reviewQueue === null) gaps.push("finding review queue artifact is missing");

  const sourceRows = asArray(asRecord(input.sourceLedger).sources);
  const sourceEvidence = sourceRows.map((source) => asRecord(asRecord(source).evidence));
  const featureSummary = asRecord(asRecord(input.signalFeatures).summary);
  const detectors = asArray(asRecord(input.detectorAudit).detectors).map(asRecord);
  const reviewQueueRecord = asRecord(input.reviewQueue);

  const primaryEvidenceAllowedCount = sourceEvidence.filter(
    (evidence) => evidence.primaryEvidenceAllowed === true,
  ).length;
  const automaticPromotionAllowedCount = sourceEvidence.filter(
    (evidence) => evidence.automaticPromotionAllowed === true,
  ).length;
  const manualReviewPrimaryCount = sourceEvidence.filter(
    (evidence) => evidence.detectorEligibility === "manual_review_primary",
  ).length;
  const contextOnlyCount = sourceEvidence.filter(
    (evidence) =>
      evidence.detectorEligibility === "context_only" ||
      evidence.detectorEligibility === "current_signal_only",
  ).length;
  const blockedCount = sourceEvidence.filter(
    (evidence) =>
      evidence.detectorEligibility === "blocked" ||
      evidence.detectorEligibility === "missing_data_only",
  ).length;
  const detectorCandidateCount = detectors.reduce(
    (total, detector) => total + numberField(detector, "candidateCount"),
    0,
  );
  const detectorEvidenceCount = detectors.reduce(
    (total, detector) => total + numberField(detector, "evidenceCount"),
    0,
  );
  const detectorCoverageCount = detectors.reduce(
    (total, detector) => total + numberField(detector, "coverageCount"),
    0,
  );
  const reviewUnlinked = numberField(reviewQueueRecord, "unlinkedCandidateCount");

  if (sourceRows.length > 0 && primaryEvidenceAllowedCount === 0) {
    gaps.push("no source is currently eligible for primary evidence");
  }
  if (numberField(featureSummary, "contextSourceCount") === 0) {
    gaps.push("no context source features were materialized");
  }
  if (detectorCandidateCount > 0 && detectorEvidenceCount === 0) {
    gaps.push("detector candidates have no evidence links");
  }
  if (reviewUnlinked > 0) {
    gaps.push(`${reviewUnlinked} review-queue candidates have no evidence links`);
  }

  const status =
    input.sourceLedger === null ||
    input.signalFeatures === null ||
    input.detectorAudit === null ||
    input.reviewQueue === null
      ? "fail"
      : gaps.length > 0
        ? "warn"
        : "pass";

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    month: input.month,
    status,
    sources: {
      sourceCount: sourceRows.length,
      primaryEvidenceAllowedCount,
      automaticPromotionAllowedCount,
      manualReviewPrimaryCount,
      contextOnlyCount,
      blockedCount,
    },
    features: {
      featureCount: numberField(featureSummary, "featureCount"),
      contextTouchedFeatureCount: numberField(featureSummary, "contextTouchedFeatureCount"),
      contextSourceCount: numberField(featureSummary, "contextSourceCount"),
    },
    detectors: {
      detectorCount: detectors.length,
      candidateCount: detectorCandidateCount,
      evidenceCount: detectorEvidenceCount,
      coverageCount: detectorCoverageCount,
    },
    reviewQueue: {
      totalCandidateCount: numberField(reviewQueueRecord, "totalCandidateCount"),
      candidateCount: numberField(reviewQueueRecord, "candidateCount"),
      evidenceLinkedCandidateCount: numberField(reviewQueueRecord, "evidenceLinkedCandidateCount"),
      unlinkedCandidateCount: reviewUnlinked,
      omittedCandidateCount: numberField(reviewQueueRecord, "omittedCandidateCount"),
    },
    gaps,
    outputPath: input.outputPath,
  };
}

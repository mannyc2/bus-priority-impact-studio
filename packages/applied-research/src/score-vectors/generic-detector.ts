import { listAnalyticsDetectors } from "@bp/analytics/registry";

export type GenericDetectorScoreVectorCoverageRow = {
  readonly detector_id: unknown;
  readonly month: unknown;
  readonly scope_kind: unknown;
  readonly scope_id: unknown;
  readonly outcome: unknown;
  readonly reason_code: unknown;
};

export type GenericDetectorScoreVectorCandidateRow = {
  readonly candidate_id: unknown;
  readonly detector_id: unknown;
  readonly month: unknown;
  readonly scope_kind: unknown;
  readonly scope_id: unknown;
  readonly route_id: unknown;
  readonly detector_score: unknown;
  readonly reason_code: unknown;
  readonly confidence: unknown;
  readonly severity: unknown;
};

export type GenericDetectorScoreVectorEntry = {
  readonly scopeId: string;
  readonly month: string;
  readonly scopeKind: string;
  readonly routeId: string | null;
  readonly score: number;
  readonly flagged: boolean;
  readonly outcome: string;
  readonly reasonCode: string | null;
  readonly candidateId: string | null;
  readonly hasCandidateScore: boolean;
};

export type GenericDetectorScoreVectorSummary = {
  readonly scopeCount: number;
  readonly flaggedCount: number;
  readonly cleanNoHitCount: number;
  readonly skippedCount: number;
  readonly monthCount: number;
  readonly minScore: number | null;
  readonly maxScore: number | null;
  readonly flaggedShare: number;
};

export type GenericDetectorScoreVectorAvailabilityStatus =
  | "available"
  | "missing_execution_coverage";

export type GenericDetectorScoreVector = {
  readonly detectorId: string;
  readonly detectorName: string | null;
  readonly detectorVersion: string | null;
  readonly featureGrains: string[];
  readonly vectorGrain: "release_coverage_scope";
  readonly sourceKind: "generic_release_coverage";
  readonly status: GenericDetectorScoreVectorAvailabilityStatus;
  readonly summary: GenericDetectorScoreVectorSummary;
  readonly entries: GenericDetectorScoreVectorEntry[];
};

export type GenericDetectorScoreVectorArtifact = {
  readonly artifactKind: "generic_detector_score_vectors";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly releaseMonth: string;
  readonly window: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly source: {
    readonly coverageTableName: "local_finding_coverage_audit";
    readonly candidateTableName: "local_finding_candidate";
    readonly caveat: string;
  };
  readonly summary: {
    readonly detectorCount: number;
    readonly entryCount: number;
    readonly flaggedCount: number;
    readonly cleanNoHitCount: number;
    readonly skippedCount: number;
  };
  readonly detectors: GenericDetectorScoreVector[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function vectorKey(input: {
  readonly detectorId: string;
  readonly month: string;
  readonly scopeKind: string;
  readonly scopeId: string;
}): string {
  return [input.detectorId, input.month, input.scopeKind, input.scopeId].join("\0");
}

function fallbackScore(outcome: string): number {
  if (outcome === "hit") return 100;
  if (outcome === "clean_no_hit") return 0;
  return 0;
}

function summary(
  entries: readonly GenericDetectorScoreVectorEntry[],
): GenericDetectorScoreVectorSummary {
  const flaggedCount = entries.filter((entry) => entry.flagged).length;
  const cleanNoHitCount = entries.filter((entry) => entry.outcome === "clean_no_hit").length;
  const skippedCount = entries.filter((entry) => entry.outcome.startsWith("skipped")).length;
  const months = new Set(entries.map((entry) => entry.month));
  let minScore: number | null = null;
  let maxScore: number | null = null;
  for (const entry of entries) {
    minScore = minScore === null ? entry.score : Math.min(minScore, entry.score);
    maxScore = maxScore === null ? entry.score : Math.max(maxScore, entry.score);
  }
  return {
    scopeCount: entries.length,
    flaggedCount,
    cleanNoHitCount,
    skippedCount,
    monthCount: months.size,
    minScore,
    maxScore,
    flaggedShare: entries.length === 0 ? 0 : flaggedCount / entries.length,
  };
}

export function buildGenericDetectorScoreVectorArtifact(input: {
  readonly coverageRows: readonly GenericDetectorScoreVectorCoverageRow[];
  readonly candidateRows: readonly GenericDetectorScoreVectorCandidateRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
}): GenericDetectorScoreVectorArtifact {
  const candidateByScope = new Map<string, GenericDetectorScoreVectorCandidateRow>();
  for (const candidate of input.candidateRows) {
    const detectorId = text(candidate.detector_id);
    const month = text(candidate.month);
    const scopeKind = text(candidate.scope_kind);
    const scopeId = text(candidate.scope_id);
    if (detectorId === null || month === null || scopeKind === null || scopeId === null) continue;
    candidateByScope.set(vectorKey({ detectorId, month, scopeKind, scopeId }), candidate);
  }

  const entriesByDetector = new Map<string, GenericDetectorScoreVectorEntry[]>();
  for (const row of input.coverageRows) {
    const detectorId = text(row.detector_id);
    const month = text(row.month);
    const scopeKind = text(row.scope_kind);
    const scopeId = text(row.scope_id);
    const outcome = text(row.outcome);
    if (
      detectorId === null ||
      month === null ||
      scopeKind === null ||
      scopeId === null ||
      outcome === null
    ) {
      continue;
    }
    const candidate = candidateByScope.get(vectorKey({ detectorId, month, scopeKind, scopeId }));
    const candidateScore = numberValue(candidate?.detector_score);
    const entry: GenericDetectorScoreVectorEntry = {
      scopeId,
      month,
      scopeKind,
      routeId: text(candidate?.route_id),
      score: candidateScore ?? fallbackScore(outcome),
      flagged: outcome === "hit",
      outcome,
      reasonCode: text(row.reason_code) ?? text(candidate?.reason_code),
      candidateId: text(candidate?.candidate_id),
      hasCandidateScore: candidateScore !== null,
    };
    const entries = entriesByDetector.get(detectorId) ?? [];
    entries.push(entry);
    entriesByDetector.set(detectorId, entries);
  }

  const registeredByDetectorId = new Map(
    listAnalyticsDetectors().map((detector) => [String(detector.detectorId), detector]),
  );
  const detectorIds = [
    ...new Set([...registeredByDetectorId.keys(), ...entriesByDetector.keys()]),
  ].sort((left, right) => left.localeCompare(right));

  const detectors: GenericDetectorScoreVector[] = detectorIds.map((detectorId) => {
    const entries = entriesByDetector.get(detectorId) ?? [];
    const registered = registeredByDetectorId.get(detectorId);
    return {
      detectorId,
      detectorName: registered?.spec.name ?? null,
      detectorVersion: registered?.version ?? null,
      featureGrains: registered === undefined ? [] : [...registered.featureGrains],
      vectorGrain: "release_coverage_scope",
      sourceKind: "generic_release_coverage",
      status: entries.length > 0 ? "available" : "missing_execution_coverage",
      summary: summary(entries),
      entries: entries.sort((left, right) =>
        `${left.month}:${left.scopeKind}:${left.scopeId}`.localeCompare(
          `${right.month}:${right.scopeKind}:${right.scopeId}`,
        ),
      ),
    };
  });
  const allEntries = detectors.flatMap((detector) => detector.entries);
  return {
    artifactKind: "generic_detector_score_vectors",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    releaseMonth: input.releaseMonth,
    window: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    source: {
      coverageTableName: "local_finding_coverage_audit",
      candidateTableName: "local_finding_candidate",
      caveat:
        "Generic release score vectors normalize detector coverage rows and candidate detector scores. They are suitable for release evaluation and near-term stability scaffolding, not a substitute for detector-specific feature score vectors.",
    },
    summary: {
      detectorCount: detectors.length,
      entryCount: allEntries.length,
      flaggedCount: allEntries.filter((entry) => entry.flagged).length,
      cleanNoHitCount: allEntries.filter((entry) => entry.outcome === "clean_no_hit").length,
      skippedCount: allEntries.filter((entry) => entry.outcome.startsWith("skipped")).length,
    },
    detectors,
  };
}

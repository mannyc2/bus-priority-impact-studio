import { Database as BunDatabase, type Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type CandidateSummaryRow = {
  detector_id: unknown;
  candidate_count: unknown;
};

type EvidenceSummaryRow = {
  detector_id: unknown;
  evidence_count: unknown;
};

type CoverageSummaryRow = {
  detector_id: unknown;
  outcome: unknown;
  reason_code: unknown;
  coverage_count: unknown;
};

type CandidateReasonSummaryRow = {
  detector_id: unknown;
  reason_code: unknown;
  candidate_count: unknown;
};

type TopCandidateRow = {
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

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

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
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function topCandidate(row: TopCandidateRow): DetectorCoverageAuditTopCandidate | null {
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

function queryCandidateSummaries(sqlite: Database, month: string): CandidateSummaryRow[] {
  return sqlite
    .query(
      `
        SELECT detector_id, COUNT(*) AS candidate_count
        FROM local_finding_candidate
        WHERE month = ?
        GROUP BY detector_id
      `,
    )
    .all(month) as CandidateSummaryRow[];
}

function queryEvidenceSummaries(sqlite: Database, month: string): EvidenceSummaryRow[] {
  return sqlite
    .query(
      `
        SELECT c.detector_id, COUNT(*) AS evidence_count
        FROM local_finding_evidence_link e
        INNER JOIN local_finding_candidate c ON c.candidate_id = e.candidate_id
        WHERE c.month = ?
        GROUP BY c.detector_id
      `,
    )
    .all(month) as EvidenceSummaryRow[];
}

function queryCoverageSummaries(sqlite: Database, month: string): CoverageSummaryRow[] {
  return sqlite
    .query(
      `
        SELECT detector_id, outcome, reason_code, COUNT(*) AS coverage_count
        FROM local_finding_coverage_audit
        WHERE month = ?
        GROUP BY detector_id, outcome, reason_code
      `,
    )
    .all(month) as CoverageSummaryRow[];
}

function queryCandidateReasonSummaries(
  sqlite: Database,
  month: string,
): CandidateReasonSummaryRow[] {
  return sqlite
    .query(
      `
        SELECT detector_id, reason_code, COUNT(*) AS candidate_count
        FROM local_finding_candidate
        WHERE month = ?
        GROUP BY detector_id, reason_code
      `,
    )
    .all(month) as CandidateReasonSummaryRow[];
}

function queryTopCandidates(sqlite: Database, month: string, detectorId: string): TopCandidateRow[] {
  return sqlite
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
    .all(month, detectorId) as TopCandidateRow[];
}

export function buildDetectorCoverageAuditArtifact(input: {
  month: string;
  generatedAt: string;
  candidateSummaries: readonly CandidateSummaryRow[];
  evidenceSummaries: readonly EvidenceSummaryRow[];
  coverageSummaries: readonly CoverageSummaryRow[];
  candidateReasonSummaries: readonly CandidateReasonSummaryRow[];
  topCandidatesByDetectorId: ReadonlyMap<string, readonly TopCandidateRow[]>;
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
    const reasonCounts = candidateReasonCountsByDetector.get(detectorId) ?? new Map<string, number>();
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

export default defineCommand({
  path: ["findings", "coverage-audit"],
  summary: "Build a detector coverage audit artifact from local finding candidates/evidence/coverage.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    coverageCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "findings", releaseMonth, "detector-coverage-audit.json")
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);

    const sqlite = new BunDatabase(dbPath, { readonly: true });
    let artifact: FindingDetectorCoverageAuditArtifact;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const candidateSummaries = queryCandidateSummaries(sqlite, releaseMonth);
      const topCandidatesByDetectorId = new Map<string, readonly TopCandidateRow[]>();
      for (const row of candidateSummaries) {
        const detectorId = text(row.detector_id);
        if (detectorId !== null) {
          topCandidatesByDetectorId.set(
            detectorId,
            queryTopCandidates(sqlite, releaseMonth, detectorId),
          );
        }
      }
      artifact = buildDetectorCoverageAuditArtifact({
        month: releaseMonth,
        generatedAt: new Date().toISOString(),
        candidateSummaries,
        evidenceSummaries: queryEvidenceSummaries(sqlite, releaseMonth),
        coverageSummaries: queryCoverageSummaries(sqlite, releaseMonth),
        candidateReasonSummaries: queryCandidateReasonSummaries(sqlite, releaseMonth),
        topCandidatesByDetectorId,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      detectorCount: artifact.detectorCount,
      candidateCount: artifact.detectors.reduce((sum, detector) => sum + detector.candidateCount, 0),
      evidenceCount: artifact.detectors.reduce((sum, detector) => sum + detector.evidenceCount, 0),
      coverageCount: artifact.detectors.reduce((sum, detector) => sum + detector.coverageCount, 0),
    };
  },
});

import { Database as BunDatabase, type Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
  type FindingEvidenceLink,
  FindingEvidenceLinkSchema,
} from "@bp/domain";
import {
  buildReviewPacketArtifacts,
  type ReviewPacketBuildArtifacts,
} from "@bp/applied-research/review-packets";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

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

type ExistingPacketRef = {
  packetId?: unknown;
  candidate?: {
    candidateId?: unknown;
  };
};

type ExistingReviewPacketsArtifact = {
  packets?: ExistingPacketRef[];
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

function queryCandidates(sqlite: Database, month: string): FindingCandidate[] {
  const rows = sqlite
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
    .all(month) as CandidateRow[];
  return rows.map(parseCandidate);
}

function queryEvidence(sqlite: Database, month: string): FindingEvidenceLink[] {
  const rows = sqlite
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
    .all(month) as EvidenceRow[];
  return rows.map(parseEvidence);
}

function queryCoverage(sqlite: Database, month: string): FindingCoverageAudit[] {
  const rows = sqlite
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
    .all(month) as CoverageRow[];
  return rows.map(parseCoverage);
}

function existingPacketIdsByCandidateId(
  artifact: ExistingReviewPacketsArtifact | null,
): Map<string, string> {
  const output = new Map<string, string>();
  for (const packet of artifact?.packets ?? []) {
    const candidateId = text(packet.candidate?.candidateId);
    const packetId = text(packet.packetId);
    if (candidateId !== null && packetId !== null) output.set(candidateId, packetId);
  }
  return output;
}

export default defineCommand({
  path: ["findings", "review-packets"],
  summary: "Build registry-backed review packets and packet coverage for every local finding candidate.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      detectorSpecsOutput: z.string().optional(),
      reviewPacketsOutput: z.string().optional(),
      promotionQueueOutput: z.string().optional(),
      reviewQueueOutput: z.string().optional(),
      coverageOutput: z.string().optional(),
      queueLimit: arg.positiveInt().default(200),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    detectorSpecsOutputPath: z.string(),
    reviewPacketsOutputPath: z.string(),
    promotionQueueOutputPath: z.string(),
    reviewQueueOutputPath: z.string(),
    coverageOutputPath: z.string(),
    candidateCount: z.number().int().nonnegative(),
    packetCount: z.number().int().nonnegative(),
    reviewQueueCandidateCount: z.number().int().nonnegative(),
    detectorWithCandidateCount: z.number().int().nonnegative(),
    detectorWithPacketCount: z.number().int().nonnegative(),
    missingPacketCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const findingsRoot = join(artifactRoot, "findings", releaseMonth);
    const detectorSpecsOutputPath =
      input.options.detectorSpecsOutput === undefined
        ? join(artifactRoot, "findings", "detector-specs.json")
        : fromCliPath(input.options.detectorSpecsOutput);
    const reviewPacketsOutputPath =
      input.options.reviewPacketsOutput === undefined
        ? join(findingsRoot, "review-packets.json")
        : fromCliPath(input.options.reviewPacketsOutput);
    const promotionQueueOutputPath =
      input.options.promotionQueueOutput === undefined
        ? join(findingsRoot, "promotion-queue.json")
        : fromCliPath(input.options.promotionQueueOutput);
    const reviewQueueOutputPath =
      input.options.reviewQueueOutput === undefined
        ? join(findingsRoot, "review-queue.json")
        : fromCliPath(input.options.reviewQueueOutput);
    const coverageOutputPath =
      input.options.coverageOutput === undefined
        ? join(findingsRoot, "review-packet-coverage.json")
        : fromCliPath(input.options.coverageOutput);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const existingReviewPackets =
      await readJsonIfExists<ExistingReviewPacketsArtifact>(reviewPacketsOutputPath);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    let artifacts: ReviewPacketBuildArtifacts;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const generatedAt = new Date().toISOString();
      artifacts = buildReviewPacketArtifacts({
        month: releaseMonth,
        generatedAt,
        detectorSpecsArtifactPath: repoDisplayPath(detectorSpecsOutputPath),
        reviewPacketsArtifactPath: repoDisplayPath(reviewPacketsOutputPath),
        promotionQueueArtifactPath: repoDisplayPath(promotionQueueOutputPath),
        coverageArtifactPath: repoDisplayPath(coverageOutputPath),
        reviewQueueArtifactPath: repoDisplayPath(reviewQueueOutputPath),
        queueLimit: input.options.queueLimit,
        candidates: queryCandidates(sqlite, releaseMonth),
        evidenceLinks: queryEvidence(sqlite, releaseMonth),
        coverageRows: queryCoverage(sqlite, releaseMonth),
        existingPacketIdsByCandidateId: existingPacketIdsByCandidateId(existingReviewPackets),
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(detectorSpecsOutputPath), { recursive: true });
    await mkdir(dirname(reviewPacketsOutputPath), { recursive: true });
    await mkdir(dirname(promotionQueueOutputPath), { recursive: true });
    await mkdir(dirname(reviewQueueOutputPath), { recursive: true });
    await mkdir(dirname(coverageOutputPath), { recursive: true });
    await writeJson(detectorSpecsOutputPath, artifacts.detectorSpecs);
    await writeJson(reviewPacketsOutputPath, artifacts.reviewPackets);
    await writeJson(promotionQueueOutputPath, artifacts.promotionQueue);
    await writeJson(reviewQueueOutputPath, artifacts.reviewQueue);
    await writeJson(coverageOutputPath, artifacts.coverage);

    return {
      releaseMonth,
      detectorSpecsOutputPath: repoDisplayPath(detectorSpecsOutputPath),
      reviewPacketsOutputPath: repoDisplayPath(reviewPacketsOutputPath),
      promotionQueueOutputPath: repoDisplayPath(promotionQueueOutputPath),
      reviewQueueOutputPath: repoDisplayPath(reviewQueueOutputPath),
      coverageOutputPath: repoDisplayPath(coverageOutputPath),
      candidateCount: artifacts.coverage.summary.candidateCount,
      packetCount: artifacts.reviewPackets.packetCount,
      reviewQueueCandidateCount: artifacts.reviewQueue.candidateCount,
      detectorWithCandidateCount: artifacts.coverage.summary.detectorWithCandidateCount,
      detectorWithPacketCount: artifacts.coverage.summary.detectorWithPacketCount,
      missingPacketCandidateCount: artifacts.coverage.summary.missingPacketCandidateCount,
    };
  },
});

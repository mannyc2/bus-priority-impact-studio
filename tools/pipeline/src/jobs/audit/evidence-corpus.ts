import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as z from "zod";
import { type CliOption, monthOption, parseCliOptions, yearOption } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext } from "../../lib/route-job.js";
import { signalFeaturesArtifactPath } from "../build/signal-features.js";
import { sourceCoverageLedgerPath } from "./source-coverage-ledger.js";

type EvidenceCorpusAuditArgs = {
  year?: number;
  month?: number;
  artifactRoot?: string;
  output?: string;
};

type JsonRecord = Record<string, unknown> & {
  sources?: unknown;
  evidence?: unknown;
  summary?: unknown;
  detectors?: unknown;
  primaryEvidenceAllowed?: unknown;
  automaticPromotionAllowed?: unknown;
  detectorEligibility?: unknown;
};

const AuditStatusSchema = z.enum(["pass", "warn", "fail"]);

const EvidenceCorpusAuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().min(1),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    status: AuditStatusSchema,
    sources: z
      .object({
        sourceCount: z.number().int().nonnegative(),
        primaryEvidenceAllowedCount: z.number().int().nonnegative(),
        automaticPromotionAllowedCount: z.number().int().nonnegative(),
        manualReviewPrimaryCount: z.number().int().nonnegative(),
        contextOnlyCount: z.number().int().nonnegative(),
        blockedCount: z.number().int().nonnegative(),
      })
      .strict(),
    features: z
      .object({
        featureCount: z.number().int().nonnegative(),
        contextTouchedFeatureCount: z.number().int().nonnegative(),
        contextSourceCount: z.number().int().nonnegative(),
      })
      .strict(),
    detectors: z
      .object({
        detectorCount: z.number().int().nonnegative(),
        candidateCount: z.number().int().nonnegative(),
        evidenceCount: z.number().int().nonnegative(),
        coverageCount: z.number().int().nonnegative(),
      })
      .strict(),
    reviewQueue: z
      .object({
        totalCandidateCount: z.number().int().nonnegative(),
        candidateCount: z.number().int().nonnegative(),
        evidenceLinkedCandidateCount: z.number().int().nonnegative(),
        unlinkedCandidateCount: z.number().int().nonnegative(),
        omittedCandidateCount: z.number().int().nonnegative(),
      })
      .strict(),
    gaps: z.array(z.string()),
    outputPath: z.string(),
  })
  .strict();

export type EvidenceCorpusAudit = z.output<typeof EvidenceCorpusAuditSchema>;

function parseCliArgs(args: string[]): EvidenceCorpusAuditArgs {
  const options: CliOption<EvidenceCorpusAuditArgs>[] = [
    yearOption(),
    monthOption(),
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.output = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json();
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function evidenceCorpusAuditPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "audits", `evidence-corpus-${month}.json`);
}

export async function auditEvidenceCorpus(
  args: EvidenceCorpusAuditArgs = {},
): Promise<EvidenceCorpusAudit> {
  const context = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const outputPath = args.output ?? evidenceCorpusAuditPath(artifactRoot, context.isoMonth);

  const [sourceLedger, signalFeatures, detectorAudit, reviewQueue] = await Promise.all([
    readJsonIfExists(sourceCoverageLedgerPath(artifactRoot, context.isoMonth)),
    readJsonIfExists(signalFeaturesArtifactPath(artifactRoot, context.isoMonth)),
    readJsonIfExists(
      join(artifactRoot, "findings", context.isoMonth, "detector-coverage-audit.json"),
    ),
    readJsonIfExists(join(artifactRoot, "findings", context.isoMonth, "review-queue.json")),
  ]);

  const gaps: string[] = [];
  if (sourceLedger === null) gaps.push("source coverage/evidence ledger is missing");
  if (signalFeatures === null) gaps.push("route-month signal feature artifact is missing");
  if (detectorAudit === null) gaps.push("detector coverage audit artifact is missing");
  if (reviewQueue === null) gaps.push("finding review queue artifact is missing");

  const sourceRows = asArray(asRecord(sourceLedger).sources);
  const sourceEvidence = sourceRows.map((source) => asRecord(asRecord(source).evidence));
  const featureSummary = asRecord(asRecord(signalFeatures).summary);
  const detectors = asArray(asRecord(detectorAudit).detectors).map(asRecord);
  const reviewQueueRecord = asRecord(reviewQueue);

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
    sourceLedger === null ||
    signalFeatures === null ||
    detectorAudit === null ||
    reviewQueue === null
      ? "fail"
      : gaps.length > 0
        ? "warn"
        : "pass";

  const audit = EvidenceCorpusAuditSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    month: context.isoMonth,
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
    outputPath,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, audit);
  return audit;
}

export async function auditEvidenceCorpusFromCli(args: string[]): Promise<EvidenceCorpusAudit> {
  return auditEvidenceCorpus(parseCliArgs(args));
}

import {
  DocumentInterventionRecordSchema,
  type DocumentInterventionRecord,
} from "@bp/domain/documents/intervention-records";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type {
  Tier2SourceDispositionQueueArtifact,
  Tier2SourceDispositionQueueItem,
} from "./_source-disposition-queue.ts";

const ARTIFACT_KIND = "bp.tier2_source_receipt_closure_audit.v1";
const SUMMARY_KIND = "bp.tier2_source_receipt_closure_audit_summary.v1";

type ClosureStatus = "closed_by_record" | "closed_by_disposition" | "open" | "conflict";

type SourceDisposition =
  | "reviewed_records_authored"
  | "supporting_context_only"
  | "no_actionable_bus_priority_intervention"
  | "needs_more_source_review"
  | "suppressed";

type SourceDispositionReceipt = {
  sourceId: string;
  queueRef: string | null;
  disposition: SourceDisposition;
  rawDisposition: string;
  reviewedRecordIds: string[];
  rationale: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  evidenceRefs: string[];
  sourceArtifactPath: string;
  sourceIndex: number;
};

type InvalidReviewedRecord = {
  sourceArtifactPath: string;
  sourceIndex: number;
  recordId: string | null;
  sourceId: string | null;
  reason: string;
};

type InvalidDispositionReceipt = {
  sourceArtifactPath: string;
  sourceIndex: number;
  sourceId: string | null;
  disposition: string | null;
  reason: string;
};

type OrphanReceiptRef = {
  sourceId: string;
  sourceArtifactPath: string;
  sourceIndex: number;
  disposition: SourceDisposition;
};

export type Tier2SourceReceiptClosureRow = {
  queueRef: string;
  sourceId: string;
  sourceTitle: string | null;
  reviewLane: Tier2SourceDispositionQueueItem["reviewLane"];
  priority: Tier2SourceDispositionQueueItem["priority"];
  status: ClosureStatus;
  validRecordCount: number;
  invalidRecordCount: number;
  recordIds: string[];
  dispositionReceiptCount: number;
  closingDispositionCount: number;
  nonClosingDispositionCount: number;
  receiptDispositions: SourceDisposition[];
  statusReasons: string[];
};

export type Tier2SourceReceiptClosureAuditArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceQueuePath: string;
  sourceQueueGeneratedAt: string;
  reviewedRecordsPaths: string[];
  sourceDispositionPaths: string[];
  summary: {
    queueSourceCount: number;
    validReviewedRecordCount: number;
    invalidReviewedRecordCount: number;
    reviewedRecordSourceCount: number;
    orphanReviewedRecordSourceCount: number;
    dispositionReceiptCount: number;
    invalidDispositionReceiptCount: number;
    closingDispositionReceiptCount: number;
    nonClosingDispositionReceiptCount: number;
    orphanDispositionReceiptCount: number;
    closedSourceCount: number;
    closedByRecordCount: number;
    closedByDispositionCount: number;
    openSourceCount: number;
    conflictSourceCount: number;
    sourceReceiptClosureStatus: "complete" | "partial";
    publicPromotionStatus: "not_ready";
    blockers: string[];
  };
  policy: {
    closureRequirement: string;
    recordValidationRule: string;
    dispositionValidationRule: string;
    publicPromotionRule: string;
  };
  sourceClosures: Tier2SourceReceiptClosureRow[];
  invalidReviewedRecords: InvalidReviewedRecord[];
  invalidDispositionReceipts: InvalidDispositionReceipt[];
  orphanReviewedRecordRefs: Array<{
    sourceId: string;
    recordIds: string[];
  }>;
  orphanDispositionReceipts: OrphanReceiptRef[];
};

export type BuildTier2SourceReceiptClosureAuditArgs = {
  queuePath: string;
  reviewedRecordsPaths?: string[];
  sourceDispositionsPaths?: string[];
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  maxMarkdownRows?: number;
};

type CliArgs = Partial<BuildTier2SourceReceiptClosureAuditArgs> & {
  reviewedRecordsPathsText?: string;
  sourceDispositionsPathsText?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function firstIssueMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const issue = error.issues[0];
  if (issue === undefined) return "record does not match bp.document_intervention_record.v1";
  const path = issue.path.length === 0 ? "<root>" : issue.path.map(String).join(".");
  return `${path}: ${issue.message}`;
}

function recordCandidatesFromArtifact(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  const keys = [
    "documentInterventionRecords",
    "reviewedInterventionRecords",
    "interventionRecords",
    "records",
  ];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function receiptCandidatesFromArtifact(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  const keys = ["receipts", "sourceDispositionReceipts", "sourceDispositions", "dispositions"];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeDisposition(value: string): SourceDisposition | null {
  if (value === "no_actionable_intervention") return "no_actionable_bus_priority_intervention";
  if (
    value === "reviewed_records_authored" ||
    value === "supporting_context_only" ||
    value === "no_actionable_bus_priority_intervention" ||
    value === "needs_more_source_review" ||
    value === "suppressed"
  ) {
    return value;
  }
  return null;
}

function isClosingDisposition(disposition: SourceDisposition): boolean {
  return (
    disposition === "supporting_context_only" ||
    disposition === "no_actionable_bus_priority_intervention" ||
    disposition === "suppressed"
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function pushRecord<K extends string, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [value]);
    return;
  }
  existing.push(value);
}

async function loadReviewedRecords(
  paths: string[],
): Promise<{
  records: DocumentInterventionRecord[];
  invalid: InvalidReviewedRecord[];
}> {
  const records: DocumentInterventionRecord[] = [];
  const invalid: InvalidReviewedRecord[] = [];
  for (const path of paths) {
    const value = await Bun.file(path).json();
    const candidates = recordCandidatesFromArtifact(value);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const parsed = DocumentInterventionRecordSchema.safeParse(candidate);
      if (parsed.success) {
        records.push(parsed.data);
        continue;
      }
      const object = isRecord(candidate) ? candidate : {};
      invalid.push({
        sourceArtifactPath: path,
        sourceIndex: index,
        recordId: stringValue(object["recordId"]),
        sourceId: stringValue(object["sourceId"]),
        reason: firstIssueMessage(parsed.error),
      });
    }
  }
  return { records, invalid };
}

async function loadDispositionReceipts(
  paths: string[],
): Promise<{
  receipts: SourceDispositionReceipt[];
  invalid: InvalidDispositionReceipt[];
}> {
  const receipts: SourceDispositionReceipt[] = [];
  const invalid: InvalidDispositionReceipt[] = [];
  for (const path of paths) {
    const value = await Bun.file(path).json();
    const candidates = receiptCandidatesFromArtifact(value);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!isRecord(candidate)) {
        invalid.push({
          sourceArtifactPath: path,
          sourceIndex: index,
          sourceId: null,
          disposition: null,
          reason: "receipt must be an object",
        });
        continue;
      }
      const sourceId = stringValue(candidate["sourceId"]);
      const rawDisposition = stringValue(candidate["disposition"]);
      const disposition =
        rawDisposition === null ? null : normalizeDisposition(rawDisposition.trim());
      if (sourceId === null) {
        invalid.push({
          sourceArtifactPath: path,
          sourceIndex: index,
          sourceId,
          disposition: rawDisposition,
          reason: "sourceId is required",
        });
        continue;
      }
      if (rawDisposition === null || disposition === null) {
        invalid.push({
          sourceArtifactPath: path,
          sourceIndex: index,
          sourceId,
          disposition: rawDisposition,
          reason:
            "disposition must be reviewed_records_authored, supporting_context_only, no_actionable_bus_priority_intervention, needs_more_source_review, or suppressed",
        });
        continue;
      }
      receipts.push({
        sourceId,
        queueRef: stringValue(candidate["queueRef"]),
        disposition,
        rawDisposition,
        reviewedRecordIds: stringArrayValue(candidate["reviewedRecordIds"]),
        rationale: stringValue(candidate["rationale"]),
        reviewerId: stringValue(candidate["reviewerId"]),
        reviewedAt: stringValue(candidate["reviewedAt"]),
        evidenceRefs: stringArrayValue(candidate["evidenceRefs"]),
        sourceArtifactPath: path,
        sourceIndex: index,
      });
    }
  }
  return { receipts, invalid };
}

function sourceReasons(input: {
  validRecordCount: number;
  invalidRecordCount: number;
  closingDispositionCount: number;
  nonClosingDispositionCount: number;
  dispositions: SourceDisposition[];
  status: ClosureStatus;
}): string[] {
  const reasons: string[] = [];
  if (input.status === "closed_by_record") {
    reasons.push("valid_reviewed_record_present");
  } else if (input.status === "closed_by_disposition") {
    reasons.push("closing_source_disposition_present");
  } else if (input.status === "conflict") {
    reasons.push("closing_disposition_conflicts_with_valid_record");
  } else {
    reasons.push("no_valid_reviewed_record_or_closing_source_disposition");
  }
  if (input.invalidRecordCount > 0) reasons.push("invalid_reviewed_records_present");
  if (
    input.validRecordCount === 0 &&
    input.dispositions.includes("reviewed_records_authored")
  ) {
    reasons.push("record_authored_receipt_without_valid_record");
  }
  if (input.dispositions.includes("needs_more_source_review")) {
    reasons.push("needs_more_source_review");
  }
  if (
    input.validRecordCount === 0 &&
    input.closingDispositionCount === 0 &&
    input.nonClosingDispositionCount > 0
  ) {
    reasons.push("non_closing_disposition_only");
  }
  return uniqueSorted(reasons);
}

function buildBlockers(input: {
  openSourceCount: number;
  conflictSourceCount: number;
  invalidReviewedRecordCount: number;
  invalidDispositionReceiptCount: number;
  orphanReviewedRecordSourceCount: number;
  orphanDispositionReceiptCount: number;
}): string[] {
  const blockers: string[] = [];
  if (input.openSourceCount > 0) {
    blockers.push(
      `${input.openSourceCount} source(s) still lack a valid reviewed record or closing source disposition receipt`,
    );
  }
  if (input.conflictSourceCount > 0) {
    blockers.push(
      `${input.conflictSourceCount} source(s) have both valid records and a non-record closing disposition`,
    );
  }
  if (input.invalidReviewedRecordCount > 0) {
    blockers.push(`${input.invalidReviewedRecordCount} reviewed record(s) fail the current domain schema`);
  }
  if (input.invalidDispositionReceiptCount > 0) {
    blockers.push(`${input.invalidDispositionReceiptCount} source disposition receipt(s) are malformed`);
  }
  if (input.orphanReviewedRecordSourceCount > 0) {
    blockers.push(
      `${input.orphanReviewedRecordSourceCount} reviewed-record source(s) are not present in the source queue`,
    );
  }
  if (input.orphanDispositionReceiptCount > 0) {
    blockers.push(
      `${input.orphanDispositionReceiptCount} source disposition receipt(s) reference sources outside the queue`,
    );
  }
  return blockers;
}

function buildAudit(input: {
  queue: Tier2SourceDispositionQueueArtifact;
  queuePath: string;
  reviewedRecordsPaths: string[];
  sourceDispositionPaths: string[];
  reviewedRecords: DocumentInterventionRecord[];
  invalidReviewedRecords: InvalidReviewedRecord[];
  dispositionReceipts: SourceDispositionReceipt[];
  invalidDispositionReceipts: InvalidDispositionReceipt[];
  generatedAt: string;
}): Tier2SourceReceiptClosureAuditArtifact {
  const queueSourceIds = new Set(input.queue.items.map((item) => item.sourceId));
  const recordsBySource = new Map<string, DocumentInterventionRecord[]>();
  const invalidRecordsBySource = new Map<string, InvalidReviewedRecord[]>();
  const receiptsBySource = new Map<string, SourceDispositionReceipt[]>();

  for (const record of input.reviewedRecords) pushRecord(recordsBySource, record.sourceId, record);
  for (const invalidRecord of input.invalidReviewedRecords) {
    if (invalidRecord.sourceId !== null) pushRecord(invalidRecordsBySource, invalidRecord.sourceId, invalidRecord);
  }
  for (const receipt of input.dispositionReceipts) pushRecord(receiptsBySource, receipt.sourceId, receipt);

  const sourceClosures = input.queue.items.map((item): Tier2SourceReceiptClosureRow => {
    const validRecords = recordsBySource.get(item.sourceId) ?? [];
    const invalidRecords = invalidRecordsBySource.get(item.sourceId) ?? [];
    const receipts = receiptsBySource.get(item.sourceId) ?? [];
    const closingDispositionCount = receipts.filter((receipt) =>
      isClosingDisposition(receipt.disposition),
    ).length;
    const nonClosingDispositionCount = receipts.length - closingDispositionCount;
    const validRecordCount = validRecords.length;
    let status: ClosureStatus = "open";
    if (validRecordCount > 0 && closingDispositionCount > 0) {
      status = "conflict";
    } else if (validRecordCount > 0) {
      status = "closed_by_record";
    } else if (closingDispositionCount > 0) {
      status = "closed_by_disposition";
    }
    const receiptDispositions = uniqueSorted(receipts.map((receipt) => receipt.disposition)).map(
      (disposition) => disposition as SourceDisposition,
    );
    return {
      queueRef: item.queueRef,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      reviewLane: item.reviewLane,
      priority: item.priority,
      status,
      validRecordCount,
      invalidRecordCount: invalidRecords.length,
      recordIds: uniqueSorted(validRecords.map((record) => record.recordId)),
      dispositionReceiptCount: receipts.length,
      closingDispositionCount,
      nonClosingDispositionCount,
      receiptDispositions,
      statusReasons: sourceReasons({
        validRecordCount,
        invalidRecordCount: invalidRecords.length,
        closingDispositionCount,
        nonClosingDispositionCount,
        dispositions: receiptDispositions,
        status,
      }),
    };
  });

  const orphanRecordsBySource = new Map<string, DocumentInterventionRecord[]>();
  for (const record of input.reviewedRecords) {
    if (!queueSourceIds.has(record.sourceId)) pushRecord(orphanRecordsBySource, record.sourceId, record);
  }
  const orphanReviewedRecordRefs = [...orphanRecordsBySource.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceId, records]) => ({
      sourceId,
      recordIds: uniqueSorted(records.map((record) => record.recordId)),
    }));
  const orphanDispositionReceipts = input.dispositionReceipts
    .filter((receipt) => !queueSourceIds.has(receipt.sourceId))
    .sort(
      (left, right) =>
        left.sourceId.localeCompare(right.sourceId) ||
        left.sourceArtifactPath.localeCompare(right.sourceArtifactPath) ||
        left.sourceIndex - right.sourceIndex,
    )
    .map((receipt): OrphanReceiptRef => ({
      sourceId: receipt.sourceId,
      sourceArtifactPath: receipt.sourceArtifactPath,
      sourceIndex: receipt.sourceIndex,
      disposition: receipt.disposition,
    }));

  const closedByRecordCount = sourceClosures.filter(
    (row) => row.status === "closed_by_record",
  ).length;
  const closedByDispositionCount = sourceClosures.filter(
    (row) => row.status === "closed_by_disposition",
  ).length;
  const openSourceCount = sourceClosures.filter((row) => row.status === "open").length;
  const conflictSourceCount = sourceClosures.filter((row) => row.status === "conflict").length;
  const blockers = buildBlockers({
    openSourceCount,
    conflictSourceCount,
    invalidReviewedRecordCount: input.invalidReviewedRecords.length,
    invalidDispositionReceiptCount: input.invalidDispositionReceipts.length,
    orphanReviewedRecordSourceCount: orphanReviewedRecordRefs.length,
    orphanDispositionReceiptCount: orphanDispositionReceipts.length,
  });

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceQueuePath: input.queuePath,
    sourceQueueGeneratedAt: input.queue.generatedAt,
    reviewedRecordsPaths: input.reviewedRecordsPaths,
    sourceDispositionPaths: input.sourceDispositionPaths,
    summary: {
      queueSourceCount: input.queue.items.length,
      validReviewedRecordCount: input.reviewedRecords.length,
      invalidReviewedRecordCount: input.invalidReviewedRecords.length,
      reviewedRecordSourceCount: new Set(input.reviewedRecords.map((record) => record.sourceId))
        .size,
      orphanReviewedRecordSourceCount: orphanReviewedRecordRefs.length,
      dispositionReceiptCount: input.dispositionReceipts.length,
      invalidDispositionReceiptCount: input.invalidDispositionReceipts.length,
      closingDispositionReceiptCount: input.dispositionReceipts.filter((receipt) =>
        isClosingDisposition(receipt.disposition),
      ).length,
      nonClosingDispositionReceiptCount: input.dispositionReceipts.filter(
        (receipt) => !isClosingDisposition(receipt.disposition),
      ).length,
      orphanDispositionReceiptCount: orphanDispositionReceipts.length,
      closedSourceCount: closedByRecordCount + closedByDispositionCount,
      closedByRecordCount,
      closedByDispositionCount,
      openSourceCount,
      conflictSourceCount,
      sourceReceiptClosureStatus: blockers.length === 0 ? "complete" : "partial",
      publicPromotionStatus: "not_ready",
      blockers,
    },
    policy: {
      closureRequirement:
        "Every source in the source disposition queue must have at least one schema-valid bp.document_intervention_record.v1 record or one closing source disposition receipt.",
      recordValidationRule:
        "Reviewed records close a source only when they validate against the current domain DocumentInterventionRecord schema.",
      dispositionValidationRule:
        "Closing non-record dispositions are supporting_context_only, no_actionable_bus_priority_intervention, and suppressed. reviewed_records_authored is only a note unless valid records are also present.",
      publicPromotionRule:
        "This audit is a promotion gate, not a serving layer. Public projection remains blocked until closure is complete and publishable intervention projections are generated.",
    },
    sourceClosures,
    invalidReviewedRecords: input.invalidReviewedRecords,
    invalidDispositionReceipts: input.invalidDispositionReceipts,
    orphanReviewedRecordRefs,
    orphanDispositionReceipts,
  };
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderSourceReceiptClosureAuditMarkdown(
  artifact: Tier2SourceReceiptClosureAuditArtifact,
  args: { maxRows?: number } = {},
): string {
  const maxRows = args.maxRows ?? 75;
  const rows = artifact.sourceClosures
    .filter((row) => row.status !== "closed_by_record" && row.status !== "closed_by_disposition")
    .concat(
      artifact.sourceClosures.filter(
        (row) => row.status === "closed_by_record" || row.status === "closed_by_disposition",
      ),
    )
    .slice(0, maxRows);
  const lines: string[] = [];
  lines.push("# Tier 2 Source Receipt Closure Audit");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Queue sources: ${artifact.summary.queueSourceCount}`);
  lines.push(`- Closed sources: ${artifact.summary.closedSourceCount}`);
  lines.push(`- Closed by reviewed records: ${artifact.summary.closedByRecordCount}`);
  lines.push(`- Closed by source disposition: ${artifact.summary.closedByDispositionCount}`);
  lines.push(`- Open sources: ${artifact.summary.openSourceCount}`);
  lines.push(`- Conflict sources: ${artifact.summary.conflictSourceCount}`);
  lines.push(`- Valid reviewed records: ${artifact.summary.validReviewedRecordCount}`);
  lines.push(`- Invalid reviewed records: ${artifact.summary.invalidReviewedRecordCount}`);
  lines.push(`- Source disposition receipts: ${artifact.summary.dispositionReceiptCount}`);
  lines.push(`- Invalid disposition receipts: ${artifact.summary.invalidDispositionReceiptCount}`);
  lines.push(`- Closure status: ${artifact.summary.sourceReceiptClosureStatus}`);
  lines.push(`- Public promotion status: ${artifact.summary.publicPromotionStatus}`);
  lines.push("");
  lines.push("## Policy");
  lines.push("");
  lines.push(`- ${artifact.policy.closureRequirement}`);
  lines.push(`- ${artifact.policy.publicPromotionRule}`);
  lines.push("");
  lines.push("## Source Closure Rows");
  lines.push("");
  lines.push("| Ref | Status | Priority | Lane | Source | Records | Dispositions | Reasons |");
  lines.push("|---|---|---|---|---|---:|---|---|");
  for (const row of rows) {
    const title = row.sourceTitle === null ? row.sourceId : `${row.sourceId}: ${row.sourceTitle}`;
    const dispositions = row.receiptDispositions.length === 0 ? "none" : row.receiptDispositions.join(", ");
    lines.push(
      `| ${row.queueRef} | ${row.status} | ${row.priority} | ${row.reviewLane} | ${markdownEscape(title)} | ${row.validRecordCount} | ${dispositions} | ${row.statusReasons.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Promotion Blockers");
  lines.push("");
  if (artifact.summary.blockers.length === 0) {
    lines.push("- None for source receipt closure.");
  } else {
    for (const blocker of artifact.summary.blockers) lines.push(`- ${blocker}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function buildTier2SourceReceiptClosureAudit(
  args: BuildTier2SourceReceiptClosureAuditArgs,
): Promise<Tier2SourceReceiptClosureAuditArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const queuePath = fromCliPath(args.queuePath);
  const queue = (await Bun.file(queuePath).json()) as Tier2SourceDispositionQueueArtifact;
  if (queue.artifactKind !== "bp.tier2_source_disposition_queue.v1") {
    throw new Error(`Expected bp.tier2_source_disposition_queue.v1 artifact: ${queuePath}`);
  }
  if (!Array.isArray(queue.items)) throw new Error(`Queue has no items array: ${queuePath}`);
  const reviewedRecordsPaths = (args.reviewedRecordsPaths ?? []).map((path) => fromCliPath(path));
  const sourceDispositionPaths = (args.sourceDispositionsPaths ?? []).map((path) =>
    fromCliPath(path),
  );
  const reviewedRecords = await loadReviewedRecords(reviewedRecordsPaths);
  const dispositionReceipts = await loadDispositionReceipts(sourceDispositionPaths);
  return buildAudit({
    queue,
    queuePath,
    reviewedRecordsPaths,
    sourceDispositionPaths,
    reviewedRecords: reviewedRecords.records,
    invalidReviewedRecords: reviewedRecords.invalid,
    dispositionReceipts: dispositionReceipts.receipts,
    invalidDispositionReceipts: dispositionReceipts.invalid,
    generatedAt,
  });
}

export async function runTier2SourceReceiptClosureAudit(
  args: BuildTier2SourceReceiptClosureAuditArgs,
): Promise<{
  artifact: Tier2SourceReceiptClosureAuditArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2SourceReceiptClosureAudit(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(
        defaultArtifactRootPath(),
        "docs",
        "tier2-source-receipt-closure",
        "source-receipt-closure-audit.json",
      ),
  );
  const markdownPath =
    args.markdownPath === undefined ? outputPath.replace(/\.json$/, ".md") : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? outputPath.replace(/\.json$/, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(
    markdownPath,
    renderSourceReceiptClosureAuditMarkdown(artifact, {
      ...(args.maxMarkdownRows === undefined ? {} : { maxRows: args.maxMarkdownRows }),
    }),
  );
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative integer.`);
  }
  return parsed;
}

function parseCommaSeparatedPaths(value: string | undefined): string[] {
  if (value === undefined || value.length === 0) return [];
  return uniqueSorted(
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--queue") {
      if (value === undefined) throw new Error("--queue requires a value.");
      args.queuePath = value;
      index += 1;
    } else if (arg === "--reviewed-records") {
      if (value === undefined) throw new Error("--reviewed-records requires a value.");
      args.reviewedRecordsPathsText = value;
      index += 1;
    } else if (arg === "--source-dispositions") {
      if (value === undefined) throw new Error("--source-dispositions requires a value.");
      args.sourceDispositionsPathsText = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--markdown") {
      if (value === undefined) throw new Error("--markdown requires a value.");
      args.markdownPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else if (arg === "--max-markdown-rows") {
      if (value === undefined) throw new Error("--max-markdown-rows requires a value.");
      args.maxMarkdownRows = parseNonNegativeInteger(value, "--max-markdown-rows");
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 source-receipt-audit option: ${arg}`);
    }
  }
  args.reviewedRecordsPaths = parseCommaSeparatedPaths(args.reviewedRecordsPathsText);
  args.sourceDispositionsPaths = parseCommaSeparatedPaths(args.sourceDispositionsPathsText);
  return args;
}

export async function runTier2SourceReceiptClosureAuditFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.queuePath === undefined) throw new Error("Provide --queue.");
  const result = await runTier2SourceReceiptClosureAudit({
    queuePath: args.queuePath,
    ...(args.reviewedRecordsPaths === undefined
      ? {}
      : { reviewedRecordsPaths: args.reviewedRecordsPaths }),
    ...(args.sourceDispositionsPaths === undefined
      ? {}
      : { sourceDispositionsPaths: args.sourceDispositionsPaths }),
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.maxMarkdownRows === undefined ? {} : { maxMarkdownRows: args.maxMarkdownRows }),
  });
  console.log(
    `tier2-source-receipt-audit: queueSources=${result.artifact.summary.queueSourceCount} closed=${result.artifact.summary.closedSourceCount} open=${result.artifact.summary.openSourceCount} conflicts=${result.artifact.summary.conflictSourceCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}

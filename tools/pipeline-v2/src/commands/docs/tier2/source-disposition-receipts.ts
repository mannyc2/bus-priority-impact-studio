import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import type {
  Tier2SourceReviewPack,
  Tier2SourceReviewPackBatchArtifact,
} from "./_source-review-pack.ts";

const ARTIFACT_KIND = "bp.tier2_source_disposition_receipts.v1";
const SUMMARY_KIND = "bp.tier2_source_disposition_receipts_summary.v1";

type SourceDisposition =
  | "reviewed_records_authored"
  | "supporting_context_only"
  | "no_actionable_bus_priority_intervention"
  | "needs_more_source_review"
  | "suppressed";

type SourceDispositionDecision = {
  sourceId: string;
  disposition: SourceDisposition;
  rationale: string;
  reviewedRecordIds?: string[] | undefined;
  evidenceRefs?: string[] | undefined;
  reviewerId?: string | undefined;
  reviewedAt?: string | undefined;
};

type SourceDispositionReceipt = {
  sourceId: string;
  queueRef: string;
  disposition: SourceDisposition;
  reviewedRecordIds: string[];
  rationale: string;
  reviewerId: string | null;
  reviewedAt: string;
  evidenceRefs: string[];
};

type SourceDispositionReceiptsArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceReviewPackPath: string;
  sourceReviewPackGeneratedAt: string;
  decisionsPath: string;
  summary: {
    packSourceCount: number;
    receiptCount: number;
    closingDispositionReceiptCount: number;
    nonClosingDispositionReceiptCount: number;
    sourcesWithoutReceiptCount: number;
    publicPromotionStatus: "not_ready";
    sourceIds: string[];
  };
  policy: {
    useCase: string;
    closureRule: string;
    publicPromotionRule: string;
  };
  receipts: SourceDispositionReceipt[];
};

const decisionSchema = z.object({
  sourceId: z.string().min(1),
  disposition: z.enum([
    "reviewed_records_authored",
    "supporting_context_only",
    "no_actionable_bus_priority_intervention",
    "needs_more_source_review",
    "suppressed",
  ]),
  rationale: z.string().min(1),
  reviewedRecordIds: z.array(z.string()).optional(),
  evidenceRefs: z.array(z.string()).optional(),
  reviewerId: z.string().optional(),
  reviewedAt: z.string().optional(),
});

const optionsSchema = z.object({
  reviewPackPath: z.string(),
  decisionsPath: z.string(),
  outputPath: z.string(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  reviewerId: z.string().optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decisionCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["decisions", "receipts", "sourceDispositionReceipts"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function readDecisions(path: string): Promise<SourceDispositionDecision[]> {
  const value = await Bun.file(path).json();
  const candidates = decisionCandidates(value);
  return candidates.map((candidate, index) => {
    const parsed = decisionSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const reason =
        issue === undefined
          ? "decision does not match the source-disposition decision schema"
          : `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`;
      throw new Error(`Invalid source disposition decision ${index}: ${reason}`);
    }
    return parsed.data;
  });
}

function defaultEvidenceRefs(pack: Tier2SourceReviewPack): string[] {
  const refs = pack.sampleSurfaces.slice(0, 5).map((surface) => surface.surfaceId);
  if (refs.length > 0) return refs;
  return pack.featureRows
    .slice(0, 5)
    .map((row) => row.surfaceId)
    .filter((surfaceId, index, all) => all.indexOf(surfaceId) === index);
}

function isClosingDisposition(disposition: SourceDisposition): boolean {
  return (
    disposition === "supporting_context_only" ||
    disposition === "no_actionable_bus_priority_intervention" ||
    disposition === "suppressed"
  );
}

function buildArtifact(input: {
  generatedAt: string;
  reviewPackPath: string;
  decisionsPath: string;
  reviewPack: Tier2SourceReviewPackBatchArtifact;
  decisions: SourceDispositionDecision[];
  reviewerId: string | null;
}): SourceDispositionReceiptsArtifact {
  const packsBySource = new Map(input.reviewPack.packs.map((pack) => [pack.sourceId, pack]));
  const receipts = input.decisions.map((decision): SourceDispositionReceipt => {
    const pack = packsBySource.get(decision.sourceId);
    if (pack === undefined) {
      throw new Error(`Decision references source outside review pack batch: ${decision.sourceId}`);
    }
    return {
      sourceId: decision.sourceId,
      queueRef: pack.queueRef,
      disposition: decision.disposition,
      reviewedRecordIds: decision.reviewedRecordIds ?? [],
      rationale: decision.rationale,
      reviewerId: decision.reviewerId ?? input.reviewerId,
      reviewedAt: decision.reviewedAt ?? input.generatedAt,
      evidenceRefs: decision.evidenceRefs ?? defaultEvidenceRefs(pack),
    };
  });
  const receiptSourceIds = new Set(receipts.map((receipt) => receipt.sourceId));

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceReviewPackPath: input.reviewPackPath,
    sourceReviewPackGeneratedAt: input.reviewPack.generatedAt,
    decisionsPath: input.decisionsPath,
    summary: {
      packSourceCount: input.reviewPack.packs.length,
      receiptCount: receipts.length,
      closingDispositionReceiptCount: receipts.filter((receipt) =>
        isClosingDisposition(receipt.disposition),
      ).length,
      nonClosingDispositionReceiptCount: receipts.filter(
        (receipt) => !isClosingDisposition(receipt.disposition),
      ).length,
      sourcesWithoutReceiptCount: input.reviewPack.packs.filter(
        (pack) => !receiptSourceIds.has(pack.sourceId),
      ).length,
      publicPromotionStatus: "not_ready",
      sourceIds: receipts
        .map((receipt) => receipt.sourceId)
        .sort((left, right) => left.localeCompare(right)),
    },
    policy: {
      useCase: "Normalized source-disposition receipts authored from Tier 2 source review packs.",
      closureRule:
        "Only supporting_context_only, no_actionable_bus_priority_intervention, and suppressed close a source without reviewed intervention records.",
      publicPromotionRule:
        "Receipts can close source review accounting but do not publish facts or create intervention records.",
    },
    receipts,
  };
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderMarkdown(artifact: SourceDispositionReceiptsArtifact): string {
  const lines = [
    "# Tier 2 Source Disposition Receipts",
    "",
    `Generated: ${artifact.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Receipt count: ${artifact.summary.receiptCount}`,
    `- Closing receipts: ${artifact.summary.closingDispositionReceiptCount}`,
    `- Non-closing receipts: ${artifact.summary.nonClosingDispositionReceiptCount}`,
    `- Pack sources without receipt: ${artifact.summary.sourcesWithoutReceiptCount}`,
    `- Public promotion status: ${artifact.summary.publicPromotionStatus}`,
    "",
    "## Receipts",
    "",
    "| Source | Disposition | Evidence refs | Rationale |",
    "|---|---|---:|---|",
  ];
  for (const receipt of artifact.receipts) {
    lines.push(
      `| ${receipt.sourceId} | ${receipt.disposition} | ${receipt.evidenceRefs.length} | ${markdownEscape(receipt.rationale)} |`,
    );
  }
  lines.push("");
  lines.push("## Policy");
  lines.push("");
  lines.push(`- ${artifact.policy.closureRule}`);
  lines.push(`- ${artifact.policy.publicPromotionRule}`);
  return `${lines.join("\n")}\n`;
}

export async function runDocsTier2SourceDispositionReceipts(
  input: z.infer<typeof optionsSchema>,
): Promise<SourceDispositionReceiptsArtifact> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reviewPackPath = fromCliPath(input.reviewPackPath);
  const decisionsPath = fromCliPath(input.decisionsPath);
  const outputPath = fromCliPath(input.outputPath);
  const markdownPath =
    input.markdownPath === undefined
      ? outputPath.replace(/\.json$/u, ".md")
      : fromCliPath(input.markdownPath);
  const summaryPath =
    input.summaryPath === undefined
      ? outputPath.replace(/\.json$/u, "-summary.json")
      : fromCliPath(input.summaryPath);
  const reviewPack = (await Bun.file(reviewPackPath).json()) as Tier2SourceReviewPackBatchArtifact;
  if (reviewPack.artifactKind !== "bp.tier2_source_review_pack_batch.v1") {
    throw new Error(`Expected bp.tier2_source_review_pack_batch.v1 artifact: ${reviewPackPath}`);
  }
  if (!Array.isArray(reviewPack.packs)) {
    throw new Error(`Source review pack artifact has no packs array: ${reviewPackPath}`);
  }
  const artifact = buildArtifact({
    generatedAt,
    reviewPackPath,
    decisionsPath,
    reviewPack,
    decisions: await readDecisions(decisionsPath),
    reviewerId: input.reviewerId ?? null,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return artifact;
}

export default defineCommand({
  path: ["docs", "tier2", "source-disposition-receipts"],
  summary: "Normalize explicit Tier 2 source disposition decisions into receipt artifacts.",
  input: { options: optionsSchema },
  output: z.object({
    receiptCount: z.number().int().nonnegative(),
    closingDispositionReceiptCount: z.number().int().nonnegative(),
    nonClosingDispositionReceiptCount: z.number().int().nonnegative(),
    sourcesWithoutReceiptCount: z.number().int().nonnegative(),
    publicPromotionStatus: z.literal("not_ready"),
  }),
  async run({ input }) {
    const artifact = await runDocsTier2SourceDispositionReceipts(input.options);
    return {
      receiptCount: artifact.summary.receiptCount,
      closingDispositionReceiptCount: artifact.summary.closingDispositionReceiptCount,
      nonClosingDispositionReceiptCount: artifact.summary.nonClosingDispositionReceiptCount,
      sourcesWithoutReceiptCount: artifact.summary.sourcesWithoutReceiptCount,
      publicPromotionStatus: artifact.summary.publicPromotionStatus,
    };
  },
});

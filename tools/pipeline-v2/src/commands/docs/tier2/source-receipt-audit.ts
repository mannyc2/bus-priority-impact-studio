import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2SourceReceiptClosureAuditFromCli } from "./_source-receipt-audit.ts";

const optionsSchema = z.object({
  queuePath: z.string(),
  reviewedRecordsPaths: z
    .string()
    .optional()
    .describe("Comma-separated reviewed-record artifact paths"),
  sourceDispositionsPaths: z
    .string()
    .optional()
    .describe("Comma-separated source-disposition receipt artifact paths"),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  maxMarkdownRows: z.coerce.number().int().nonnegative().optional(),
});

const flagMap: Record<string, string> = {
  queuePath: "--queue",
  reviewedRecordsPaths: "--reviewed-records",
  sourceDispositionsPaths: "--source-dispositions",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
  maxMarkdownRows: "--max-markdown-rows",
};

export async function runDocsTier2SourceReceiptAudit(input: z.infer<typeof optionsSchema>) {
  return runTier2SourceReceiptClosureAuditFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "source-receipt-audit"],
  summary:
    "Audit whether each Tier 2 source queue item is closed by reviewed records or source dispositions.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2SourceReceiptAudit(input.options);
  },
});

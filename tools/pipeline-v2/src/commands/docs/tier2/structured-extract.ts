import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { extractTier2StructuredDocumentsFromCli } from "./_structured-extraction.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  pageMarkdownRoot: z.string().optional(),
  structuredRoot: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  provider: z.enum(["auto", "pioneer", "deepseek"]).optional(),
  model: z.string().optional(),
  fallbackModel: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  maxEstimatedCostUsd: z.coerce.number().positive().optional(),
  pageWindowSize: z.coerce.number().int().positive().optional(),
  windowConcurrency: z.coerce.number().int().positive().optional(),
  sourceId: z.string().optional(),
  sourceIds: z.string().optional(),
  limitSources: z.coerce.number().int().positive().optional(),
  execute: z.boolean().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  pageMarkdownAudit: "--page-markdown-audit",
  pageMarkdownRoot: "--page-markdown-root",
  structuredRoot: "--structured-root",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  provider: "--provider",
  model: "--model",
  fallbackModel: "--fallback-model",
  maxTokens: "--max-tokens",
  maxEstimatedCostUsd: "--max-estimated-cost-usd",
  pageWindowSize: "--page-window-size",
  windowConcurrency: "--window-concurrency",
  sourceId: "--source-id",
  sourceIds: "--source-ids",
  limitSources: "--limit-sources",
  execute: "--execute",
  output: "--output",
};

export async function runDocsTier2StructuredExtract(input: z.infer<typeof optionsSchema>) {
  return extractTier2StructuredDocumentsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "structured-extract"],
  summary:
    "Extract validated page/window structured document data from OCR Markdown using forced tool calls.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2StructuredExtract(input.options);
  },
});

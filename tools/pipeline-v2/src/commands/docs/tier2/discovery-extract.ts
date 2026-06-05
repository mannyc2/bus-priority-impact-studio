import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { extractTier2DocumentDiscoveriesFromCli } from "./_discovery-extraction.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  discoveryRoot: z.string().optional(),
  windowManifest: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  provider: z.enum(["pioneer", "deepseek"]).optional(),
  model: z.string().optional(),
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
  discoveryRoot: "--discovery-root",
  windowManifest: "--window-manifest",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  provider: "--provider",
  model: "--model",
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

export async function runDocsTier2DiscoveryExtract(input: z.infer<typeof optionsSchema>) {
  return extractTier2DocumentDiscoveriesFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "discovery-extract"],
  summary:
    "Extract raw block-ref-grounded Tier 2 discovery candidates from OCR Markdown before normalization.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2DiscoveryExtract(input.options);
  },
});

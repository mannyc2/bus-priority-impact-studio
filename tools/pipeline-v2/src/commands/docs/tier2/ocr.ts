import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { ocrTier2PageMarkdownFromCli } from "./_ocr-render.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  model: z.string().optional(),
  pdfEngine: z.string().optional(),
  serviceTier: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  pageMarkdownRoot: z.string().optional(),
  pageInputPreference: z.string().optional(),
  pageRange: z.string().optional(),
  pageConcurrency: z.coerce.number().int().positive().optional(),
  pageLimit: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sourceId: z.string().optional(),
  allPages: z.boolean().optional(),
  execute: z.boolean().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  model: "--model",
  pdfEngine: "--pdf-engine",
  serviceTier: "--service-tier",
  maxTokens: "--max-tokens",
  pageMarkdownRoot: "--page-markdown-root",
  pageInputPreference: "--page-input-preference",
  pageRange: "--page-range",
  pageConcurrency: "--page-concurrency",
  pageLimit: "--page-limit",
  limit: "--limit",
  sourceId: "--source-id",
  allPages: "--all-pages",
  execute: "--execute",
  output: "--output",
};

export async function runDocsTier2Ocr(input: z.infer<typeof optionsSchema>) {
  return ocrTier2PageMarkdownFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "ocr"],
  summary: "Render page-level OCR Markdown for planned Tier 2 documents via the pi harness.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Ocr(input.options);
  },
});

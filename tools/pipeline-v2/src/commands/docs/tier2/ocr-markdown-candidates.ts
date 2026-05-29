import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { extractTier2OcrMarkdownCandidatesFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  pageMarkdownRoot: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  triageRoot: z.string().optional(),
  candidateRoot: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  model: z.string().optional(),
  serviceTier: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
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
  pageMarkdownRoot: "--page-markdown-root",
  pageMarkdownAudit: "--page-markdown-audit",
  triageRoot: "--triage-root",
  candidateRoot: "--candidate-root",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  model: "--model",
  serviceTier: "--service-tier",
  maxTokens: "--max-tokens",
  pageWindowSize: "--page-window-size",
  windowConcurrency: "--window-concurrency",
  sourceId: "--source-id",
  sourceIds: "--source-ids",
  limitSources: "--limit-sources",
  execute: "--execute",
  output: "--output",
};

export async function runDocsTier2OcrMarkdownCandidates(input: z.infer<typeof optionsSchema>) {
  return extractTier2OcrMarkdownCandidatesFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "ocr-markdown-candidates"],
  summary: "Extract evidence candidates from page-level OCR Markdown with required tool calls.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2OcrMarkdownCandidates(input.options);
  },
});

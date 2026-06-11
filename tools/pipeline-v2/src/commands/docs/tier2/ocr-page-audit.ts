import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { auditTier2OcrPageMarkdownFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  pageMarkdownRoot: z.string().optional(),
  triageRoot: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  pageMarkdownRoot: "--page-markdown-root",
  triageRoot: "--triage-root",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2OcrPageAudit(input: z.infer<typeof optionsSchema>) {
  return auditTier2OcrPageMarkdownFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "ocr-page-audit"],
  summary: "Audit page-level OCR Markdown artifacts for completeness and visual review.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2OcrPageAudit(input.options);
  },
});

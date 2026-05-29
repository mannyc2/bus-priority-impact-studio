import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { normalizeTextMarkdownFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  captureManifest: z.string().optional(),
  pageMarkdownRoot: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  sources: z.string().optional().describe("Comma-separated source ids"),
  run: z.boolean().optional().describe("Execute the normalization run"),
  phase2CompatPlan: z.string().optional(),
  phase2CompatAudit: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  captureManifest: "--capture-manifest",
  pageMarkdownRoot: "--page-markdown-root",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  sources: "--sources",
  run: "--run",
  phase2CompatPlan: "--phase2-compat-plan",
  phase2CompatAudit: "--phase2-compat-audit",
  output: "--output",
};

export async function runDocsTier2NormalizeTextMarkdown(input: z.infer<typeof optionsSchema>) {
  return normalizeTextMarkdownFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "normalize-text-markdown"],
  summary: "Normalize captured html_text sources into OCR-equivalent per-page Markdown for Phase 2.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2NormalizeTextMarkdown(input.options);
  },
});

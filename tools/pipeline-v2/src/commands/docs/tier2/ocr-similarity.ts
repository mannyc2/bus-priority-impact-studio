import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2OcrSimilarityFromCli } from "./_ocr-similarity.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
  localPageMarkdownRoot: z.string().optional(),
  sourceId: z.string().optional(),
  sourceIds: z.string().optional(),
  limitSources: z.coerce.number().int().positive().optional(),
  limitPages: z.coerce.number().int().positive().optional(),
  execute: z.boolean().optional(),
  textLayerMode: z.enum(["prefer", "never"]).optional(),
  minTextLayerChars: z.coerce.number().int().nonnegative().optional(),
  tesseractLanguage: z.string().optional(),
  tesseractPsm: z.coerce.number().int().nonnegative().optional(),
  tesseractOem: z.coerce.number().int().nonnegative().optional(),
  renderDpi: z.coerce.number().int().positive().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  pageMarkdownAudit: "--page-markdown-audit",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
  localPageMarkdownRoot: "--local-page-markdown-root",
  sourceId: "--source-id",
  sourceIds: "--source-ids",
  limitSources: "--limit-sources",
  limitPages: "--limit-pages",
  execute: "--execute",
  textLayerMode: "--text-layer-mode",
  minTextLayerChars: "--min-text-layer-chars",
  tesseractLanguage: "--tesseract-language",
  tesseractPsm: "--tesseract-psm",
  tesseractOem: "--tesseract-oem",
  renderDpi: "--render-dpi",
};

export async function runDocsTier2OcrSimilarity(input: z.infer<typeof optionsSchema>) {
  return runTier2OcrSimilarityFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "ocr-similarity"],
  summary: "Compare local Tesseract/PDF-text OCR output against existing Tier 2 page Markdown OCR.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2OcrSimilarity(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2TesseractOcrFromCli } from "./_tesseract-ocr.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  pageMarkdownRoot: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  pageRange: z.string().optional(),
  pageConcurrency: z.coerce.number().int().positive().optional(),
  pageLimit: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sourceId: z.string().optional(),
  sourceIds: z.string().optional(),
  allPages: z.boolean().optional(),
  execute: z.boolean().optional(),
  textLayerMode: z.enum(["prefer", "never"]).optional(),
  minTextLayerChars: z.coerce.number().int().nonnegative().optional(),
  tesseractLanguage: z.string().optional(),
  tesseractPsm: z.coerce.number().int().nonnegative().optional(),
  tesseractOem: z.coerce.number().int().nonnegative().optional(),
  renderDpi: z.coerce.number().int().positive().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  pageMarkdownRoot: "--page-markdown-root",
  pageMarkdownAudit: "--page-markdown-audit",
  pageRange: "--page-range",
  pageConcurrency: "--page-concurrency",
  pageLimit: "--page-limit",
  limit: "--limit",
  sourceId: "--source-id",
  sourceIds: "--source-ids",
  allPages: "--all-pages",
  execute: "--execute",
  textLayerMode: "--text-layer-mode",
  minTextLayerChars: "--min-text-layer-chars",
  tesseractLanguage: "--tesseract-language",
  tesseractPsm: "--tesseract-psm",
  tesseractOem: "--tesseract-oem",
  renderDpi: "--render-dpi",
  output: "--output",
};

export async function runDocsTier2TesseractOcr(input: z.infer<typeof optionsSchema>) {
  return runTier2TesseractOcrFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "tesseract-ocr"],
  summary:
    "Render local page-level OCR Markdown for planned Tier 2 PDFs with PDF text-layer extraction plus Tesseract fallback.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2TesseractOcr(input.options);
  },
});

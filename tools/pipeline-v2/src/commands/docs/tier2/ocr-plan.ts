import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { planTier2OcrFromCli } from "./_ocr-plan.ts";

const optionsSchema = z.object({
  captureManifest: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  model: z.string().optional(),
  defaultPageRange: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  captureManifest: "--capture-manifest",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  model: "--model",
  defaultPageRange: "--default-page-range",
  output: "--output",
};

export async function runDocsTier2OcrPlan(input: z.infer<typeof optionsSchema>) {
  return planTier2OcrFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "ocr-plan"],
  summary: "Plan Pi/OpenRouter OCR work for captured Tier 2 documents marked ocr_required.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2OcrPlan(input.options);
  },
});

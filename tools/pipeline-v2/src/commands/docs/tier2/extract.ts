import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { extractTier2CandidatesFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  ocrReview: z.string().optional(),
  triageRoot: z.string().optional(),
  markdownCandidateExtraction: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  ocrReview: "--ocr-review",
  triageRoot: "--triage-root",
  markdownCandidateExtraction: "--markdown-candidate-extraction",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2Extract(input: z.infer<typeof optionsSchema>) {
  return extractTier2CandidatesFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "extract"],
  summary: "Build deterministic Tier 2 candidate bundle from OCR review artifacts.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Extract(input.options);
  },
});

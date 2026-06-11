import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { planTier2FollowupOcrFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  candidateBundle: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  candidateBundle: "--candidate-bundle",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  limit: "--limit",
  output: "--output",
};

export async function runDocsTier2FollowupOcrPlan(input: z.infer<typeof optionsSchema>) {
  return planTier2FollowupOcrFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "followup-ocr-plan"],
  summary: "Build a focused follow-up OCR plan from Tier 2 follow-up candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FollowupOcrPlan(input.options);
  },
});

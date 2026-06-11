import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2VocabSurfaceApplicationFromCli } from "./_vocab-surface-apply.ts";

const optionsSchema = z.object({
  canonicalMergePath: z.string(),
  graduationPlanPath: z.string(),
  projectionPath: z.string(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  canonicalMergePath: "--canonical-merge",
  graduationPlanPath: "--graduation-plan",
  projectionPath: "--projection",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
};

export async function runDocsTier2VocabSurfaceApply(input: z.infer<typeof optionsSchema>) {
  return runTier2VocabSurfaceApplicationFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "vocab-surface-apply"],
  summary:
    "Apply a cleaned Tier 2 vocab projection onto accepted surfaces as additive canonicalPayload and normalization metadata.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VocabSurfaceApply(input.options);
  },
});

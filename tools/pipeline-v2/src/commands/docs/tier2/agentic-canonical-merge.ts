import { defineCommand, z } from "@liche/core";
import { runTier2AgenticCanonicalMergeFromCli } from "./_agentic-canonical-merge.ts";
import { optionsToArgs } from "./_cli-bridge.ts";

const optionsSchema = z.object({
  selfHealPlans: z.string(),
  output: z.string().optional(),
  markdown: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  selfHealPlans: "--self-heal-plans",
  output: "--output",
  markdown: "--markdown",
  generatedAt: "--generated-at",
};

export async function runDocsTier2AgenticCanonicalMerge(input: z.infer<typeof optionsSchema>) {
  return runTier2AgenticCanonicalMergeFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "agentic-canonical-merge"],
  summary: "Merge Tier 2 agentic extraction retry runs into a canonical per-window artifact set.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2AgenticCanonicalMerge(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2VocabConsumerIndexFromCli } from "./_vocab-consumer-index.ts";

const optionsSchema = z.object({
  surfaceApplicationPath: z.string(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  surfaceApplicationPath: "--surface-application",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
};

export async function runDocsTier2VocabConsumerIndex(input: z.infer<typeof optionsSchema>) {
  return runTier2VocabConsumerIndexFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "vocab-consumer-index"],
  summary:
    "Build a compact detector/UI consumer index from the Tier 2 vocab surface application artifact.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VocabConsumerIndex(input.options);
  },
});

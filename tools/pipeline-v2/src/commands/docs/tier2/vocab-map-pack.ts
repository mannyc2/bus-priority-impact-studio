import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2VocabMapPackFromCli } from "./_vocab-map-pack.ts";

const optionsSchema = z.object({
  runRoot: z.string(),
  outputRoot: z.string().optional(),
  generatedAt: z.string().optional(),
  includeSmoke: z.boolean().optional(),
});

const flagMap: Record<string, string> = {
  runRoot: "--run-root",
  outputRoot: "--output-root",
  generatedAt: "--generated-at",
  includeSmoke: "--include-smoke",
};

export async function runDocsTier2VocabMapPack(input: z.infer<typeof optionsSchema>) {
  return runTier2VocabMapPackFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "vocab-map-pack"],
  summary:
    "Freeze, reconcile, and add deterministic rollups/provenance to completed Tier 2 vocab maps.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VocabMapPack(input.options);
  },
});

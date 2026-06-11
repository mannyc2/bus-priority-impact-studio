import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2VocabMaterializedViewsFromCli } from "./_vocab-materialized-views.ts";

const optionsSchema = z.object({
  consumerIndexPath: z.string(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  maxRouteSurfaceSamples: z.number().int().nonnegative().optional(),
  maxUnresolvedSamples: z.number().int().nonnegative().optional(),
  maxSourceSurfaceSamples: z.number().int().nonnegative().optional(),
});

const flagMap: Record<string, string> = {
  consumerIndexPath: "--consumer-index",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
  maxRouteSurfaceSamples: "--max-route-surface-samples",
  maxUnresolvedSamples: "--max-unresolved-samples",
  maxSourceSurfaceSamples: "--max-source-surface-samples",
};

export async function runDocsTier2VocabMaterializedViews(input: z.infer<typeof optionsSchema>) {
  return runTier2VocabMaterializedViewsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "vocab-materialized-views"],
  summary:
    "Build route evidence, detector feature, unresolved review, and source coverage views from the Tier 2 vocab consumer index.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VocabMaterializedViews(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2SourceDispositionQueueFromCli } from "./_source-disposition-queue.ts";

const optionsSchema = z.object({
  materializedViewsPath: z.string(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  maxRoutesPerSource: z.coerce.number().int().nonnegative().optional(),
  maxMarkdownRows: z.coerce.number().int().nonnegative().optional(),
});

const flagMap: Record<string, string> = {
  materializedViewsPath: "--materialized-views",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
  maxRoutesPerSource: "--max-routes-per-source",
  maxMarkdownRows: "--max-markdown-rows",
};

export async function runDocsTier2SourceDispositionQueue(input: z.infer<typeof optionsSchema>) {
  return runTier2SourceDispositionQueueFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "source-disposition-queue"],
  summary:
    "Build a source-level Tier 2 review/disposition queue from materialized qv1-qv10 views.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2SourceDispositionQueue(input.options);
  },
});

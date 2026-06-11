import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineCurationPackFromCli } from "./_route-timeline-curation-pack.ts";

const optionsSchema = z.object({
  route: z.string(),
  consumerIndexPath: z.string(),
  materializedViewsPath: z.string().optional(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  maxCandidates: z.coerce.number().int().nonnegative().optional(),
  maxPayloadHints: z.coerce.number().int().nonnegative().optional(),
});

const flagMap: Record<string, string> = {
  route: "--route",
  consumerIndexPath: "--consumer-index",
  materializedViewsPath: "--materialized-views",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
  maxCandidates: "--max-candidates",
  maxPayloadHints: "--max-payload-hints",
};

export async function runDocsTier2RouteTimelineCurationPack(input: z.infer<typeof optionsSchema>) {
  return runRouteTimelineCurationPackFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline-curation-pack"],
  summary:
    "Build a source-grounded route timeline curation pack from the current Tier 2 vocab consumer artifacts.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimelineCurationPack(input.options);
  },
});

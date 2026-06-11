import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineBundleFromCli } from "./_route-timeline-bundle.ts";

const optionsSchema = z.object({
  packPath: z.string(),
  toolCallPath: z.string(),
  runPath: z.string().optional(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  packPath: "--pack",
  toolCallPath: "--tool-call",
  runPath: "--run",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
};

export async function runDocsTier2RouteTimelineBundle(input: z.infer<typeof optionsSchema>) {
  return runRouteTimelineBundleFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline-bundle"],
  summary:
    "Hydrate a route timeline curation tool call into a frontend-ready, source-backed route timeline bundle.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimelineBundle(input.options);
  },
});

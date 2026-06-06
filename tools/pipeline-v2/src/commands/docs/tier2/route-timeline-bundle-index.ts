import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineBundleIndexFromCli } from "./_route-timeline-bundle-index.ts";

const optionsSchema = z.object({
  bundlePaths: z.union([z.string(), z.array(z.string())]),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  bundlePaths: "--bundles",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
};

export async function runDocsTier2RouteTimelineBundleIndex(
  input: z.infer<typeof optionsSchema>,
) {
  return runRouteTimelineBundleIndexFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline-bundle-index"],
  summary: "Build a route-level readiness index from route timeline bundle artifacts.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimelineBundleIndex(input.options);
  },
});

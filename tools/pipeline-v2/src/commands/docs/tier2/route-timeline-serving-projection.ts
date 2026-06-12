import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineServingProjectionFromCli } from "./_route-timeline-serving-projection.ts";

const optionsSchema = z.object({
  indexPath: z.string(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  schemaPath: z.string().optional(),
  seedPath: z.string().optional(),
  artifactRoot: z.string().optional(),
  month: z.string().optional(),
  r2Prefix: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  indexPath: "--index",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  schemaPath: "--schema",
  seedPath: "--seed",
  artifactRoot: "--artifact-root",
  month: "--month",
  r2Prefix: "--r2-prefix",
  generatedAt: "--generated-at",
};

export async function runDocsTier2RouteTimelineServingProjection(
  input: z.infer<typeof optionsSchema>,
) {
  return runRouteTimelineServingProjectionFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline-serving-projection"],
  summary:
    "Project route timeline bundle readiness into compact D1 rows and R2 artifact refs.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimelineServingProjection(input.options);
  },
});

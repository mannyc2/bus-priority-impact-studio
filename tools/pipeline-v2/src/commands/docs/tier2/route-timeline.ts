import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineFromCli } from "./_route-timeline.ts";

const optionsSchema = z.object({
  route: z.string(),
  surfacesDir: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  outputDir: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  route: "--route",
  surfacesDir: "--surfaces-dir",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  outputDir: "--output-dir",
  generatedAt: "--generated-at",
};

export async function runDocsTier2RouteTimeline(input: z.infer<typeof optionsSchema>) {
  return runRouteTimelineFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline"],
  summary:
    "Project document-derived surfaces into one route's cleaned, deduped, cited intervention timeline (spike).",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimeline(input.options);
  },
});

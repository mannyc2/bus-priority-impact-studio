import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2RouteReviewQueueFromCli } from "./_route-review-queue.ts";

const optionsSchema = z.object({
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  surfacesDir: z.string().optional(),
  routeResolution: z.string().optional(),
  output: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  surfacesDir: "--surfaces-dir",
  routeResolution: "--route-resolution",
  output: "--output",
  generatedAt: "--generated-at",
};

export async function runDocsTier2RouteReviewQueue(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2RouteReviewQueueFromCli(optionsToArgs(input, flagMap));
  return {
    outputPath: result.outputPath,
    summary: result.artifact.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "route-review-queue"],
  summary:
    "Build route-specific Tier 2 review queues from document event route-resolution results.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteReviewQueue(input.options);
  },
});

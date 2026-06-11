import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineCurationRepairFromCli } from "./_route-timeline-curation-repair.ts";

const optionsSchema = z.object({
  packPath: z.string(),
  toolCallPath: z.string(),
  outputPath: z.string().optional(),
  summaryPath: z.string().optional(),
  validationPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  packPath: "--pack",
  toolCallPath: "--tool-call",
  outputPath: "--output",
  summaryPath: "--summary",
  validationPath: "--validation",
  generatedAt: "--generated-at",
};

export async function runDocsTier2RouteTimelineCurationRepair(
  input: z.infer<typeof optionsSchema>,
) {
  return runRouteTimelineCurationRepairFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline-curation-repair"],
  summary:
    "Deterministically backfill dateAssertionRefs into an accepted route timeline curation tool call.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimelineCurationRepair(input.options);
  },
});

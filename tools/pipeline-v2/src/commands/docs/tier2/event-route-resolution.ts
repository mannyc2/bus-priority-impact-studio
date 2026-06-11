import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2DocumentEventRouteResolutionFromCli } from "./_event-route-resolution.ts";

const optionsSchema = z.object({
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  surfacesDir: z.string().optional(),
  events: z.string().optional(),
  entities: z.string().optional(),
  output: z.string().optional(),
  db: z.string().optional(),
  routeStopMonth: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  surfacesDir: "--surfaces-dir",
  events: "--events",
  entities: "--entities",
  output: "--output",
  db: "--db",
  routeStopMonth: "--route-stop-month",
  generatedAt: "--generated-at",
};

export async function runDocsTier2EventRouteResolution(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2DocumentEventRouteResolutionFromCli(optionsToArgs(input, flagMap));
  return {
    outputPath: result.outputPath,
    routeStopMonth: result.artifact.routeStopMonth,
    summary: result.artifact.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "event-route-resolution"],
  summary:
    "Classify document-derived events and resolve route context with current-GTFS route text plus a stop-street gazetteer.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2EventRouteResolution(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2OperationalDateAssertionsFromCli } from "./_operational-date-assertions.ts";

const optionsSchema = z.object({
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  surfacesDir: z.string().optional(),
  events: z.string().optional(),
  routeResolution: z.string().optional(),
  output: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  surfacesDir: "--surfaces-dir",
  events: "--events",
  routeResolution: "--route-resolution",
  output: "--output",
  generatedAt: "--generated-at",
};

export async function runDocsTier2OperationalDateAssertions(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2OperationalDateAssertionsFromCli(optionsToArgs(input, flagMap));
  return {
    outputPath: result.outputPath,
    summary: result.artifact.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "operational-date-assertions"],
  summary:
    "Derive source-stated operational-date assertions from document events: trust official MTA/DOT status + date, using statusRaw and event kind (no LLM, no historical-GTFS date gate).",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2OperationalDateAssertions(input.options);
  },
});

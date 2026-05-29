import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { auditTier2InterventionDuplicatesFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  canonicalEvents: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  canonicalEvents: "--canonical-events",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2Dedupe(input: z.infer<typeof optionsSchema>) {
  return auditTier2InterventionDuplicatesFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "dedupe"],
  summary: "Audit duplicate candidates in canonical Tier 2 intervention staging events.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Dedupe(input.options);
  },
});

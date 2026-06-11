import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { verifyTier2ManualInterventionsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  candidateBundle: z.string().optional(),
  canonicalEvents: z.string().optional(),
  documentChunks: z.string().optional(),
  manualInterventions: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  candidateBundle: "--candidate-bundle",
  canonicalEvents: "--canonical-events",
  documentChunks: "--document-chunks",
  manualInterventions: "--manual-interventions",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2VerifyManualInterventions(input: z.infer<typeof optionsSchema>) {
  return verifyTier2ManualInterventionsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "verify-manual-interventions"],
  summary: "Verify manually enriched Tier 2 intervention candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VerifyManualInterventions(input.options);
  },
});

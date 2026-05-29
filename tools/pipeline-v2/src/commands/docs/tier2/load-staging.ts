import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { loadTier2InterventionStagingFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  candidateBundle: z.string().optional(),
  canonicalEvents: z.string().optional(),
  duplicateAudit: z.string().optional(),
  duplicateDecisions: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  db: z.string().optional().describe("Local pipeline SQLite path"),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  candidateBundle: "--candidate-bundle",
  canonicalEvents: "--canonical-events",
  duplicateAudit: "--duplicate-audit",
  duplicateDecisions: "--duplicate-decisions",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  db: "--db",
  output: "--output",
};

export async function runDocsTier2LoadStaging(input: z.infer<typeof optionsSchema>) {
  return loadTier2InterventionStagingFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "load-staging"],
  summary: "Load canonical Tier 2 staging events into local serving staging tables.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2LoadStaging(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { verifyTier2DuplicateDecisionsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  duplicateDecisions: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  duplicateDecisions: "--duplicate-decisions",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2VerifyDuplicateDecisions(input: z.infer<typeof optionsSchema>) {
  return verifyTier2DuplicateDecisionsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "verify-duplicate-decisions"],
  summary: "Verify whether duplicate Tier 2 intervention decisions are complete.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VerifyDuplicateDecisions(input.options);
  },
});

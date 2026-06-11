import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { buildTier2DuplicateDecisionTemplateFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  duplicateReview: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  duplicateReview: "--duplicate-review",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2DuplicateDecisions(input: z.infer<typeof optionsSchema>) {
  return buildTier2DuplicateDecisionTemplateFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "duplicate-decisions"],
  summary: "Build an editable decision template for duplicate Tier 2 intervention candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2DuplicateDecisions(input.options);
  },
});

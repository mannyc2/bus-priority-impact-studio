import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { buildTier2DuplicateReviewQueueFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  candidateBundle: z.string().optional(),
  canonicalEvents: z.string().optional(),
  duplicateAudit: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  candidateBundle: "--candidate-bundle",
  canonicalEvents: "--canonical-events",
  duplicateAudit: "--duplicate-audit",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2DuplicateReview(input: z.infer<typeof optionsSchema>) {
  return buildTier2DuplicateReviewQueueFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "duplicate-review"],
  summary: "Build a human review queue for duplicate Tier 2 intervention candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2DuplicateReview(input.options);
  },
});

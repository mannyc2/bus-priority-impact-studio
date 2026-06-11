import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { promotePublishableInterventionsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  reviewedCorpus: z.string().describe("Path to reviewed Phase 3 v3 records corpus"),
  manualReview: z.string().describe("Path to manual review dispositions JSON"),
  candidateCorpus: z.string().describe("Path to candidate corpus JSON"),
  output: z.string().optional(),
  evidencePreviewLimit: z.coerce.number().int().positive().optional(),
});

const flagMap: Record<string, string> = {
  reviewedCorpus: "--reviewed-corpus",
  manualReview: "--manual-review",
  candidateCorpus: "--candidate-corpus",
  output: "--output",
  evidencePreviewLimit: "--evidence-preview-limit",
};

export async function runDocsTier2PromotePublishableInterventions(
  input: z.infer<typeof optionsSchema>,
) {
  return promotePublishableInterventionsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "promote-publishable-interventions"],
  summary:
    "Promote reviewed Phase 3 v3 records + manual-review dispositions into a publishable intervention staging artifact.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2PromotePublishableInterventions(input.options);
  },
});

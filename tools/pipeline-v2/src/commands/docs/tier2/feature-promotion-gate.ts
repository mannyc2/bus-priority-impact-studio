import { defineCommand, z } from "@liche/core";
import { runTier2FeaturePromotionGate } from "./feature-harness/promotion-gate.ts";

const optionsSchema = z.object({
  ledgerPath: z.string(),
  outputPath: z.string().optional(),
  strictNoBlockingErrors: z.boolean().optional(),
  generatedAt: z.string().optional(),
});

export async function runDocsTier2FeaturePromotionGate(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2FeaturePromotionGate({
    ledgerPath: input.ledgerPath,
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    ...(input.strictNoBlockingErrors === undefined ? {} : { strictNoBlockingErrors: input.strictNoBlockingErrors }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
  return {
    artifactKind: result.gate.artifactKind,
    generatedAt: result.gate.generatedAt,
    outputPath: result.outputPath,
    passed: result.gate.passed,
    errors: result.gate.errors,
    summary: result.gate.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-promotion-gate"],
  summary: "Hard-gate a Tier 2 feature proof ledger before public/detector/causal/brief promotion.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeaturePromotionGate(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { runTier2FeatureProofLedger } from "./feature-harness/proof-ledger.ts";

const optionsSchema = z.object({
  vocabApplicationPath: z.string(),
  canonicalMergePath: z.string().optional(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

export async function runDocsTier2FeatureProofLedger(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2FeatureProofLedger({
    vocabApplicationPath: input.vocabApplicationPath,
    ...(input.canonicalMergePath === undefined ? {} : { canonicalMergePath: input.canonicalMergePath }),
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    ...(input.markdownPath === undefined ? {} : { markdownPath: input.markdownPath }),
    ...(input.summaryPath === undefined ? {} : { summaryPath: input.summaryPath }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-proof-ledger"],
  summary:
    "Build a machine-verifiable Tier 2 feature proof ledger from normalized vocab-applied surfaces.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeatureProofLedger(input.options);
  },
});

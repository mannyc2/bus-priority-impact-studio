import { defineCommand, z } from "@liche/core";
import { runTier2FeatureProofLedgerVocabResolver } from "./feature-harness/vocab-resolver.ts";

const optionsSchema = z.object({
  proofLedgerPath: z.string(),
  vocabApplicationPath: z.string(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
});

export async function runDocsTier2FeatureVocabResolver(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2FeatureProofLedgerVocabResolver({
    proofLedgerPath: input.proofLedgerPath,
    vocabApplicationPath: input.vocabApplicationPath,
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
    sourceProofLedgerPath: result.artifact.sourceProofLedgerPath,
    sourceVocabApplicationPath: result.artifact.sourceVocabApplicationPath,
    stats: result.stats,
    summary: result.artifact.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-vocab-resolver"],
  summary:
    "Resolve Tier 2 feature proof-ledger candidates against deterministic vocab surface-application results.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeatureVocabResolver(input.options);
  },
});

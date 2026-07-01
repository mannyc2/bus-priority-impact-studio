import { defineCommand, z } from "@liche/core";
import { runTier2FeatureProofLedgerFromVNext } from "./feature-harness/vnext-proof-adapter.ts";

const optionsSchema = z.object({
  vnextArtifactPaths: z.string(),
  canonicalMergePath: z.string().optional(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  inputMode: z
    .enum(["strict_final_accepted", "salvage_accepted_candidates"])
    .default("strict_final_accepted"),
});

function splitArtifactPaths(value: string): string[] {
  return value
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export async function runDocsTier2FeatureVNextProofLedger(input: z.infer<typeof optionsSchema>) {
  const vnextArtifactPaths = splitArtifactPaths(input.vnextArtifactPaths);
  if (vnextArtifactPaths.length === 0) {
    throw new Error(
      "docs tier2 feature-vnext-proof-ledger requires at least one --vnext-artifact-paths value.",
    );
  }
  const result = await runTier2FeatureProofLedgerFromVNext({
    vnextArtifactPaths,
    ...(input.canonicalMergePath === undefined
      ? {}
      : { canonicalMergePath: input.canonicalMergePath }),
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    ...(input.markdownPath === undefined ? {} : { markdownPath: input.markdownPath }),
    ...(input.summaryPath === undefined ? {} : { summaryPath: input.summaryPath }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    inputMode: input.inputMode,
  });
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    sourceFeatureExtractionInputMode: result.artifact.sourceFeatureExtractionInputMode,
    sourceFeatureExtractionPaths: result.artifact.sourceFeatureExtractionPaths ?? [],
    summary: result.artifact.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-vnext-proof-ledger"],
  summary: "Build a Tier 2 feature proof ledger from accepted vNext extraction candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeatureVNextProofLedger(input.options);
  },
});

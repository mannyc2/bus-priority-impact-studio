import { defineCommand, z } from "@liche/core";
import {
  QueueKindSchema,
  runTier2FeatureQueueManifestGate,
} from "./feature-harness/queue-manifest.ts";

const optionsSchema = z.object({
  manifestPath: z.string(),
  requestedQueueKind: QueueKindSchema,
  outputPath: z.string().optional(),
  allowNonFullCorpusInput: z.boolean().optional(),
  generatedAt: z.string().optional(),
});

export async function runDocsTier2FeatureQueueManifestGate(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2FeatureQueueManifestGate({
    manifestPath: input.manifestPath,
    requestedQueueKind: input.requestedQueueKind,
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    ...(input.allowNonFullCorpusInput === undefined
      ? {}
      : { allowNonFullCorpusInput: input.allowNonFullCorpusInput }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
  return {
    artifactKind: result.gate.artifactKind,
    generatedAt: result.gate.generatedAt,
    outputPath: result.outputPath,
    passed: result.gate.passed,
    errors: result.gate.errors,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-queue-manifest-gate"],
  summary: "Validate that a Tier 2 feature queue manifest is safe for the requested corpus role.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeatureQueueManifestGate(input.options);
  },
});

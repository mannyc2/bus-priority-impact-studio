import { defineCommand, z } from "@liche/core";
import {
  DEFAULT_TIER2_FEATURE_SMOKE_MODEL,
  DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER,
} from "./feature-harness/contract.ts";
import { runTier2FeatureExtractionSmoke } from "./feature-harness/runner.ts";

const optionsSchema = z.object({
  inputPath: z.string().optional(),
  outputPath: z.string().optional(),
  generatedAt: z.string().optional(),
  runId: z.string().optional(),
  execute: z.boolean().optional(),
  provider: z.literal(DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  maxRepairRounds: z.coerce.number().int().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  maxAttempts: z.coerce.number().int().positive().optional(),
});

export async function runDocsTier2FeatureSmoke(input: z.infer<typeof optionsSchema>) {
  const result = await runTier2FeatureExtractionSmoke({
    ...(input.inputPath === undefined ? {} : { inputPath: input.inputPath }),
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.execute === undefined ? {} : { execute: input.execute }),
    provider: input.provider ?? DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER,
    model: input.model ?? DEFAULT_TIER2_FEATURE_SMOKE_MODEL,
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.maxRepairRounds === undefined ? {} : { maxRepairRounds: input.maxRepairRounds }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
  });
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    summary: result.artifact.summary,
    provider: result.artifact.provider,
    model: result.artifact.model,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-smoke"],
  summary:
    "Run a small Tier 2 vNext extraction smoke through the strict feature harness; use --execute for live Pioneer/DeepSeek.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeatureSmoke(input.options);
  },
});

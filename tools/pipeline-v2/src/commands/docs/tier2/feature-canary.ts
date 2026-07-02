import { defineCommand, z } from "@liche/core";
import { runTier2FeatureCanary } from "./feature-harness/canary-runner.ts";
import {
  DEFAULT_TIER2_FEATURE_SMOKE_MODEL,
  DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER,
} from "./feature-harness/contract.ts";

const optionsSchema = z.object({
  manifestPath: z.string().optional(),
  requestPaths: z.string().optional(),
  outputRoot: z.string().optional(),
  sampleSize: z.coerce.number().int().positive().optional(),
  seed: z.string().optional(),
  concurrency: z.coerce.number().int().positive().optional(),
  rateLimitPerMinute: z.coerce.number().int().positive().optional(),
  execute: z.boolean().optional(),
  provider: z.literal(DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  maxRepairRounds: z.coerce.number().int().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  maxAttempts: z.coerce.number().int().positive().optional(),
  generatedAt: z.string().optional(),
  runId: z.string().optional(),
  vocabApplicationPath: z.string().optional(),
  includePriorContext: z.boolean().optional(),
  maxPriorContextChars: z.coerce.number().int().min(0).optional(),
  minAcceptedRunRate: z.coerce.number().min(0).max(1).optional(),
  maxPublishableWithoutProof: z.coerce.number().int().min(0).optional(),
});

function splitPaths(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const paths = value
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  return paths.length === 0 ? undefined : paths;
}

export async function runDocsTier2FeatureCanary(input: z.infer<typeof optionsSchema>) {
  const requestPaths = splitPaths(input.requestPaths);
  const result = await runTier2FeatureCanary({
    ...(input.manifestPath === undefined ? {} : { manifestPath: input.manifestPath }),
    ...(requestPaths === undefined ? {} : { requestPaths }),
    ...(input.outputRoot === undefined ? {} : { outputRoot: input.outputRoot }),
    ...(input.sampleSize === undefined ? {} : { sampleSize: input.sampleSize }),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
    ...(input.rateLimitPerMinute === undefined
      ? {}
      : { rateLimitPerMinute: input.rateLimitPerMinute }),
    ...(input.execute === undefined ? {} : { execute: input.execute }),
    provider: input.provider ?? DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER,
    model: input.model ?? DEFAULT_TIER2_FEATURE_SMOKE_MODEL,
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.maxRepairRounds === undefined ? {} : { maxRepairRounds: input.maxRepairRounds }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.vocabApplicationPath === undefined
      ? {}
      : { vocabApplicationPath: input.vocabApplicationPath }),
    ...(input.includePriorContext === undefined
      ? {}
      : { includePriorContext: input.includePriorContext }),
    ...(input.maxPriorContextChars === undefined
      ? {}
      : { maxPriorContextChars: input.maxPriorContextChars }),
    ...(input.minAcceptedRunRate === undefined
      ? {}
      : { minAcceptedRunRate: input.minAcceptedRunRate }),
    ...(input.maxPublishableWithoutProof === undefined
      ? {}
      : { maxPublishableWithoutProof: input.maxPublishableWithoutProof }),
  });
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    outputRoot: result.artifact.outputRoot,
    summary: result.artifact.summary,
    checks: result.artifact.checks,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "feature-canary"],
  summary:
    "Run a sampled Tier 2 vNext feature harness canary with bounded concurrency, proof ledger, vocab resolution, and promotion-gate reporting.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2FeatureCanary(input.options);
  },
});

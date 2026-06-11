import { defineCommand, z } from "@liche/core";
import { runTier2AgenticExtractionHarness } from "./_agentic-extraction.ts";

const optionsSchema = z.object({
  input: z.string(),
  output: z.string().optional(),
  generatedAt: z.string().optional(),
  runId: z.string().optional(),
  execute: z.boolean().optional(),
  provider: z.enum(["pioneer", "deepseek"]).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  maxAttempts: z.coerce.number().int().positive().optional(),
  maxRepairRounds: z.coerce.number().int().nonnegative().optional(),
});

export async function runDocsTier2AgenticExtract(input: z.infer<typeof optionsSchema>) {
  return runTier2AgenticExtractionHarness({
    inputPath: input.input,
    ...(input.output === undefined ? {} : { outputPath: input.output }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.execute === undefined ? {} : { execute: input.execute }),
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.maxRepairRounds === undefined ? {} : { maxRepairRounds: input.maxRepairRounds }),
  });
}

export default defineCommand({
  path: ["docs", "tier2", "agentic-extract"],
  summary: "Run the Tier 2 agentic extraction harness with optional forced-tool LLM repair loop.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2AgenticExtract(input.options);
  },
});

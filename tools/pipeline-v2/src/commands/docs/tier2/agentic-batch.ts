import { defineCommand, z } from "@liche/core";
import { runTier2AgenticExtractionBatch } from "./_agentic-extraction.ts";

const optionsSchema = z.object({
  discovery: z.string(),
  outputDir: z.string(),
  windowIds: z.string().optional(),
  sourceId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  generatedAt: z.string().optional(),
  runId: z.string().optional(),
  routeCatalogPath: z.string().optional(),
  execute: z.boolean().optional(),
  provider: z.enum(["pioneer", "deepseek"]).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  maxAttempts: z.coerce.number().int().positive().optional(),
  maxRepairRounds: z.coerce.number().int().nonnegative().optional(),
});

export async function runDocsTier2AgenticBatch(input: z.infer<typeof optionsSchema>) {
  return runTier2AgenticExtractionBatch({
    discoveryPath: input.discovery,
    outputDir: input.outputDir,
    ...(input.windowIds === undefined
      ? {}
      : {
          windowIds: input.windowIds
            .split(",")
            .map((windowId) => windowId.trim())
            .filter((windowId) => windowId.length > 0),
        }),
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.routeCatalogPath === undefined ? {} : { routeCatalogPath: input.routeCatalogPath }),
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
  path: ["docs", "tier2", "agentic-batch"],
  summary: "Build discovery-backed agentic extraction requests, run the harness, and write audits.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2AgenticBatch(input.options);
  },
});

import { defineCommand, z } from "@liche/core";
import { buildTier2AgenticSelfHealPlan } from "./_agentic-self-heal.ts";

const optionsSchema = z.object({
  queue: z.string(),
  output: z.string().optional(),
  generatedAt: z.string().optional(),
  nextRunId: z.string().optional(),
  nextOutputRoot: z.string().optional(),
  workerCountPlanned: z.coerce.number().int().positive().optional(),
  provider: z.enum(["pioneer", "deepseek"]).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  maxAttempts: z.coerce.number().int().positive().optional(),
  maxRepairRounds: z.coerce.number().int().nonnegative().optional(),
});

export async function runDocsTier2AgenticSelfHeal(input: z.infer<typeof optionsSchema>) {
  const plan = await buildTier2AgenticSelfHealPlan({
    queuePath: input.queue,
    ...(input.output === undefined ? {} : { outputPath: input.output }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    ...(input.nextRunId === undefined ? {} : { nextRunId: input.nextRunId }),
    ...(input.nextOutputRoot === undefined ? {} : { nextOutputRoot: input.nextOutputRoot }),
    ...(input.workerCountPlanned === undefined
      ? {}
      : { workerCountPlanned: input.workerCountPlanned }),
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.maxRepairRounds === undefined ? {} : { maxRepairRounds: input.maxRepairRounds }),
  });
  if (input.output === undefined) return plan;
  return {
    artifactKind: plan.artifactKind,
    schemaVersion: plan.schemaVersion,
    generatedAt: plan.generatedAt,
    outputPath: input.output,
    sourceRunId: plan.sourceRunId,
    nextRun: plan.nextRun,
    summary: plan.summary,
  };
}

export default defineCommand({
  path: ["docs", "tier2", "agentic-self-heal"],
  summary: "Classify a Tier 2 agentic extraction run and emit a retry/quarantine self-heal plan.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2AgenticSelfHeal(input.options);
  },
});

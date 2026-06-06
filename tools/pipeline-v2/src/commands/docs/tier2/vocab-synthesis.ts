import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2VocabSynthesisFromCli } from "./_vocab-synthesis.ts";

const optionsSchema = z.object({
  graduationPlan: z.string(),
  outputRoot: z.string().optional(),
  key: z.string().optional(),
  keys: z.string().optional(),
  chunkSize: z.coerce.number().int().positive().optional(),
  maxValuesPerKey: z.coerce.number().int().positive().optional(),
  maxValues: z.coerce.number().int().positive().optional(),
  examplesPerValue: z.coerce.number().int().positive().optional(),
  execute: z.boolean().optional(),
  directToolCall: z.boolean().optional(),
  persistSessions: z.boolean().optional(),
  provider: z.enum(["pioneer", "deepseek"]).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().min(0).optional(),
  harness: z.enum(["v1", "v2"]).optional(),
  agenticMaxToolCalls: z.coerce.number().int().positive().optional(),
  maxContextToolCalls: z.coerce.number().int().positive().optional(),
  agenticWallTimeMs: z.coerce.number().int().positive().optional(),
  sourceAuditRoot: z.string().optional(),
  sourceAuditExamplesPerValue: z.coerce.number().int().positive().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  graduationPlan: "--graduation-plan",
  outputRoot: "--output-root",
  key: "--key",
  keys: "--keys",
  chunkSize: "--chunk-size",
  maxValuesPerKey: "--max-values-per-key",
  maxValues: "--max-values",
  examplesPerValue: "--examples-per-value",
  execute: "--execute",
  directToolCall: "--direct-tool-call",
  persistSessions: "--persist-sessions",
  provider: "--provider",
  model: "--model",
  maxTokens: "--max-tokens",
  temperature: "--temperature",
  harness: "--harness",
  agenticMaxToolCalls: "--agentic-max-tool-calls",
  maxContextToolCalls: "--max-context-tool-calls",
  agenticWallTimeMs: "--agentic-wall-time-ms",
  sourceAuditRoot: "--source-audit-root",
  sourceAuditExamplesPerValue: "--source-audit-examples-per-value",
  generatedAt: "--generated-at",
};

export async function runDocsTier2VocabSynthesis(input: z.infer<typeof optionsSchema>) {
  return runTier2VocabSynthesisFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "vocab-synthesis"],
  summary:
    "Prepare, execute, validate, and source-audit design-time vocabulary maps for Tier 2 raw fields.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2VocabSynthesis(input.options);
  },
});

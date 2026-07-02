import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2RawFieldGraduationFromCli } from "./_raw-field-graduation.ts";

const optionsSchema = z.object({
  roots: z.string().optional(),
  canonicalMerge: z.string().optional(),
  output: z.string().optional(),
  markdown: z.string().optional(),
  llmBatchOutput: z.string().optional(),
  generatedAt: z.string().optional(),
  maxValuesPerKey: z.coerce.number().int().positive().optional(),
  examplesPerValue: z.coerce.number().int().positive().optional(),
});

const flagMap: Record<string, string> = {
  roots: "--roots",
  canonicalMerge: "--canonical-merge",
  output: "--output",
  markdown: "--markdown",
  llmBatchOutput: "--llm-batch-output",
  generatedAt: "--generated-at",
  maxValuesPerKey: "--max-values-per-key",
  examplesPerValue: "--examples-per-value",
};

export async function runDocsTier2RawFieldGraduation(input: z.infer<typeof optionsSchema>) {
  return runTier2RawFieldGraduationFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "raw-field-graduation"],
  summary: "Audit agentic rawPayload fields and emit a safe LLM-ready vocabulary graduation plan.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RawFieldGraduation(input.options);
  },
});

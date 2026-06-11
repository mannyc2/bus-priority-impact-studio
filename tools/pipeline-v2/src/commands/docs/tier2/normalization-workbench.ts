import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2NormalizationWorkbenchFromCli } from "./_normalization-workbench.ts";

const optionsSchema = z.object({
  normalizedCandidates: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
  batchOutput: z.string().optional(),
  appliedOutput: z.string().optional(),
  markdown: z.string().optional(),
  groupCount: z.coerce.number().int().positive().optional(),
  examplesPerGroup: z.coerce.number().int().positive().optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  execute: z.boolean().optional(),
});

const flagMap: Record<string, string> = {
  normalizedCandidates: "--normalized-candidates",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
  batchOutput: "--batch-output",
  appliedOutput: "--applied-output",
  markdown: "--markdown",
  groupCount: "--group-count",
  examplesPerGroup: "--examples-per-group",
  model: "--model",
  maxTokens: "--max-tokens",
  execute: "--execute",
};

export async function runDocsTier2NormalizationWorkbench(input: z.infer<typeof optionsSchema>) {
  return runTier2NormalizationWorkbenchFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "normalization-workbench"],
  summary:
    "Group Tier 2 discovery candidates, propose normalization rules, apply approved seed rules, and audit unresolved rows.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2NormalizationWorkbench(input.options);
  },
});


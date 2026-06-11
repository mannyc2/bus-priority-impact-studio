import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2ResearchAuditFromCli } from "./_research-audit.ts";

const optionsSchema = z.object({
  normalizedCandidates: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  markdownRunRoot: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
  model: z.string().optional(),
  focus: z.enum(["all", "schema", "gold", "adversarial", "causal"]).optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  fixtureCount: z.coerce.number().int().positive().optional(),
  maxMarkdownCharsPerFixture: z.coerce.number().int().positive().optional(),
  maxCandidateSamplePerFixture: z.coerce.number().int().positive().optional(),
  maxRawCandidateChars: z.coerce.number().int().positive().optional(),
  execute: z.boolean().optional(),
});

const flagMap: Record<string, string> = {
  normalizedCandidates: "--normalized-candidates",
  pageMarkdownAudit: "--page-markdown-audit",
  markdownRunRoot: "--markdown-run-root",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
  model: "--model",
  focus: "--focus",
  maxTokens: "--max-tokens",
  fixtureCount: "--fixture-count",
  maxMarkdownCharsPerFixture: "--max-markdown-chars-per-fixture",
  maxCandidateSamplePerFixture: "--max-candidate-sample-per-fixture",
  maxRawCandidateChars: "--max-raw-candidate-chars",
  execute: "--execute",
};

export async function runDocsTier2ResearchAudit(input: z.infer<typeof optionsSchema>) {
  return runTier2ResearchAuditFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "research-audit"],
  summary:
    "Build a curated Tier 2 fixture pack and optionally run an Opus-backed schema/gold/adversarial/causal audit.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2ResearchAudit(input.options);
  },
});

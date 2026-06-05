import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2ProofHarnessFromCli } from "./_proof-harness.ts";

function listOptionSchema() {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
        : value,
    z.array(z.string()).optional(),
  );
}

const optionsSchema = z.object({
  operationalDateAssertions: z.string().optional(),
  output: z.string().optional(),
  requestRoot: z.string().optional(),
  pageMarkdownManifest: z.string().optional(),
  pageMarkdownRoot: z.string().optional(),
  documentContext: z.string().optional(),
  proofResults: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  generatedAt: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  maxContextChars: z.coerce.number().int().positive().optional(),
  executeConcurrency: z.coerce.number().int().positive().optional(),
  limitCandidates: z.coerce.number().int().positive().optional(),
  candidateIds: listOptionSchema(),
  sourceIds: listOptionSchema(),
  execute: z.boolean().optional(),
  reuseExistingResponses: z.boolean().optional(),
});

const flagMap: Record<string, string> = {
  operationalDateAssertions: "--operational-date-assertions",
  output: "--output",
  requestRoot: "--request-root",
  pageMarkdownManifest: "--page-markdown-manifest",
  pageMarkdownRoot: "--page-markdown-root",
  documentContext: "--document-context",
  proofResults: "--proof-results",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  generatedAt: "--generated-at",
  model: "--model",
  maxTokens: "--max-tokens",
  maxContextChars: "--max-context-chars",
  executeConcurrency: "--execute-concurrency",
  limitCandidates: "--limit-candidates",
  candidateIds: "--candidate-ids",
  sourceIds: "--source-ids",
  execute: "--execute",
  reuseExistingResponses: "--reuse-existing-responses",
};

export async function runDocsTier2ProofHarness(input: z.infer<typeof optionsSchema>) {
  return runTier2ProofHarnessFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "proof-harness"],
  summary:
    "Build span-backed LLM proof requests for Tier 2 operational-date anchors and validate proof results against source text.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2ProofHarness(input.options);
  },
});

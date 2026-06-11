import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { extractTier2DocumentInterventionRecordsFromCli } from "./_intervention-records.ts";

const optionsSchema = z.object({
  markdownCandidateExtraction: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  synthesisRoot: z.string().optional(),
  model: z.string().optional(),
  serviceTier: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  sourceId: z.string().optional(),
  sourceIds: z.string().optional().describe("Comma-separated source ids"),
  limitSources: z.coerce.number().int().positive().optional(),
  routeCatalog: z.string().optional(),
  execute: z.boolean().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  markdownCandidateExtraction: "--markdown-candidate-extraction",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  synthesisRoot: "--synthesis-root",
  model: "--model",
  serviceTier: "--service-tier",
  maxTokens: "--max-tokens",
  sourceId: "--source-id",
  sourceIds: "--source-ids",
  limitSources: "--limit-sources",
  routeCatalog: "--route-catalog",
  execute: "--execute",
  output: "--output",
};

export async function runDocsTier2InterventionRecords(input: z.infer<typeof optionsSchema>) {
  return extractTier2DocumentInterventionRecordsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "intervention-records"],
  summary: "Synthesize per-source intervention records from Tier 2 evidence candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2InterventionRecords(input.options);
  },
});

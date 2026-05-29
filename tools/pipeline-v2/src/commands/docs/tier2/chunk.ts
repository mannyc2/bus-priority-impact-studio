import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { chunkTier2DocumentsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  candidateBundle: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  candidateBundle: "--candidate-bundle",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2Chunk(input: z.infer<typeof optionsSchema>) {
  return chunkTier2DocumentsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "chunk"],
  summary: "Build deterministic text/OCR chunks for Tier 2 source-span review.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Chunk(input.options);
  },
});

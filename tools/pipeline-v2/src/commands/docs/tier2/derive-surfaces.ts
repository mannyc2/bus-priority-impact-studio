import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2DocumentDerivedSurfacesFromCli } from "./_document-derived-surfaces.ts";

const optionsSchema = z.object({
  normalizedCandidates: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  outputDir: z.string().optional(),
  workbench: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  normalizedCandidates: "--normalized-candidates",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  outputDir: "--output-dir",
  workbench: "--workbench",
  generatedAt: "--generated-at",
};

export async function runDocsTier2DeriveSurfaces(input: z.infer<typeof optionsSchema>) {
  return runTier2DocumentDerivedSurfacesFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "derive-surfaces"],
  summary:
    "Materialize normalized Tier 2 discovery candidates into source-grounded document-derived surface JSONL files.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2DeriveSurfaces(input.options);
  },
});

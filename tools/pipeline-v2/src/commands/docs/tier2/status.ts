import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { buildTier2PipelineStatusFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  studioRelease: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  studioRelease: "--studio-release",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2Status(input: z.infer<typeof optionsSchema>) {
  return buildTier2PipelineStatusFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "status"],
  summary: "Summarize Tier 2 pipeline completion gates from generated artifacts.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Status(input.options);
  },
});

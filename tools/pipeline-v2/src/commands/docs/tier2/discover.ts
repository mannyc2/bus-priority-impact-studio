import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { discoverTier2DocsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  captureManifest: z.string().optional().describe("Path to capture manifest JSON"),
  backlog: z.string().optional().describe("Path to original Tier 2 backlog JSON"),
  mergedBacklog: z.string().optional().describe("Path to write merged Tier 2 backlog"),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  output: z.string().optional().describe("Output discovery artifact path"),
});

const flagMap: Record<string, string> = {
  captureManifest: "--capture-manifest",
  backlog: "--backlog",
  mergedBacklog: "--merged-backlog",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  output: "--output",
};

export async function runDocsTier2Discover(input: z.infer<typeof optionsSchema>) {
  return discoverTier2DocsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "discover"],
  summary: "Discover additional Tier 2 document links from a captured corpus.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Discover(input.options);
  },
});

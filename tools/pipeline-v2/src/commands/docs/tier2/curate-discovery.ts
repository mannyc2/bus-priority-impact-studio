import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { buildTier2DiscoveryCurationAuditFromCli } from "./_discovery-curation.ts";

const optionsSchema = z.object({
  discoveryRoot: z.string().optional(),
  discoveryRoots: z.string().optional(),
  output: z.string().optional(),
  markdown: z.string().optional(),
  rules: z.string().optional(),
  normalized: z.string().optional(),
  topClusters: z.coerce.number().int().positive().optional(),
  canonicalPerWindow: z.coerce.boolean().optional(),
  canonicalRootPriority: z.string().optional(),
});

const flagMap: Record<string, string> = {
  discoveryRoot: "--discovery-root",
  discoveryRoots: "--discovery-roots",
  output: "--output",
  markdown: "--markdown",
  rules: "--rules",
  normalized: "--normalized",
  topClusters: "--top-clusters",
  canonicalPerWindow: "--canonical-per-window",
  canonicalRootPriority: "--canonical-root-priority",
};

export async function runDocsTier2CurateDiscovery(input: z.infer<typeof optionsSchema>) {
  return buildTier2DiscoveryCurationAuditFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "curate-discovery"],
  summary:
    "Audit, deduplicate, and seed normalization rules for raw Tier 2 document discovery candidates.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2CurateDiscovery(input.options);
  },
});

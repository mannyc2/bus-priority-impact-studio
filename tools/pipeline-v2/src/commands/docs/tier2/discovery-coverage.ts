import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { buildTier2DiscoveryCoverageFromCli } from "./_discovery-coverage.ts";

const optionsSchema = z.object({
  ocrPlan: z.string().optional(),
  pageMarkdownAudit: z.string().optional(),
  discoveryRoot: z.string().optional(),
  discoveryRoots: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  sourceId: z.string().optional(),
  sourceIds: z.string().optional(),
  pageWindowSize: z.coerce.number().int().positive().optional(),
  output: z.string().optional(),
  missingWindowManifest: z.string().optional(),
});

const flagMap: Record<string, string> = {
  ocrPlan: "--ocr-plan",
  pageMarkdownAudit: "--page-markdown-audit",
  discoveryRoot: "--discovery-root",
  discoveryRoots: "--discovery-roots",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  sourceId: "--source-id",
  sourceIds: "--source-ids",
  pageWindowSize: "--page-window-size",
  output: "--output",
  missingWindowManifest: "--missing-window-manifest",
};

export async function runDocsTier2DiscoveryCoverage(input: z.infer<typeof optionsSchema>) {
  return buildTier2DiscoveryCoverageFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "discovery-coverage"],
  summary: "Audit OCR page/window discovery coverage and write a runnable missing-window manifest.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2DiscoveryCoverage(input.options);
  },
});

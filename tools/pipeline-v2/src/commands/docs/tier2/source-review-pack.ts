import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2SourceReviewPackBatchFromCli } from "./_source-review-pack.ts";

const optionsSchema = z.object({
  queuePath: z.string(),
  materializedViewsPath: z.string().optional(),
  mtaWikiAlignmentPath: z.string().optional(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  summaryPath: z.string().optional(),
  generatedAt: z.string().optional(),
  sourceIds: z.string().optional().describe("Comma-separated source ids"),
  top: z.coerce.number().int().nonnegative().optional(),
  reviewLane: z.enum(["record_candidate_review", "source_disposition_review"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  maxFeatureRows: z.coerce.number().int().nonnegative().optional(),
  maxUnresolvedItems: z.coerce.number().int().nonnegative().optional(),
  maxRouteContexts: z.coerce.number().int().nonnegative().optional(),
  maxMtaWikiContexts: z.coerce.number().int().nonnegative().optional(),
});

const flagMap: Record<string, string> = {
  queuePath: "--queue",
  materializedViewsPath: "--materialized-views",
  mtaWikiAlignmentPath: "--mta-wiki-alignment",
  outputPath: "--output",
  markdownPath: "--markdown",
  summaryPath: "--summary",
  generatedAt: "--generated-at",
  sourceIds: "--source-ids",
  top: "--top",
  reviewLane: "--review-lane",
  priority: "--priority",
  maxFeatureRows: "--max-feature-rows",
  maxUnresolvedItems: "--max-unresolved-items",
  maxRouteContexts: "--max-route-contexts",
  maxMtaWikiContexts: "--max-mta-wiki-contexts",
};

export async function runDocsTier2SourceReviewPack(input: z.infer<typeof optionsSchema>) {
  return runTier2SourceReviewPackBatchFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "source-review-pack"],
  summary:
    "Build source-scoped Tier 2 review packs from a source disposition queue and materialized views.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2SourceReviewPack(input.options);
  },
});

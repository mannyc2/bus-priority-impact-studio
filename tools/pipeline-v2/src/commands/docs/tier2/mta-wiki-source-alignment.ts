import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildMtaWikiTier2SourceAlignmentArtifact,
  type MtaWikiTier2BridgeArtifact,
  renderMtaWikiTier2SourceAlignmentMarkdown,
  type Tier2SourceQueueForMtaWikiAlignment,
} from "@bp/applied-research/evaluation";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";

const DEFAULT_BRIDGE_PATH = join(
  defaultArtifactRootPath(),
  "docs",
  "mta-wiki-tier2-bridge",
  "mta-wiki-intervention-review-queue.json",
);

const DEFAULT_OUTPUT_PATH = join(
  defaultArtifactRootPath(),
  "docs",
  "mta-wiki-tier2-bridge",
  "mta-wiki-source-alignment.json",
);

export type RunDocsTier2MtaWikiSourceAlignmentInput = {
  queuePath: string;
  bridgePath?: string | undefined;
  output?: string | undefined;
  markdown?: string | undefined;
  generatedAt?: string | undefined;
};

export async function runDocsTier2MtaWikiSourceAlignment(
  input: RunDocsTier2MtaWikiSourceAlignmentInput,
) {
  const queuePath = fromCliPath(input.queuePath);
  const bridgePath =
    input.bridgePath === undefined ? DEFAULT_BRIDGE_PATH : fromCliPath(input.bridgePath);
  const outputPath = input.output === undefined ? DEFAULT_OUTPUT_PATH : fromCliPath(input.output);
  const markdownPath =
    input.markdown === undefined
      ? outputPath.replace(/\.json$/u, ".md")
      : input.markdown.length === 0
        ? null
        : fromCliPath(input.markdown);

  const sourceQueue = (await Bun.file(queuePath).json()) as Tier2SourceQueueForMtaWikiAlignment;
  const mtaWikiBridge = (await Bun.file(bridgePath).json()) as MtaWikiTier2BridgeArtifact;
  if (!Array.isArray(sourceQueue.items))
    throw new Error(`Source queue has no items array: ${queuePath}`);
  if (mtaWikiBridge.mtaWikiCanonicalBridge !== true) {
    throw new Error(`Expected mta-wiki bridge artifact: ${bridgePath}`);
  }

  const artifact = buildMtaWikiTier2SourceAlignmentArtifact({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceQueue,
    sourceQueuePath: queuePath,
    mtaWikiBridge,
    mtaWikiBridgePath: bridgePath,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  if (markdownPath !== null) {
    await mkdir(dirname(markdownPath), { recursive: true });
    await Bun.write(markdownPath, renderMtaWikiTier2SourceAlignmentMarkdown(artifact));
  }
  return artifact;
}

const optionsSchema = z.object({
  queuePath: z.string(),
  bridgePath: z.string().optional(),
  output: z.string().optional(),
  markdown: z
    .string()
    .optional()
    .describe("Output Markdown path. Pass an empty string to skip Markdown."),
  generatedAt: z.string().optional(),
});

export default defineCommand({
  path: ["docs", "tier2", "mta-wiki-source-alignment"],
  summary:
    "Align mta-wiki bridge review groups to the Tier 2 source disposition queue without promoting facts.",
  input: { options: optionsSchema },
  output: z.object({
    outputPath: z.string().nullable(),
    markdownPath: z.string().nullable(),
    publicPromotionStatus: z.literal("not_ready"),
    queueSourceCount: z.number().int().nonnegative(),
    exactAlignedSourceCount: z.number().int().nonnegative(),
    exactAlignedReviewGroupCount: z.number().int().nonnegative(),
    unalignedQueueSourceCount: z.number().int().nonnegative(),
    unalignedMtaWikiReviewGroupCount: z.number().int().nonnegative(),
    alignedInterventionCandidateRecordCount: z.number().int().nonnegative(),
    promotionBlockers: z.array(z.string()),
  }),
  async run({ input }) {
    const artifact = await runDocsTier2MtaWikiSourceAlignment(input.options);
    const outputPath =
      input.options.output === undefined ? DEFAULT_OUTPUT_PATH : fromCliPath(input.options.output);
    const markdownPath =
      input.options.markdown === undefined
        ? outputPath.replace(/\.json$/u, ".md")
        : input.options.markdown.length === 0
          ? null
          : fromCliPath(input.options.markdown);
    return {
      outputPath,
      markdownPath,
      publicPromotionStatus: artifact.summary.publicPromotionStatus,
      queueSourceCount: artifact.summary.queueSourceCount,
      exactAlignedSourceCount: artifact.summary.exactAlignedSourceCount,
      exactAlignedReviewGroupCount: artifact.summary.exactAlignedReviewGroupCount,
      unalignedQueueSourceCount: artifact.summary.unalignedQueueSourceCount,
      unalignedMtaWikiReviewGroupCount: artifact.summary.unalignedMtaWikiReviewGroupCount,
      alignedInterventionCandidateRecordCount:
        artifact.summary.alignedInterventionCandidateRecordCount,
      promotionBlockers: artifact.summary.promotionBlockers,
    };
  },
});

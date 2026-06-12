import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import {
  buildMtaWikiTier2BridgeArtifact,
  type MtaWikiCanonicalRecord,
  type MtaWikiTier2BridgeArtifact,
  renderMtaWikiTier2BridgeMarkdown,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../../lib/paths.ts";

const DEFAULT_OUTPUT_PATH = join(
  defaultArtifactRootPath(),
  "docs",
  "mta-wiki-tier2-bridge",
  "mta-wiki-intervention-review-queue.json",
);

function defaultMtaWikiRoot(): string {
  return process.env["MTA_WIKI_ROOT"] ?? join(dirname(repoRoot), "mta-wiki");
}

function resolveMtaWikiRoot(value: string | undefined): string {
  if (value === undefined || value.length === 0) return defaultMtaWikiRoot();
  return isAbsolute(value) ? value : fromCliPath(value);
}

function canonicalPath(root: string, fileName: string): string {
  return join(root, "data", "canonical", fileName);
}

async function readJsonlRecords(path: string): Promise<MtaWikiCanonicalRecord[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`mta-wiki canonical JSONL not found: ${path}`);
  const text = await file.text();
  const records: MtaWikiCanonicalRecord[] = [];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/u)) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as MtaWikiCanonicalRecord);
    } catch (error) {
      throw new Error(`Failed to parse ${path}:${lineNumber}: ${(error as Error).message}`);
    }
  }
  return records;
}

export type RunDocsTier2MtaWikiBridgeInput = {
  mtaWikiRoot?: string | undefined;
  output?: string | undefined;
  markdown?: string | undefined;
  generatedAt?: string | undefined;
  minReviewGroups?: number | undefined;
};

export async function runDocsTier2MtaWikiBridge(
  input: RunDocsTier2MtaWikiBridgeInput,
): Promise<MtaWikiTier2BridgeArtifact> {
  const mtaWikiRoot = resolveMtaWikiRoot(input.mtaWikiRoot);
  const canonicalRoot = join(mtaWikiRoot, "data", "canonical");
  const outputPath = input.output === undefined ? DEFAULT_OUTPUT_PATH : fromCliPath(input.output);
  const markdownPath =
    input.markdown === undefined
      ? outputPath.replace(/\.json$/u, ".md")
      : input.markdown.length === 0
        ? null
        : fromCliPath(input.markdown);

  const canonical = {
    sources: await readJsonlRecords(canonicalPath(mtaWikiRoot, "sources.jsonl")),
    routes: await readJsonlRecords(canonicalPath(mtaWikiRoot, "routes.jsonl")),
    projects: await readJsonlRecords(canonicalPath(mtaWikiRoot, "projects.jsonl")),
    events: await readJsonlRecords(canonicalPath(mtaWikiRoot, "events.jsonl")),
    treatmentComponents: await readJsonlRecords(
      canonicalPath(mtaWikiRoot, "treatment_components.jsonl"),
    ),
    relations: await readJsonlRecords(canonicalPath(mtaWikiRoot, "relations.jsonl")),
  };

  const artifact = buildMtaWikiTier2BridgeArtifact({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtaWikiRoot,
    canonicalRoot,
    outputPath,
    canonical,
  });

  const minReviewGroups = input.minReviewGroups ?? 1;
  if (artifact.summary.reviewGroupCount < minReviewGroups) {
    throw new Error(
      `Expected at least ${minReviewGroups} mta-wiki review group(s), found ${artifact.summary.reviewGroupCount}.`,
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  if (markdownPath !== null) {
    await mkdir(dirname(markdownPath), { recursive: true });
    await Bun.write(markdownPath, renderMtaWikiTier2BridgeMarkdown(artifact));
  }

  return artifact;
}

const commandOutputSchema = z.object({
  outputPath: z.string().nullable(),
  markdownPath: z.string().nullable(),
  publicPromotionStatus: z.literal("not_ready"),
  interventionCandidateRecordCount: z.number().int().nonnegative(),
  reviewGroupCount: z.number().int().nonnegative(),
  reviewGroupsWithRoutes: z.number().int().nonnegative(),
  reviewGroupsWithoutRoutes: z.number().int().nonnegative(),
  promotionBlockers: z.array(z.string()),
  nextActions: z.array(z.string()),
});

const optionsSchema = z.object({
  mtaWikiRoot: z.string().optional().describe("Path to the mta-wiki repo root."),
  output: z.string().optional().describe("Output JSON artifact path."),
  markdown: z
    .string()
    .optional()
    .describe("Output Markdown path. Pass an empty string to skip Markdown."),
  generatedAt: z.string().optional(),
  minReviewGroups: arg
    .positiveInt()
    .default(1)
    .describe("Fail if fewer than this many review groups are produced."),
});

export default defineCommand({
  path: ["docs", "tier2", "mta-wiki-bridge"],
  summary:
    "Project mta-wiki canonical JSONL into an honest Tier 2 intervention review queue bridge.",
  input: { options: optionsSchema },
  output: commandOutputSchema,
  async run({ input }) {
    const artifact = await runDocsTier2MtaWikiBridge(input.options);
    const markdownPath =
      input.options.markdown === undefined
        ? (artifact.outputPath?.replace(/\.json$/u, ".md") ?? null)
        : input.options.markdown.length === 0
          ? null
          : fromCliPath(input.options.markdown);

    return {
      outputPath: artifact.outputPath,
      markdownPath,
      publicPromotionStatus: artifact.summary.publicPromotionStatus,
      interventionCandidateRecordCount: artifact.summary.interventionCandidateRecordCount,
      reviewGroupCount: artifact.summary.reviewGroupCount,
      reviewGroupsWithRoutes: artifact.summary.reviewGroupsWithRoutes,
      reviewGroupsWithoutRoutes: artifact.summary.reviewGroupsWithoutRoutes,
      promotionBlockers: artifact.summary.promotionBlockers,
      nextActions: artifact.nextActions,
    };
  },
});

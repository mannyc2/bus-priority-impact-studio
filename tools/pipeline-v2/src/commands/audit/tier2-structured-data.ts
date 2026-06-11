import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  buildTier2StructuredDataInventoryFromArtifacts,
  renderTier2StructuredDataInventoryMarkdown,
  summarizeTier2StructuredArtifactValue,
  type Tier2StructuredArtifactSummary,
  type Tier2StructuredDataInventory,
  type Tier2StructuredLayer,
  type Tier2StructuredTrustTier,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { Glob } from "bun";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export { classifyTier2StructuredArtifact } from "@bp/applied-research/evaluation";
export type {
  Tier2StructuredArtifactSummary,
  Tier2StructuredDataInventory,
  Tier2StructuredLayer,
  Tier2StructuredTrustTier,
};

export async function summarizeTier2StructuredArtifact(args: {
  docsRoot: string;
  path: string;
}): Promise<Tier2StructuredArtifactSummary | null> {
  const file = Bun.file(args.path);
  if (!(await file.exists())) return null;
  let value: unknown;
  try {
    value = await file.json();
  } catch (error) {
    return {
      path: args.path,
      relativePath: relative(args.docsRoot, args.path),
      layer: "unknown_json",
      trustTier: "legacy_or_unknown",
      useCase: "Unreadable JSON artifact.",
      byteLength: file.size,
      generatedAt: null,
      counts: {
        sourceCount: null,
        routeCount: null,
        recordCount: null,
        candidateCount: null,
        eventCount: null,
        publishableCount: null,
        validCurrentRecordSchemaCount: null,
        invalidCurrentRecordSchemaCount: null,
      },
      summary: null,
      warnings: [`json_parse_failed: ${(error as Error).message}`],
    };
  }

  const valueSummary = summarizeTier2StructuredArtifactValue({
    fileName: args.path,
    value,
  });

  return {
    path: args.path,
    relativePath: relative(args.docsRoot, args.path),
    layer: valueSummary.layer,
    trustTier: valueSummary.trustTier,
    useCase: valueSummary.useCase,
    byteLength: file.size,
    generatedAt: valueSummary.generatedAt,
    counts: valueSummary.counts,
    summary: valueSummary.summary,
    warnings: valueSummary.warnings,
  };
}

export async function buildTier2StructuredDataInventory(args: {
  docsRoot?: string | undefined;
  output?: string | undefined;
  markdown?: string | undefined;
}): Promise<Tier2StructuredDataInventory> {
  const artifactRoot = defaultArtifactRootPath();
  const docsRoot = args.docsRoot ?? join(artifactRoot, "docs");
  const outputPath =
    args.output ?? join(artifactRoot, "audits", "tier2-structured-data-inventory.json");
  const markdownPath =
    args.markdown ?? join(artifactRoot, "audits", "tier2-structured-data-inventory.md");
  const glob = new Glob("**/*.json");
  const artifacts: Tier2StructuredArtifactSummary[] = [];

  for await (const relativePath of glob.scan({ cwd: docsRoot })) {
    const lower = relativePath.toLowerCase();
    if (
      !lower.includes("intervention") &&
      !lower.includes("candidate-bundle") &&
      !lower.includes("ocr-markdown-candidates") &&
      !lower.includes("followup-curation")
    ) {
      continue;
    }
    const summary = await summarizeTier2StructuredArtifact({
      docsRoot,
      path: join(docsRoot, relativePath),
    });
    if (summary !== null) artifacts.push(summary);
  }

  const inventory = buildTier2StructuredDataInventoryFromArtifacts({
    generatedAt: new Date().toISOString(),
    docsRoot,
    outputPath,
    markdownPath,
    artifacts,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, inventory);
  if (markdownPath.length > 0) {
    await mkdir(dirname(markdownPath), { recursive: true });
    await Bun.write(markdownPath, renderTier2StructuredDataInventoryMarkdown(inventory));
  }
  return inventory;
}

export default defineCommand({
  path: ["audit", "tier2-structured-data"],
  summary:
    "Inventory Tier 2 structured-document artifacts and identify the best current research/serving substrates.",
  input: {
    options: z.object({
      docsRoot: z
        .string()
        .optional()
        .describe("Docs artifact root. Defaults to data/artifacts/docs."),
      output: z.string().optional().describe("Override output path for inventory JSON."),
      markdown: z.string().optional().describe("Override output path for inventory Markdown."),
      minArtifacts: arg
        .positiveInt()
        .default(1)
        .describe("Fail if fewer than this many structured artifacts are found."),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    markdownPath: z.string().nullable(),
    artifactCount: z.number(),
    bestResearchArtifactPath: z.string().nullable(),
    bestPublishableArtifactPath: z.string().nullable(),
    nextActions: z.array(z.string()),
  }),
  async run({ input }) {
    const inventory = await buildTier2StructuredDataInventory({
      docsRoot:
        input.options.docsRoot === undefined ? undefined : fromCliPath(input.options.docsRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      markdown:
        input.options.markdown === undefined ? undefined : fromCliPath(input.options.markdown),
    });
    if (inventory.summary.artifactCount < input.options.minArtifacts) {
      throw new Error(
        `Expected at least ${input.options.minArtifacts} Tier 2 structured artifact(s), found ${inventory.summary.artifactCount}.`,
      );
    }
    return {
      outputPath: inventory.outputPath,
      markdownPath: inventory.markdownPath,
      artifactCount: inventory.summary.artifactCount,
      bestResearchArtifactPath: inventory.summary.bestResearchArtifactPath,
      bestPublishableArtifactPath: inventory.summary.bestPublishableArtifactPath,
      nextActions: inventory.nextActions,
    };
  },
});

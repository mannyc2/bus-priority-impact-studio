import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  buildLatticeOpportunityPreviewArtifact,
  type LatticeOpportunityPreviewArtifact,
  latticeOpportunityPreviewBundleRunId,
  type ReviewPacketArtifact,
  renderLatticeOpportunityPreviewHtml,
  renderLatticeOpportunityPreviewMarkdown,
  type SignalFeaturesArtifact,
} from "@bp/applied-research/review-packets";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export type {
  LatticeOpportunityPreviewArtifact,
  LatticeOpportunityPreviewRow,
  ReviewPacketArtifact,
  SignalFeaturesArtifact,
} from "@bp/applied-research/review-packets";

export {
  buildLatticeOpportunityPreviewArtifact,
  buildLatticeOpportunityRouteInputs,
  renderLatticeOpportunityPreviewHtml,
  renderLatticeOpportunityPreviewMarkdown,
} from "@bp/applied-research/review-packets";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["findings", "lattice-review-bundles"],
  summary: "Build a local-only lattice review-bundle preview from finding review artifacts.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      markdownOutput: z.string().optional(),
      htmlOutput: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    markdownOutputPath: z.string(),
    htmlOutputPath: z.string(),
    routeInputCount: z.number().int().nonnegative(),
    bundleCount: z.number().int().nonnegative(),
    abstainedAssessmentCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const findingsRoot = join(artifactRoot, "findings", releaseMonth);
    const reviewPacketsPath = join(findingsRoot, "review-packets.json");
    const signalFeaturesPath = join(findingsRoot, "signal-features.json");
    const outputPath =
      input.options.output === undefined
        ? join(findingsRoot, "lattice-review-bundles.json")
        : fromCliPath(input.options.output);
    const markdownOutputPath =
      input.options.markdownOutput === undefined
        ? join(findingsRoot, "lattice-review-bundles.md")
        : fromCliPath(input.options.markdownOutput);
    const htmlOutputPath =
      input.options.htmlOutput === undefined
        ? join(findingsRoot, "lattice-review-bundles.html")
        : fromCliPath(input.options.htmlOutput);

    const artifact: LatticeOpportunityPreviewArtifact = buildLatticeOpportunityPreviewArtifact({
      month: releaseMonth,
      generatedAt: new Date().toISOString(),
      bundleRunId: latticeOpportunityPreviewBundleRunId(releaseMonth),
      sourceArtifacts: {
        reviewPackets: repoDisplayPath(reviewPacketsPath),
        signalFeatures: repoDisplayPath(signalFeaturesPath),
      },
      reviewPackets: await readJsonIfExists<ReviewPacketArtifact>(reviewPacketsPath),
      signalFeatures: await readJsonIfExists<SignalFeaturesArtifact>(signalFeaturesPath),
    });
    const markdown = renderLatticeOpportunityPreviewMarkdown(artifact);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    await mkdir(dirname(markdownOutputPath), { recursive: true });
    await Bun.write(markdownOutputPath, markdown);
    await mkdir(dirname(htmlOutputPath), { recursive: true });
    await Bun.write(htmlOutputPath, renderLatticeOpportunityPreviewHtml(artifact));

    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      markdownOutputPath: repoDisplayPath(markdownOutputPath),
      htmlOutputPath: repoDisplayPath(htmlOutputPath),
      routeInputCount: artifact.summary.routeInputCount,
      bundleCount: artifact.summary.bundleCount,
      abstainedAssessmentCount: artifact.summary.abstainedAssessmentCount,
    };
  },
});

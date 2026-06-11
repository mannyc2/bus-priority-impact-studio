import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { loadRouteTreatmentFeaturesFromArtifact } from "@bp/applied-research/artifacts";
import {
  buildTreatmentDetectorReviewArtifact,
  treatmentDetectorReviewMarkdown,
} from "@bp/applied-research/detector-runs";
import { loadTreatmentDetectorReviewLocalDbRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import {
  dbOptions,
  defaultLocalPipelineDbPath,
  openLocalPipelineDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export function treatmentDetectorReviewArtifactPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(input.artifactRoot, "detector-previews", input.month, "treatment-review.json");
}

export function treatmentDetectorReviewMarkdownPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(input.artifactRoot, "detector-previews", input.month, "treatment-review.md");
}

export async function runTreatmentDetectorReview(input: {
  dbPath: string;
  artifactRoot: string;
  month: string;
  outputPath?: string | undefined;
  markdownPath?: string | undefined;
  routeId?: string | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  month: string;
  outputPath: string;
  markdownPath: string;
  candidateCount: number;
  busLaneSlowSegmentReviewCount: number;
  treatedSlowRouteReviewCount: number;
  tspSourceGapBlockerCount: number;
}> {
  const outputPath =
    input.outputPath ??
    treatmentDetectorReviewArtifactPath({ artifactRoot: input.artifactRoot, month: input.month });
  const markdownPath =
    input.markdownPath ??
    treatmentDetectorReviewMarkdownPath({ artifactRoot: input.artifactRoot, month: input.month });
  const local = await openLocalPipelineDb(input.dbPath, { readonly: true });
  try {
    const treatmentFeatures = await loadRouteTreatmentFeaturesFromArtifact({
      artifactRoot: input.artifactRoot,
      month: input.month,
      ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
    });
    const localRows = loadTreatmentDetectorReviewLocalDbRows({
      sqlite: local.sqlite,
      month: input.month,
      ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
    });
    const artifact = buildTreatmentDetectorReviewArtifact({
      month: input.month,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      artifactPath: repoDisplayPath(treatmentFeatures.artifactPath),
      routeTreatmentFeatures: treatmentFeatures.routeTreatmentFeatures,
      routeSegmentTreatmentFeatures: treatmentFeatures.routeSegmentTreatmentFeatures,
      routeTreatmentSourceGapFeatures: treatmentFeatures.routeTreatmentSourceGapFeatures,
      speedRows: localRows.speedRows,
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeJson(outputPath, artifact);
    await Bun.write(markdownPath, treatmentDetectorReviewMarkdown(artifact));
    return {
      month: input.month,
      outputPath: repoDisplayPath(outputPath),
      markdownPath: repoDisplayPath(markdownPath),
      candidateCount: artifact.summary.candidateCount,
      busLaneSlowSegmentReviewCount: artifact.summary.busLaneSlowSegmentReviewCount,
      treatedSlowRouteReviewCount: artifact.summary.treatedSlowRouteReviewCount,
      tspSourceGapBlockerCount: artifact.summary.tspSourceGapBlockerCount,
    };
  } finally {
    local.sqlite.close();
  }
}

export default defineCommand({
  path: ["findings", "treatment-review"],
  summary: "Build a deterministic treatment-informed detector preview artifact.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      markdownOutput: z.string().optional(),
      routeId: z.string().optional(),
    }),
  },
  output: z.object({
    month: z.string(),
    outputPath: z.string(),
    markdownPath: z.string(),
    candidateCount: z.number().int().nonnegative(),
    busLaneSlowSegmentReviewCount: z.number().int().nonnegative(),
    treatedSlowRouteReviewCount: z.number().int().nonnegative(),
    tspSourceGapBlockerCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    return runTreatmentDetectorReview({
      dbPath,
      artifactRoot,
      month: isoMonth(input.options.year, input.options.month),
      outputPath: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      markdownPath:
        input.options.markdownOutput === undefined
          ? undefined
          : fromCliPath(input.options.markdownOutput),
      routeId: input.options.routeId,
    });
  },
});

import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  routeTreatmentSummaryArtifactPath,
  routeTreatmentSummaryMarkdownPath,
} from "@bp/applied-research/artifacts";
import { loadRouteTreatmentSummaryLocalDbRows } from "@bp/applied-research/local-db";
import {
  buildRouteTreatmentSummaryArtifact,
  routeTreatmentSourceRowsFromAce,
  routeTreatmentSourceRowsFromInterventionEvents,
  routeTreatmentSourceRowsFromPublishableInterventions,
  routeTreatmentSourceRowsFromRouteBriefSummaries,
  routeTreatmentSourceRowsFromTier2Events,
  routeTreatmentSummaryMarkdown,
  type PublishableInterventionLike,
} from "@bp/applied-research/treatments";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot, repoRoot } from "../../lib/paths.ts";

const defaultPublishableInterventionsPath = fromRepoRoot(
  "data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json",
);

type PublishableInterventionsArtifactLike = {
  publishableInterventions?: PublishableInterventionLike[];
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

async function loadPublishableInterventions(
  path: string | null,
): Promise<readonly PublishableInterventionLike[]> {
  if (path === null) return [];
  const artifact = await readJsonIfExists<PublishableInterventionsArtifactLike>(path);
  return Array.isArray(artifact?.publishableInterventions) ? artifact.publishableInterventions : [];
}

export async function runRouteTreatmentSummary(input: {
  local: OpenLocalPipelineDb;
  month: string;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  summaryOutput?: string | undefined;
  publishableInterventionsPath?: string | null | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  month: string;
  outputPath: string;
  summaryPath: string;
  validationStatus: "pass" | "warn" | "fail";
  issueCount: number;
  routeCount: number;
  routeTreatmentRowCount: number;
  sourceGapRowCount: number;
  segmentTreatmentRowCount: number;
  routeWithPositiveEvidenceCount: number;
}> {
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const outputPath =
    input.output ??
    routeTreatmentSummaryArtifactPath({
      artifactRoot,
      month: input.month,
    });
  const summaryOutputPath =
    input.summaryOutput ??
    routeTreatmentSummaryMarkdownPath({
      artifactRoot,
      month: input.month,
    });
  const publishablePath =
    input.publishableInterventionsPath === undefined
      ? defaultPublishableInterventionsPath
      : input.publishableInterventionsPath;

  const localRows = loadRouteTreatmentSummaryLocalDbRows({
    sqlite: input.local.sqlite,
    month: input.month,
  });
  const publishableInterventions = await loadPublishableInterventions(publishablePath ?? null);
  const evidenceRows = [
    ...routeTreatmentSourceRowsFromAce({ rows: localRows.aceRows, month: input.month }),
    ...routeTreatmentSourceRowsFromRouteBriefSummaries({
      rows: localRows.routeBriefRows,
      month: input.month,
    }),
    ...routeTreatmentSourceRowsFromInterventionEvents({
      rows: localRows.interventionEventRows,
      month: input.month,
    }),
    ...routeTreatmentSourceRowsFromTier2Events({
      rows: localRows.tier2EventRows,
      month: input.month,
    }),
    ...routeTreatmentSourceRowsFromPublishableInterventions({
      rows: publishableInterventions,
      month: input.month,
    }),
  ];

  const artifact = buildRouteTreatmentSummaryArtifact({
    month: input.month,
    routeIds: localRows.routeRows.map((row) => row.route_id),
    evidenceRows,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: repoDisplayPath(input.local.path),
    artifactPath: repoDisplayPath(outputPath),
    summaryPath: repoDisplayPath(summaryOutputPath),
    localMissingTables: localRows.missingTables,
    publishableInterventionCount: publishableInterventions.length,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(summaryOutputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(summaryOutputPath, routeTreatmentSummaryMarkdown(artifact));

  return {
    month: input.month,
    outputPath: repoDisplayPath(outputPath),
    summaryPath: repoDisplayPath(summaryOutputPath),
    validationStatus: artifact.validation.status,
    issueCount: artifact.validation.issues.length,
    routeCount: artifact.summary.routeCount,
    routeTreatmentRowCount: artifact.summary.routeTreatmentRowCount,
    sourceGapRowCount: artifact.summary.sourceGapRowCount,
    segmentTreatmentRowCount: artifact.summary.segmentTreatmentRowCount,
    routeWithPositiveEvidenceCount: artifact.summary.routeWithPositiveEvidenceCount,
  };
}

export default defineCommand({
  path: ["studio", "route-treatment-summary"],
  summary: "Build the deterministic route treatment-state summary artifact.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override JSON output path"),
      summaryOutput: z.string().optional().describe("Override Markdown summary output path"),
      publishableInterventions: z
        .string()
        .optional()
        .describe("Reviewed Tier 2 publishable intervention artifact path"),
      skipPublishableInterventions: z
        .boolean()
        .default(false)
        .describe("Skip optional Tier 2 publishable intervention artifact input"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    month: z.string(),
    outputPath: z.string(),
    summaryPath: z.string(),
    validationStatus: z.enum(["pass", "warn", "fail"]),
    issueCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    routeTreatmentRowCount: z.number().int().nonnegative(),
    sourceGapRowCount: z.number().int().nonnegative(),
    segmentTreatmentRowCount: z.number().int().nonnegative(),
    routeWithPositiveEvidenceCount: z.number().int().nonnegative(),
  }),
  async run({ ctx, input }) {
    return runRouteTreatmentSummary({
      local: localDbFromCtx(ctx),
      month: isoMonth(input.options.year, input.options.month),
      artifactRoot:
        input.options.artifactRoot === undefined ? undefined : fromCliPath(input.options.artifactRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      summaryOutput:
        input.options.summaryOutput === undefined
          ? undefined
          : fromCliPath(input.options.summaryOutput),
      publishableInterventionsPath: input.options.skipPublishableInterventions
        ? null
        : input.options.publishableInterventions === undefined
          ? undefined
          : fromCliPath(input.options.publishableInterventions),
    });
  },
});

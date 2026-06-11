import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { ewtScoreVectorArtifactPath } from "@bp/applied-research/artifacts";
import { loadEwtRouteMonthScoreVectorLocalDbRows } from "@bp/applied-research/local-db";
import {
  buildEwtRouteMonthScoreVectorStudy,
  type EwtRouteMonthScoreVectorArtifact,
} from "@bp/applied-research/score-vectors";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { ewtScoreVectorArtifactPath } from "@bp/applied-research/artifacts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["build", "ewt-score-vectors"],
  summary: "Build route-month EWT baseline and score-vector calibration artifacts.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(4).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      releaseYear: arg.positiveInt().default(2026).describe("Release year for release vector"),
      releaseMonth: arg.positiveInt().default(3).describe("Release month for release vector, 1-12"),
      minSampleCount: arg
        .positiveInt()
        .default(30)
        .describe("Minimum observed headway samples for a route-month row to enter scoring"),
      fleetFlagQuantile: z
        .number()
        .min(0)
        .max(1)
        .default(0.9)
        .describe("Fleet historical quantile used for calibration flags"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for EWT score-vector JSON"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    releaseMonth: z.string(),
    outputPath: z.string(),
    rawRowCount: z.number().int().nonnegative(),
    usableRowCount: z.number().int().nonnegative(),
    baselineUsableRowCount: z.number().int().nonnegative(),
    excludedRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    usableMonthCount: z.number().int().nonnegative(),
    baselineMonthCount: z.number().int().nonnegative(),
    releaseUsableRouteCount: z.number().int().nonnegative(),
    releaseFlaggedRouteCount: z.number().int().nonnegative(),
    scoreBasisCounts: z.record(z.string(), z.number().int().nonnegative()),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const releaseMonth = isoMonth(input.options.releaseYear, input.options.releaseMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? ewtScoreVectorArtifactPath(artifactRoot, startMonth, endMonth, releaseMonth)
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 5000");

    let artifact: EwtRouteMonthScoreVectorArtifact;
    try {
      const rows = loadEwtRouteMonthScoreVectorLocalDbRows({
        sqlite,
        startMonth,
        endMonth,
      });
      artifact = buildEwtRouteMonthScoreVectorStudy({
        metadata: {
          startMonth,
          endMonth,
          releaseMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(dbPath),
          artifactPath: repoDisplayPath(outputPath),
          minSampleCount: input.options.minSampleCount,
          fleetFlagQuantile: input.options.fleetFlagQuantile,
        },
        rows: { rows },
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);

    return {
      startMonth,
      endMonth,
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      rawRowCount: artifact.summary.rawRowCount,
      usableRowCount: artifact.summary.usableRowCount,
      baselineUsableRowCount: artifact.summary.baselineUsableRowCount,
      excludedRowCount: artifact.summary.excludedRowCount,
      routeCount: artifact.summary.routeCount,
      usableMonthCount: artifact.summary.usableMonthCount,
      baselineMonthCount: artifact.summary.baselineMonthCount,
      releaseUsableRouteCount: artifact.summary.releaseUsableRouteCount,
      releaseFlaggedRouteCount: artifact.summary.releaseFlaggedRouteCount,
      scoreBasisCounts: artifact.summary.scoreBasisCounts,
    };
  },
});

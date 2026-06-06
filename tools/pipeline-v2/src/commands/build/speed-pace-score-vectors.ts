import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { speedPaceScoreVectorPath } from "@bp/applied-research/artifacts";
import { loadSpeedPaceScoreVectorLocalDbRows } from "@bp/applied-research/local-db";
import { buildSpeedPaceScoreVectorStudy } from "@bp/applied-research/score-vectors";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { speedPaceScoreVectorPath } from "@bp/applied-research/artifacts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["build", "speed-pace-score-vectors"],
  summary: "Build detector-specific historical score vectors for speed_pace_hotspot.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      candidateLimit: arg.positiveInt().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    usableMonthCount: z.number().int().nonnegative(),
    totalFeatureCount: z.number().int().nonnegative(),
    releaseFeatureCount: z.number().int().nonnegative(),
    releaseCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const releaseMonth = endMonth;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? speedPaceScoreVectorPath({ artifactRoot, startMonth, endMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 5000");
      const rows = loadSpeedPaceScoreVectorLocalDbRows({ sqlite, startMonth, endMonth });
      const artifact = buildSpeedPaceScoreVectorStudy({
        rows,
        metadata: {
          startMonth,
          endMonth,
          releaseMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(dbPath),
          artifactPath: repoDisplayPath(outputPath),
          ...(input.options.candidateLimit === undefined
            ? {}
            : { candidateLimit: input.options.candidateLimit }),
        },
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        usableMonthCount: artifact.summary.usableMonthCount,
        totalFeatureCount: artifact.summary.totalFeatureCount,
        releaseFeatureCount: artifact.summary.releaseFeatureCount,
        releaseCandidateCount: artifact.summary.releaseCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

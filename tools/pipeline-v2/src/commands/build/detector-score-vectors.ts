import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { detectorScoreVectorsPath } from "@bp/applied-research/artifacts";
import { loadGenericDetectorScoreVectorLocalDbRows } from "@bp/applied-research/local-db";
import { buildGenericDetectorScoreVectorStudy } from "@bp/applied-research/score-vectors";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export { detectorScoreVectorsPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "detector-score-vectors"],
  summary: "Build generic release score vectors for detector coverage/candidate scopes.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    entryCount: z.number().int().nonnegative(),
    flaggedCount: z.number().int().nonnegative(),
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
        ? detectorScoreVectorsPath({
            artifactRoot,
            startMonth,
            endMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 5000");
    try {
      const rows = loadGenericDetectorScoreVectorLocalDbRows({
        sqlite,
        startMonth,
        endMonth,
      });
      const artifact = buildGenericDetectorScoreVectorStudy({
        metadata: {
          startMonth,
          endMonth,
          releaseMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(dbPath),
          artifactPath: repoDisplayPath(outputPath),
        },
        rows,
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        detectorCount: artifact.summary.detectorCount,
        entryCount: artifact.summary.entryCount,
        flaggedCount: artifact.summary.flaggedCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

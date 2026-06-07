import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { localDbQueryBaselinesArtifactPath } from "@bp/applied-research/artifacts";
import { buildLocalDbHotQueryBaselines } from "@bp/applied-research/local-db";
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

export default defineCommand({
  path: ["audit", "local-db-query-baselines"],
  summary: "Record row-count, runtime, and EXPLAIN baselines for hot local SQLite panel reads.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      observedRunId: z.string().nullable().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    historyStartMonth: z.string(),
    releaseMonth: z.string(),
    outputPath: z.string(),
    queryCount: z.number().int().nonnegative(),
    measuredQueryCount: z.number().int().nonnegative(),
    missingTableQueryCount: z.number().int().nonnegative(),
    artifactBackedQueryCount: z.number().int().nonnegative(),
    errorQueryCount: z.number().int().nonnegative(),
    fullScanWarningCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const historyStartMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const releaseMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? localDbQueryBaselinesArtifactPath({
            artifactRoot,
            historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const artifact = buildLocalDbHotQueryBaselines({
        sqlite,
        historyStartMonth,
        releaseMonth,
        observedRunId: input.options.observedRunId ?? null,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        historyStartMonth,
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        queryCount: artifact.summary.queryCount,
        measuredQueryCount: artifact.summary.measuredQueryCount,
        missingTableQueryCount: artifact.summary.missingTableQueryCount,
        artifactBackedQueryCount: artifact.summary.artifactBackedQueryCount,
        errorQueryCount: artifact.summary.errorQueryCount,
        fullScanWarningCount: artifact.summary.fullScanWarningCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

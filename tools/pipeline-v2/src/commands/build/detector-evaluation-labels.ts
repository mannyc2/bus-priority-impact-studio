import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { detectorEvaluationLabelsPath } from "@bp/applied-research/artifacts";
import { buildDetectorEvaluationLabelSetArtifact } from "@bp/applied-research/evaluation";
import {
  type DetectorEvaluationLabelLocalDbRows,
  loadDetectorEvaluationLabelLocalDbRows,
} from "@bp/applied-research/local-db";
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

export { detectorEvaluationLabelsPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "detector-evaluation-labels"],
  summary: "Build deterministic detector evaluation negative, holdout, and missing-data labels.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z.string().default("2023-04"),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      holdoutModulo: arg.positiveInt().default(5),
      maxCleanNoHitPerDetector: z.number().int().positive().nullable().default(5_000),
      maxMissingDataScopesPerDetector: arg.positiveInt().default(5_000),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    confirmedNegativeCount: z.number().int().nonnegative(),
    holdoutNegativeCount: z.number().int().nonnegative(),
    missingDataScopeCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? detectorEvaluationLabelsPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 5000");
    let rows: DetectorEvaluationLabelLocalDbRows["rows"];
    try {
      ({ rows } = loadDetectorEvaluationLabelLocalDbRows({
        sqlite,
        releaseMonth,
        maxCleanNoHitPerDetector: input.options.maxCleanNoHitPerDetector,
        maxMissingDataScopesPerDetector: input.options.maxMissingDataScopesPerDetector,
      }));
    } finally {
      sqlite.close();
    }
    const artifact = buildDetectorEvaluationLabelSetArtifact({
      rows,
      releaseMonth,
      generatedAt: new Date().toISOString(),
      dbPath: repoDisplayPath(dbPath),
      artifactPath: repoDisplayPath(outputPath),
      holdoutModulo: input.options.holdoutModulo,
      maxCleanNoHitPerDetector: input.options.maxCleanNoHitPerDetector,
      maxMissingDataScopesPerDetector: input.options.maxMissingDataScopesPerDetector,
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      confirmedNegativeCount: artifact.summary.confirmedNegativeCount,
      holdoutNegativeCount: artifact.summary.holdoutNegativeCount,
      missingDataScopeCount: artifact.summary.missingDataScopeCount,
    };
  },
});

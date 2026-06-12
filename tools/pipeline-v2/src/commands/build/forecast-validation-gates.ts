import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  forecastValidationGatesArtifactPath,
  segmentDaypartPanelArtifactPath,
} from "@bp/applied-research/artifacts";
import { buildForecastValidationGatesArtifact } from "@bp/applied-research/forecasting";
import { loadSegmentDaypartHistoryLocalDbRows } from "@bp/applied-research/local-db";
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

export { forecastValidationGatesArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "forecast-validation-gates"],
  summary: "Build compact validation gates for continuous segment travel-time forecasting.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      minObservationCount: arg.positiveInt().default(10),
      minTrainingMonths: arg.positiveInt().default(12),
      trailingTrainingMonths: arg.positiveInt().default(12),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    forecastCount: z.number().int().nonnegative(),
    validationMonthCount: z.number().int().nonnegative(),
    releaseMonthForecastCount: z.number().int().nonnegative(),
    gateStatuses: z.record(z.string(), z.string()),
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
        ? forecastValidationGatesArtifactPath({
            artifactRoot,
            historyStartMonth: startMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 5000");
      const rows = loadSegmentDaypartHistoryLocalDbRows({ sqlite, startMonth, endMonth });
      const artifact = buildForecastValidationGatesArtifact({
        rows,
        startMonth,
        endMonth,
        releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        sourcePanelPath: repoDisplayPath(
          segmentDaypartPanelArtifactPath({ artifactRoot, startMonth, releaseMonth }),
        ),
        minObservationCount: input.options.minObservationCount,
        minTrainingMonths: input.options.minTrainingMonths,
        trailingTrainingMonths: input.options.trailingTrainingMonths,
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        forecastCount: artifact.summary.forecastCount,
        validationMonthCount: artifact.summary.validationMonthCount,
        releaseMonthForecastCount: artifact.summary.releaseMonthForecastCount,
        gateStatuses: Object.fromEntries(
          artifact.gates.map((gate) => [gate.gateId, gate.status]),
        ),
      };
    } finally {
      sqlite.close();
    }
  },
});

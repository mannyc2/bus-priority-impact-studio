import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { analyticsCorpusProfilePath } from "@bp/applied-research/artifacts";
import {
  type AnalyticsCorpusProfileArtifact,
  buildAnalyticsCorpusProfile,
} from "@bp/applied-research/evaluation";
import { loadAnalyticsCorpusProfileLocalDbRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export default defineCommand({
  path: ["audit", "analytics-corpus-profile"],
  summary: "Profile historical analytics corpus coverage for detector design and calibration.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      historyStartMonth: z
        .string()
        .default("2023-04")
        .describe("Start month for historical detector-learning window"),
      minHistoricalMonths: arg
        .positiveInt()
        .default(12)
        .describe("Minimum prior months for historical-ready source status"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for profile JSON"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    historyStartMonth: z.string(),
    outputPath: z.string(),
    sourceCount: z.number().int().nonnegative(),
    historicalReadySourceCount: z.number().int().nonnegative(),
    releaseOnlySourceCount: z.number().int().nonnegative(),
    sparseSourceCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? analyticsCorpusProfilePath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let profile: AnalyticsCorpusProfileArtifact;
    try {
      const observations = loadAnalyticsCorpusProfileLocalDbRows({ sqlite });
      profile = buildAnalyticsCorpusProfile({
        releaseMonth,
        historyStartMonth: input.options.historyStartMonth,
        observations,
        minHistoricalMonths: input.options.minHistoricalMonths,
        generatedAt: new Date().toISOString(),
        dbPath,
        artifactPath: outputPath,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, profile);

    return {
      releaseMonth,
      historyStartMonth: input.options.historyStartMonth,
      outputPath,
      sourceCount: profile.summary.sourceCount,
      historicalReadySourceCount: profile.summary.historicalReadySourceCount,
      releaseOnlySourceCount: profile.summary.releaseOnlySourceCount,
      sparseSourceCount: profile.summary.sparseSourceCount,
    };
  },
});

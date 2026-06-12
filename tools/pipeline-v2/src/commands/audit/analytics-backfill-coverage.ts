import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { analyticsBackfillCoveragePath as appliedAnalyticsBackfillCoveragePath } from "@bp/applied-research/artifacts";
import {
  type AnalyticsBackfillCoverageAudit,
  buildAnalyticsBackfillCoverageAudit as buildAppliedAnalyticsBackfillCoverageAudit,
} from "@bp/applied-research/evaluation";
import { loadAnalyticsBackfillCoverageLocalDbRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export { analyticsBackfillCoveragePath } from "@bp/applied-research/artifacts";
export type {
  AnalyticsBackfillCoverageAudit,
  BackfillSurfaceId,
  SurfaceCoverageSummary,
  SurfaceMonthCoverage,
} from "@bp/applied-research/evaluation";
export { buildAnalyticsBackfillCoverageAudit } from "@bp/applied-research/evaluation";

export default defineCommand({
  path: ["audit", "analytics-backfill-coverage"],
  summary: "Audit historical coverage for release-only analytics backfill surfaces.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(4).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for coverage JSON"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    outputPath: z.string(),
    surfaceCount: z.number().int().nonnegative(),
    totalExpectedSurfaceMonths: z.number().int().nonnegative(),
    presentSurfaceMonths: z.number().int().nonnegative(),
    thinSurfaceMonths: z.number().int().nonnegative(),
    missingSurfaceMonths: z.number().int().nonnegative(),
    readySurfaceCount: z.number().int().nonnegative(),
    blockedSurfaceCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? appliedAnalyticsBackfillCoveragePath({ artifactRoot, startMonth, endMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let audit: AnalyticsBackfillCoverageAudit;
    try {
      const surfaceRows = loadAnalyticsBackfillCoverageLocalDbRows({
        sqlite,
        startMonth,
        endMonth,
      });
      audit = buildAppliedAnalyticsBackfillCoverageAudit({
        surfaceRows,
        startMonth,
        endMonth,
        generatedAt: new Date().toISOString(),
        dbPath,
        artifactPath: outputPath,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, audit);

    return {
      startMonth,
      endMonth,
      outputPath,
      surfaceCount: audit.summary.surfaceCount,
      totalExpectedSurfaceMonths: audit.summary.totalExpectedSurfaceMonths,
      presentSurfaceMonths: audit.summary.presentSurfaceMonths,
      thinSurfaceMonths: audit.summary.thinSurfaceMonths,
      missingSurfaceMonths: audit.summary.missingSurfaceMonths,
      readySurfaceCount: audit.summary.readySurfaceCount,
      blockedSurfaceCount: audit.summary.blockedSurfaceCount,
    };
  },
});

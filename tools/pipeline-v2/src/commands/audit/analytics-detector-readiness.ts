import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  analyticsBackfillCoveragePath,
  analyticsDetectorReadinessPath,
} from "@bp/applied-research/artifacts";
import {
  type AnalyticsDetectorReadinessAudit,
  buildAnalyticsBackfillCoverageAudit,
  buildAnalyticsDetectorReadinessAudit,
} from "@bp/applied-research/evaluation";
import {
  loadAnalyticsBackfillCoverageLocalDbRows,
  loadAnalyticsDetectorReadinessDirectSurfaceCoverage,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { analyticsDetectorReadinessPath } from "@bp/applied-research/artifacts";
export type {
  AnalyticsDetectorReadinessAudit,
  DetectorReadinessStatus,
  DetectorReadinessSummary,
  DetectorSurfaceReadiness,
  PolicySurfaceCoverageSummary,
} from "@bp/applied-research/evaluation";
export { buildAnalyticsDetectorReadinessAudit } from "@bp/applied-research/evaluation";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["audit", "analytics-detector-readiness"],
  summary: "Join analytics backfill coverage to detector calibration policies.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(4).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for readiness JSON"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    outputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    readyDetectorCount: z.number().int().nonnegative(),
    partialDetectorCount: z.number().int().nonnegative(),
    blockedDetectorCount: z.number().int().nonnegative(),
    policyPendingDetectorCount: z.number().int().nonnegative(),
    readyRequiredSurfaceCount: z.number().int().nonnegative(),
    partialRequiredSurfaceCount: z.number().int().nonnegative(),
    blockedRequiredSurfaceCount: z.number().int().nonnegative(),
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
        ? analyticsDetectorReadinessPath({ artifactRoot, startMonth, endMonth })
        : fromCliPath(input.options.output);
    const coverageArtifactPath = analyticsBackfillCoveragePath({
      artifactRoot,
      startMonth,
      endMonth,
    });
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 5000");

    let audit: AnalyticsDetectorReadinessAudit;
    try {
      const generatedAt = new Date().toISOString();
      const backfillCoverage = buildAnalyticsBackfillCoverageAudit({
        surfaceRows: loadAnalyticsBackfillCoverageLocalDbRows({
          sqlite,
          startMonth,
          endMonth,
        }),
        startMonth,
        endMonth,
        generatedAt,
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(coverageArtifactPath),
      });
      audit = buildAnalyticsDetectorReadinessAudit({
        backfillCoverage,
        directSurfaceCoverage: loadAnalyticsDetectorReadinessDirectSurfaceCoverage({
          sqlite,
          backfillCoverage,
        }),
        generatedAt,
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        coverageArtifactPath: repoDisplayPath(coverageArtifactPath),
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, audit);

    return {
      startMonth,
      endMonth,
      outputPath: repoDisplayPath(outputPath),
      detectorCount: audit.summary.detectorCount,
      readyDetectorCount: audit.summary.readyDetectorCount,
      partialDetectorCount: audit.summary.partialDetectorCount,
      blockedDetectorCount: audit.summary.blockedDetectorCount,
      policyPendingDetectorCount: audit.summary.policyPendingDetectorCount,
      readyRequiredSurfaceCount: audit.summary.readyRequiredSurfaceCount,
      partialRequiredSurfaceCount: audit.summary.partialRequiredSurfaceCount,
      blockedRequiredSurfaceCount: audit.summary.blockedRequiredSurfaceCount,
    };
  },
});

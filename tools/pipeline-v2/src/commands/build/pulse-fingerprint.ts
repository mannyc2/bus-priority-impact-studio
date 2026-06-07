import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { pulseFingerprintArtifactPath } from "@bp/applied-research/artifacts";
import {
  buildPulseFingerprintArtifactV1,
  ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
} from "@bp/applied-research/feature-resolvers";
import { loadPulseFingerprintLocalDbRows } from "@bp/applied-research/local-db";
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

export { pulseFingerprintArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "pulse-fingerprint"],
  summary: "Build internal-lab route-direction hour-of-week pulse fingerprints.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      minCellHistoryMonths: arg.positiveInt().default(12),
      minReleaseTripCount: arg.positiveInt().default(20),
      routeId: z.string().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    supportedPulseRowCount: z.number().int().nonnegative(),
    publicClaimAllowedCount: z.literal(0),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? pulseFingerprintArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      const rows = loadPulseFingerprintLocalDbRows({
        sqlite,
        historyStartMonth: input.options.historyStartMonth,
        releaseMonth,
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
      });
      const artifact = buildPulseFingerprintArtifactV1({
        ...rows,
        generatedAt: new Date().toISOString(),
        artifactPath: repoDisplayPath(outputPath),
        spec: {
          panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
          historyStartMonth: input.options.historyStartMonth,
          releaseMonth,
          minCellHistoryMonths: input.options.minCellHistoryMonths,
          minReleaseTripCount: input.options.minReleaseTripCount,
          ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
        },
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        panelRowCount: artifact.summary.panelRowCount,
        routeCount: artifact.summary.routeCount,
        supportedPulseRowCount: artifact.summary.supportedPulseRowCount,
        publicClaimAllowedCount: artifact.summary.publicClaimAllowedCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

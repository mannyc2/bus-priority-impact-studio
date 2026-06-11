import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  loadStopDirectionHourFeaturesFromArtifacts,
  reliabilityExposurePanelArtifactPath,
} from "@bp/applied-research/artifacts";
import { buildReliabilityExposurePanelArtifactV1 } from "@bp/applied-research/feature-resolvers";
import { loadReliabilityExposurePanelRidershipRows } from "@bp/applied-research/local-db";
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

export { reliabilityExposurePanelArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "reliability-exposure-panel"],
  summary: "Build reliability exposure panel from stop-hour EWT and route-hour ridership.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      runId: z.string().optional(),
      routeId: z.string().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    runId: z.string(),
    outputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    supportedRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    rowWithRidershipCount: z.number().int().nonnegative(),
    rowWithExcessWaitCount: z.number().int().nonnegative(),
    rowWithRiderDelayCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const runId = input.options.runId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? reliabilityExposurePanelArtifactPath({ artifactRoot, releaseMonth, runId })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      const stopFeatures = await loadStopDirectionHourFeaturesFromArtifacts({
        artifactRoot,
        month: releaseMonth,
        runId,
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
      });
      const ridershipRows = loadReliabilityExposurePanelRidershipRows({
        sqlite,
        month: releaseMonth,
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
      });
      const artifact = buildReliabilityExposurePanelArtifactV1({
        stopFeatures: stopFeatures.features,
        ridershipRows,
        spec: {
          panelId: "reliability_exposure_panel_v1",
          releaseMonth,
          runId,
          ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
        },
        generatedAt: new Date().toISOString(),
        artifactPath: repoDisplayPath(outputPath),
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        runId,
        outputPath: repoDisplayPath(outputPath),
        panelRowCount: artifact.summary.panelRowCount,
        supportedRowCount: artifact.summary.supportedRowCount,
        routeCount: artifact.summary.routeCount,
        rowWithRidershipCount: artifact.summary.rowWithRidershipCount,
        rowWithExcessWaitCount: artifact.summary.rowWithExcessWaitCount,
        rowWithRiderDelayCount: artifact.summary.rowWithRiderDelayCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { segmentDaypartPanelArtifactPath } from "@bp/applied-research/artifacts";
import { buildSegmentDaypartPanelArtifact } from "@bp/applied-research/feature-history";
import { SEGMENT_DAYPART_PANEL_V1_ID } from "@bp/applied-research/feature-resolvers";
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

export { segmentDaypartPanelArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "segment-daypart-panel"],
  summary: "Build the applied-research segment/daypart/month panel artifact.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      minObservationCount: arg.positiveInt().default(10),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    eligiblePanelRowCount: z.number().int().nonnegative(),
    releaseMonthRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    monthCount: z.number().int().nonnegative(),
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
        ? segmentDaypartPanelArtifactPath({ artifactRoot, startMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 5000");
      const rows = loadSegmentDaypartHistoryLocalDbRows({ sqlite, startMonth, endMonth });
      const artifact = buildSegmentDaypartPanelArtifact({
        rows,
        spec: {
          panelId: SEGMENT_DAYPART_PANEL_V1_ID,
          startMonth,
          endMonth,
          minObservationCount: input.options.minObservationCount,
        },
        releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        panelRowCount: artifact.summary.panelRowCount,
        eligiblePanelRowCount: artifact.summary.eligiblePanelRowCount,
        releaseMonthRowCount: artifact.summary.releaseMonthRowCount,
        routeCount: artifact.summary.routeCount,
        monthCount: artifact.window.monthCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

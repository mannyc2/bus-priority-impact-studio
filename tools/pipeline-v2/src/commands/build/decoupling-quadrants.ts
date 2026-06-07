import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { decouplingQuadrantsArtifactPath } from "@bp/applied-research/artifacts";
import {
  buildDecouplingQuadrantsArtifactV1,
  ROUTE_DECOUPLING_PANEL_V1_ID,
} from "@bp/applied-research/feature-resolvers";
import { loadDecouplingQuadrantsLocalDbRows } from "@bp/applied-research/local-db";
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

export { decouplingQuadrantsArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "decoupling-quadrants"],
  summary: "Build internal-lab route decoupling quadrants from speed, ridership, and reliability.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      observedRunId: z.string().optional(),
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
    supportedSpeedRidershipRowCount: z.number().int().nonnegative(),
    supportedReliabilityRowCount: z.number().int().nonnegative(),
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
        ? decouplingQuadrantsArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      const rows = loadDecouplingQuadrantsLocalDbRows({
        sqlite,
        historyStartMonth: input.options.historyStartMonth,
        releaseMonth,
        ...(input.options.observedRunId === undefined
          ? {}
          : { observedRunId: input.options.observedRunId }),
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
      });
      const artifact = buildDecouplingQuadrantsArtifactV1({
        ...rows,
        generatedAt: new Date().toISOString(),
        artifactPath: repoDisplayPath(outputPath),
        spec: {
          panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
          historyStartMonth: input.options.historyStartMonth,
          releaseMonth,
          minHistoryMonths: 12,
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
        supportedSpeedRidershipRowCount: artifact.summary.supportedSpeedRidershipRowCount,
        supportedReliabilityRowCount: artifact.summary.supportedReliabilityRowCount,
        publicClaimAllowedCount: artifact.summary.publicClaimAllowedCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

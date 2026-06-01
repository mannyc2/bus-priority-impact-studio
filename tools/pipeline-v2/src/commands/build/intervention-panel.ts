import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type InterventionComparisonRow = {
  route_id: string;
  month: string;
  event_id: string;
  intervention_type: string;
  source_id: string;
  evaluation_level: string;
  comparison_status: string;
  pre_start_month: string | null;
  pre_end_month: string | null;
  post_start_month: string | null;
  post_end_month: string | null;
  comparison_route_count: number;
  comparison_route_ids: string | null;
  speed_delta_mph: number | null;
  adjusted_speed_delta_mph: number | null;
  ridership_delta: number | null;
  adjusted_ridership_delta: number | null;
  caveat: string;
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function outputPath(input: { artifactRoot: string; startMonth: string; endMonth: string }): string {
  return join(
    input.artifactRoot,
    "analytics-feature-history",
    `${input.startMonth}_to_${input.endMonth}`,
    "intervention-panel.json",
  );
}

export default defineCommand({
  path: ["build", "intervention-panel"],
  summary: "Build intervention association panel feature artifact.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    outputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const path =
      input.options.output === undefined
        ? outputPath({ artifactRoot, startMonth, endMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      const rows = sqlite
        .query(
          `
            SELECT
              route_id,
              month,
              event_id,
              intervention_type,
              source_id,
              evaluation_level,
              comparison_status,
              pre_start_month,
              pre_end_month,
              post_start_month,
              post_end_month,
              comparison_route_count,
              comparison_route_ids,
              speed_delta_mph,
              adjusted_speed_delta_mph,
              ridership_delta,
              adjusted_ridership_delta,
              caveat
            FROM local_route_intervention_comparison
            WHERE month >= ? AND month <= ?
            ORDER BY month, route_id, event_id
          `,
        )
        .all(startMonth, endMonth) as InterventionComparisonRow[];
      const routeIds = new Set(rows.map((row) => row.route_id));
      const eventIds = new Set(rows.map((row) => row.event_id));
      const artifact = {
        artifactKind: "intervention_panel",
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(path),
        window: { startMonth, endMonth },
        summary: {
          panelRowCount: rows.length,
          routeCount: routeIds.size,
          eventCount: eventIds.size,
          claimStrength: "associational_screening_only",
        },
        panels: rows.map((row) => ({
          eventId: row.event_id,
          routeId: row.route_id,
          month: row.month,
          interventionType: row.intervention_type,
          sourceId: row.source_id,
          evaluationLevel: row.evaluation_level,
          comparisonStatus: row.comparison_status,
          preWindow: { startMonth: row.pre_start_month, endMonth: row.pre_end_month },
          postWindow: { startMonth: row.post_start_month, endMonth: row.post_end_month },
          comparisonRouteCount: row.comparison_route_count,
          comparisonRouteIds:
            row.comparison_route_ids === null || row.comparison_route_ids.length === 0
              ? []
              : row.comparison_route_ids.split(",").map((id) => id.trim()).filter(Boolean),
          speedDeltaMph: row.speed_delta_mph,
          adjustedSpeedDeltaMph: row.adjusted_speed_delta_mph,
          ridershipDelta: row.ridership_delta,
          adjustedRidershipDelta: row.adjusted_ridership_delta,
          caveat: row.caveat,
        })),
      };
      await mkdir(dirname(path), { recursive: true });
      await writeJson(path, artifact);
      return {
        startMonth,
        endMonth,
        outputPath: repoDisplayPath(path),
        panelRowCount: rows.length,
        routeCount: routeIds.size,
        eventCount: eventIds.size,
      };
    } finally {
      sqlite.close();
    }
  },
});

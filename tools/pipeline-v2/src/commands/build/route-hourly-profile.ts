import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type RouteMonthProfileRow = {
  route_id: string;
  month: string;
  hourly_row_count: number;
  total_ridership: number;
  total_transfers: number;
  peak_day_of_week: string | null;
  peak_hour_of_day: number | null;
  peak_ridership: number | null;
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
    "route-hourly-profile.json",
  );
}

export default defineCommand({
  path: ["build", "route-hourly-profile"],
  summary: "Build compact route-hourly ridership profile feature artifact.",
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
    profileCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    monthCount: z.number().int().nonnegative(),
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
            WITH ranked AS (
              SELECT
                route_id,
                month,
                day_of_week,
                hour_of_day,
                ridership,
                ROW_NUMBER() OVER (
                  PARTITION BY route_id, month
                  ORDER BY ridership DESC, transfers DESC, day_of_week, hour_of_day
                ) AS ridership_rank
              FROM local_route_hourly_ridership
              WHERE month >= ? AND month <= ?
            ),
            totals AS (
              SELECT
                route_id,
                month,
                COUNT(*) AS hourly_row_count,
                SUM(ridership) AS total_ridership,
                SUM(transfers) AS total_transfers
              FROM local_route_hourly_ridership
              WHERE month >= ? AND month <= ?
              GROUP BY route_id, month
            )
            SELECT
              totals.route_id,
              totals.month,
              totals.hourly_row_count,
              totals.total_ridership,
              totals.total_transfers,
              ranked.day_of_week AS peak_day_of_week,
              ranked.hour_of_day AS peak_hour_of_day,
              ranked.ridership AS peak_ridership
            FROM totals
            LEFT JOIN ranked
              ON ranked.route_id = totals.route_id
             AND ranked.month = totals.month
             AND ranked.ridership_rank = 1
            ORDER BY totals.month, totals.route_id
          `,
        )
        .all(startMonth, endMonth, startMonth, endMonth) as RouteMonthProfileRow[];
      const routeIds = new Set(rows.map((row) => row.route_id));
      const months = new Set(rows.map((row) => row.month));
      const artifact = {
        artifactKind: "route_hourly_profile",
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(path),
        window: { startMonth, endMonth, monthCount: months.size },
        summary: {
          profileCount: rows.length,
          routeCount: routeIds.size,
          grain: "route_month_compact_hourly_profile",
          sourceGrain: "route_month_day_of_week_hour",
        },
        profiles: rows.map((row) => ({
          routeId: row.route_id,
          month: row.month,
          hourlyRowCount: row.hourly_row_count,
          totalRidership: row.total_ridership,
          totalTransfers: row.total_transfers,
          peakWindow:
            row.peak_day_of_week === null || row.peak_hour_of_day === null
              ? null
              : {
                  dayOfWeek: row.peak_day_of_week,
                  hourOfDay: row.peak_hour_of_day,
                  ridership: row.peak_ridership,
                },
        })),
      };
      await mkdir(dirname(path), { recursive: true });
      await writeJson(path, artifact);
      return {
        startMonth,
        endMonth,
        outputPath: repoDisplayPath(path),
        profileCount: rows.length,
        routeCount: routeIds.size,
        monthCount: months.size,
      };
    } finally {
      sqlite.close();
    }
  },
});

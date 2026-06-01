import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type SegmentDaypartRow = {
  route_id: string;
  month: string;
  segment_id: string;
  direction: string;
  daypart: string;
  observation_count: number;
  traversal_count: number;
  average_speed_mph: number | null;
  average_travel_time_minutes: number | null;
  average_road_distance_miles: number | null;
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function featureHistoryPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
  fileName: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-feature-history",
    `${input.startMonth}_to_${input.endMonth}`,
    input.fileName,
  );
}

export default defineCommand({
  path: ["build", "segment-daypart-history"],
  summary: "Build compact segment/daypart speed-history feature artifact.",
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
    featureCount: z.number().int().nonnegative(),
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
    const outputPath =
      input.options.output === undefined
        ? featureHistoryPath({ artifactRoot, startMonth, endMonth, fileName: "segment-daypart-history.json" })
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
              route_id || ':' || direction || ':' || stop_order || ':' || timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
              direction,
              CASE
                WHEN hour_of_day BETWEEN 6 AND 9 THEN 'am_peak'
                WHEN hour_of_day BETWEEN 10 AND 15 THEN 'midday'
                WHEN hour_of_day BETWEEN 16 AND 19 THEN 'pm_peak'
                ELSE 'off_peak'
              END AS daypart,
              COUNT(*) AS observation_count,
              SUM(bus_trip_count) AS traversal_count,
              AVG(average_road_speed_mph) AS average_speed_mph,
              AVG(average_travel_time_minutes) AS average_travel_time_minutes,
              AVG(road_distance_miles) AS average_road_distance_miles
            FROM local_route_segment_speed
            WHERE month >= ? AND month <= ?
            GROUP BY route_id, month, segment_id, direction, daypart
            ORDER BY month, route_id, direction, segment_id, daypart
          `,
        )
        .all(startMonth, endMonth) as SegmentDaypartRow[];
      const routeIds = new Set(rows.map((row) => row.route_id));
      const months = new Set(rows.map((row) => row.month));
      const artifact = {
        artifactKind: "segment_daypart_history",
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        window: { startMonth, endMonth, monthCount: months.size },
        summary: {
          featureCount: rows.length,
          routeCount: routeIds.size,
          dayparts: ["am_peak", "midday", "pm_peak", "off_peak"],
          aggregationNote:
            "Speed and travel-time values are deterministic daypart means over source observations; detector-specific robust baselines can be derived from the persisted local table.",
        },
        features: rows.map((row) => ({
          routeId: row.route_id,
          month: row.month,
          segmentId: row.segment_id,
          direction: row.direction,
          daypart: row.daypart,
          observationCount: row.observation_count,
          traversalCount: row.traversal_count,
          averageSpeedMph: row.average_speed_mph,
          averageTravelTimeMinutes: row.average_travel_time_minutes,
          averageRoadDistanceMiles: row.average_road_distance_miles,
        })),
      };
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        startMonth,
        endMonth,
        outputPath: repoDisplayPath(outputPath),
        featureCount: rows.length,
        routeCount: routeIds.size,
        monthCount: months.size,
      };
    } finally {
      sqlite.close();
    }
  },
});

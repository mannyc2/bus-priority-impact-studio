import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type ProjectedSpeedRow = {
  route_id: string;
  month: string;
  observation_count: number;
  bus_trip_count: number;
  average_speed_mph: number | null;
};

type TrendSpeedRow = {
  route_id: string;
  month: string;
  speed_observation_count: number;
  speed_bus_trip_count: number;
  average_speed_mph: number | null;
};

type Mismatch = {
  routeId: string;
  month: string;
  field: "observationCount" | "busTripCount" | "averageSpeedMph";
  trend: number | null;
  projected: number | null;
};

// Must match the rounding route-trends applies before persisting average_speed_mph.
function roundSpeed(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

const MISMATCH_SAMPLE_LIMIT = 100;

export default defineCommand({
  path: ["build", "route-month-speed-golden-diff"],
  summary:
    "Project route-month speed aggregates from local_route_segment_speed_cell and byte-compare them against local_route_month_trend.",
  input: {
    options: dbOptions.extend({
      output: z.string().optional().describe("Artifact output path (JSON)"),
    }),
  },
  output: z.object({
    comparedRowCount: z.number().int().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    trendOnlyRowCount: z.number().int().nonnegative(),
    cellOnlyRowCount: z.number().int().nonnegative(),
    byteIdentical: z.boolean(),
    outputPath: z.string(),
  }),
  async run({ input }) {
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const outputPath =
      input.options.output === undefined
        ? join(defaultArtifactRootPath(), "route-month-speed-golden-diff.json")
        : fromCliPath(input.options.output);

    const sqlite = new BunDatabase(dbPath, { readonly: true });
    let projected: ProjectedSpeedRow[];
    let trend: TrendSpeedRow[];
    try {
      projected = sqlite
        .query(
          `SELECT route_id, month,
                  COUNT(*) AS observation_count,
                  SUM(bus_trip_count) AS bus_trip_count,
                  AVG(average_road_speed_mph) AS average_speed_mph
           FROM local_route_segment_speed_cell
           GROUP BY route_id, month`,
        )
        .all() as ProjectedSpeedRow[];
      trend = sqlite
        .query(
          `SELECT route_id, month, speed_observation_count, speed_bus_trip_count, average_speed_mph
           FROM local_route_month_trend
           WHERE has_speed_trend = 1`,
        )
        .all() as TrendSpeedRow[];
    } finally {
      sqlite.close();
    }

    const projectedByKey = new Map(projected.map((row) => [`${row.route_id}|${row.month}`, row]));
    const cellMonths = new Set(projected.map((row) => row.month));
    const trendKeys = new Set<string>();

    const mismatches: Mismatch[] = [];
    let comparedRowCount = 0;
    let matchCount = 0;
    let trendOnlyRowCount = 0;
    for (const trendRow of trend) {
      if (!cellMonths.has(trendRow.month)) continue;
      const key = `${trendRow.route_id}|${trendRow.month}`;
      trendKeys.add(key);
      const projectedRow = projectedByKey.get(key);
      if (projectedRow === undefined) {
        trendOnlyRowCount += 1;
        continue;
      }
      comparedRowCount += 1;
      const fields: readonly [Mismatch["field"], number | null, number | null][] = [
        ["observationCount", trendRow.speed_observation_count, projectedRow.observation_count],
        ["busTripCount", trendRow.speed_bus_trip_count, projectedRow.bus_trip_count],
        ["averageSpeedMph", trendRow.average_speed_mph, roundSpeed(projectedRow.average_speed_mph)],
      ];
      const rowMismatches = fields.filter(([, expected, actual]) => expected !== actual);
      if (rowMismatches.length === 0) {
        matchCount += 1;
        continue;
      }
      for (const [field, expected, actual] of rowMismatches) {
        mismatches.push({
          routeId: trendRow.route_id,
          month: trendRow.month,
          field,
          trend: expected,
          projected: actual,
        });
      }
    }

    const cellOnlyRowCount = projected.filter(
      (row) => !trendKeys.has(`${row.route_id}|${row.month}`),
    ).length;
    const byteIdentical =
      mismatches.length === 0 && trendOnlyRowCount === 0 && comparedRowCount > 0;

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, {
      generatedAt: new Date().toISOString(),
      dbPath: repoDisplayPath(dbPath),
      comparedRowCount,
      matchCount,
      mismatchCount: mismatches.length,
      trendOnlyRowCount,
      cellOnlyRowCount,
      byteIdentical,
      mismatchSample: mismatches.slice(0, MISMATCH_SAMPLE_LIMIT),
    });

    return {
      comparedRowCount,
      matchCount,
      mismatchCount: mismatches.length,
      trendOnlyRowCount,
      cellOnlyRowCount,
      byteIdentical,
      outputPath: repoDisplayPath(outputPath),
    };
  },
});

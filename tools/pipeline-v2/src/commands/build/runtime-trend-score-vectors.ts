import { Database as BunDatabase, type Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  buildRuntimeTrendScoreVectorArtifact as buildRuntimeTrendScoreVectorArtifactFromRows,
  type RuntimeTrendScoreVectorArtifact,
} from "@bp/applied-research/score-vectors";
import type {
  ObservedRuntimeSourceRow,
  RouteMetricHistorySourceRow,
  ScheduledRuntimeSourceRow,
} from "@bp/applied-research/feature-resolvers";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type ScheduledRuntimeRow = ScheduledRuntimeSourceRow;
type ObservedRuntimeRow = ObservedRuntimeSourceRow;
type RouteMetricHistoryRow = RouteMetricHistorySourceRow;
export type { RuntimeTrendScoreVectorArtifact } from "@bp/applied-research/score-vectors";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function queryMonths(sqlite: Database, startMonth: string, endMonth: string): string[] {
  const rows = sqlite
    .query(
      `
        SELECT DISTINCT month
        FROM local_route_segment_speed
        WHERE month >= ? AND month <= ?
        ORDER BY month
      `,
    )
    .all(startMonth, endMonth) as Array<{ month?: unknown }>;
  return rows.map((row) => text(row.month)).filter((month): month is string => month !== null);
}

function queryObservedRuntimeRows(sqlite: Database, month: string): ObservedRuntimeRow[] {
  return sqlite
    .query(
      `
        SELECT
          route_id,
          month,
          direction,
          CASE
            WHEN hour_of_day BETWEEN 6 AND 9 THEN 'am_peak'
            WHEN hour_of_day BETWEEN 10 AND 15 THEN 'midday'
            WHEN hour_of_day BETWEEN 16 AND 19 THEN 'pm_peak'
            ELSE 'off_peak'
          END AS daypart,
          timestamp,
          SUM(average_travel_time_minutes) AS runtime_minutes,
          SUM(bus_trip_count) AS observed_trip_count
        FROM local_route_segment_speed
        WHERE month = ?
        GROUP BY route_id, month, direction, daypart, timestamp
        HAVING runtime_minutes > 0
        ORDER BY route_id, direction, daypart, timestamp
      `,
    )
    .all(month) as ObservedRuntimeRow[];
}

function queryScheduledRuntimeRows(sqlite: Database, sourceYear: number): ScheduledRuntimeRow[] {
  return sqlite
    .query(
      `
        WITH trips AS (
          SELECT
            route_id,
            direction,
            day_type,
            block_id,
            shape_id,
            schedule_date,
            trip_headsign,
            MIN(CASE WHEN origin = 1 THEN schedule_time END) AS start_time,
            MAX(CASE WHEN destination = 1 THEN schedule_time END) AS end_time
          FROM local_route_schedule_stop
          WHERE source_year = ?
            AND (origin = 1 OR destination = 1)
          GROUP BY route_id, direction, day_type, block_id, shape_id, schedule_date, trip_headsign
        )
        SELECT
          route_id,
          direction,
          CASE
            WHEN CAST(strftime('%H', start_time) AS INTEGER) BETWEEN 6 AND 9 THEN 'am_peak'
            WHEN CAST(strftime('%H', start_time) AS INTEGER) BETWEEN 10 AND 15 THEN 'midday'
            WHEN CAST(strftime('%H', start_time) AS INTEGER) BETWEEN 16 AND 19 THEN 'pm_peak'
            ELSE 'off_peak'
          END AS daypart,
          (CAST(strftime('%s', end_time) AS REAL) - CAST(strftime('%s', start_time) AS REAL)) / 60.0
            AS runtime_minutes
        FROM trips
        WHERE start_time IS NOT NULL
          AND end_time IS NOT NULL
          AND runtime_minutes BETWEEN 1 AND 300
        ORDER BY route_id, direction, daypart
      `,
    )
    .all(sourceYear) as ScheduledRuntimeRow[];
}

function queryRouteMetricHistoryRows(
  sqlite: Database,
  startMonth: string,
  endMonth: string,
): RouteMetricHistoryRow[] {
  return sqlite
    .query(
      `
        SELECT route_id, month, speed_observation_count, average_speed_mph
        FROM local_route_month_trend
        WHERE month >= ?
          AND month <= ?
        ORDER BY route_id, month
      `,
    )
    .all(startMonth, endMonth) as RouteMetricHistoryRow[];
}

export function runtimeTrendScoreVectorPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "runtime-trend-score-vectors",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "runtime-trend-score-vectors.json",
  );
}

export function buildRuntimeTrendScoreVectorArtifact(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  candidateLimit?: number;
}): RuntimeTrendScoreVectorArtifact {
  const months = queryMonths(input.sqlite, input.startMonth, input.endMonth);
  const scheduleByYear = new Map<number, ScheduledRuntimeRow[]>();
  const observedRowsByMonth = new Map<string, ObservedRuntimeRow[]>();
  for (const month of months) {
    const year = Number(month.slice(0, 4));
    if (!scheduleByYear.has(year)) {
      scheduleByYear.set(year, queryScheduledRuntimeRows(input.sqlite, year));
    }
    observedRowsByMonth.set(month, queryObservedRuntimeRows(input.sqlite, month));
  }
  return buildRuntimeTrendScoreVectorArtifactFromRows({
    months,
    scheduledRowsByYear: scheduleByYear,
    observedRowsByMonth,
    routeMetricHistoryRows: queryRouteMetricHistoryRows(
      input.sqlite,
      input.startMonth,
      input.endMonth,
    ),
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    releaseMonth: input.releaseMonth,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    ...(input.candidateLimit === undefined ? {} : { candidateLimit: input.candidateLimit }),
  });
}

export default defineCommand({
  path: ["build", "runtime-trend-score-vectors"],
  summary:
    "Build detector-specific historical score vectors for schedule mismatch, runtime variability, and degradation trend.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      candidateLimit: arg.positiveInt().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    usableMonthCount: z.number().int().nonnegative(),
    releaseFeatureCount: z.number().int().nonnegative(),
    releaseCandidateCount: z.number().int().nonnegative(),
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
        ? runtimeTrendScoreVectorPath({ artifactRoot, startMonth, endMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const artifact = buildRuntimeTrendScoreVectorArtifact({
        sqlite,
        startMonth,
        endMonth,
        releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        ...(input.options.candidateLimit === undefined
          ? {}
          : { candidateLimit: input.options.candidateLimit }),
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        detectorCount: artifact.summary.detectorCount,
        usableMonthCount: artifact.summary.usableMonthCount,
        releaseFeatureCount: artifact.summary.releaseFeatureCount,
        releaseCandidateCount: artifact.summary.releaseCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

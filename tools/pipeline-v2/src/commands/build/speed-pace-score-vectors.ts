import { Database as BunDatabase, type Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  buildSpeedPaceScoreVectorArtifact,
  type SegmentDaypartSpeedSourceRow,
} from "@bp/applied-research/score-vectors";
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

function queryRowsForMonth(sqlite: Database, month: string): SegmentDaypartSpeedSourceRow[] {
  return sqlite
    .query(
      `
        SELECT
          route_id,
          month,
          hour_of_day,
          direction,
          stop_order,
          timepoint_stop_id,
          next_timepoint_stop_id,
          road_distance_miles,
          average_travel_time_minutes,
          average_road_speed_mph,
          bus_trip_count
        FROM local_route_segment_speed
        WHERE month = ?
        ORDER BY route_id, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id, hour_of_day
      `,
    )
    .all(month) as SegmentDaypartSpeedSourceRow[];
}

export function speedPaceScoreVectorPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "speed-pace-score-vectors",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "speed-pace-score-vectors.json",
  );
}

export default defineCommand({
  path: ["build", "speed-pace-score-vectors"],
  summary: "Build detector-specific historical score vectors for speed_pace_hotspot.",
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
    usableMonthCount: z.number().int().nonnegative(),
    totalFeatureCount: z.number().int().nonnegative(),
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
        ? speedPaceScoreVectorPath({ artifactRoot, startMonth, endMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 5000");
      const months = queryMonths(sqlite, startMonth, endMonth);
      const rowsByMonth = new Map<string, SegmentDaypartSpeedSourceRow[]>();
      for (const month of months) {
        rowsByMonth.set(month, queryRowsForMonth(sqlite, month));
      }
      const buildInput = {
        rowsByMonth,
        months,
        startMonth,
        endMonth,
        releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        ...(input.options.candidateLimit === undefined
          ? {}
          : { candidateLimit: input.options.candidateLimit }),
      };
      const artifact = buildSpeedPaceScoreVectorArtifact(buildInput);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        usableMonthCount: artifact.summary.usableMonthCount,
        totalFeatureCount: artifact.summary.totalFeatureCount,
        releaseFeatureCount: artifact.summary.releaseFeatureCount,
        releaseCandidateCount: artifact.summary.releaseCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});

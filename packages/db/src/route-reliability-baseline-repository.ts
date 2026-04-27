import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema, parseJsonField } from "./serving-shared.js";

const RouteReliabilityBaselineRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    reliability_status: z.literal("scheduled_baseline_only"),
    scheduled_timepoint_count: z.number().int().nonnegative(),
    stop_headway_group_count: z.number().int().nonnegative(),
    headway_sample_count: z.number().int().nonnegative(),
    median_scheduled_headway_minutes: z.number().nonnegative().nullable(),
    p90_scheduled_headway_minutes: z.number().nonnegative().nullable(),
    max_scheduled_headway_minutes: z.number().nonnegative().nullable(),
    scheduled_short_headway_share: z.number().nonnegative().nullable(),
    scheduled_long_gap_share: z.number().nonnegative().nullable(),
    top_long_gap_windows_json: z.string(),
    source_status_json: z.string(),
  })
  .strict();

export type RouteReliabilityBaselineRow = z.output<typeof RouteReliabilityBaselineRowSchema>;

export type RouteReliabilityBaseline = {
  routeId: string;
  month: string;
  reliabilityStatus: "scheduled_baseline_only";
  scheduledTimepointCount: number;
  stopHeadwayGroupCount: number;
  headwaySampleCount: number;
  medianScheduledHeadwayMinutes: number | null;
  p90ScheduledHeadwayMinutes: number | null;
  maxScheduledHeadwayMinutes: number | null;
  scheduledShortHeadwayShare: number | null;
  scheduledLongGapShare: number | null;
  topLongGapWindows: unknown;
  sourceStatus: unknown;
};

function toRouteReliabilityBaseline(row: RouteReliabilityBaselineRow): RouteReliabilityBaseline {
  return {
    routeId: row.route_id,
    month: row.month,
    reliabilityStatus: row.reliability_status,
    scheduledTimepointCount: row.scheduled_timepoint_count,
    stopHeadwayGroupCount: row.stop_headway_group_count,
    headwaySampleCount: row.headway_sample_count,
    medianScheduledHeadwayMinutes: row.median_scheduled_headway_minutes,
    p90ScheduledHeadwayMinutes: row.p90_scheduled_headway_minutes,
    maxScheduledHeadwayMinutes: row.max_scheduled_headway_minutes,
    scheduledShortHeadwayShare: row.scheduled_short_headway_share,
    scheduledLongGapShare: row.scheduled_long_gap_share,
    topLongGapWindows: parseJsonField(row.top_long_gap_windows_json),
    sourceStatus: parseJsonField(row.source_status_json),
  };
}

export async function listRouteReliabilityBaselines(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteReliabilityBaseline[]> {
  const result = await db
    .prepare<RouteReliabilityBaselineRow>(
      [
        "SELECT route_id, month, reliability_status, scheduled_timepoint_count,",
        "stop_headway_group_count, headway_sample_count, median_scheduled_headway_minutes,",
        "p90_scheduled_headway_minutes, max_scheduled_headway_minutes,",
        "scheduled_short_headway_share, scheduled_long_gap_share,",
        "top_long_gap_windows_json, source_status_json",
        "FROM route_reliability_baseline",
        "WHERE month = ?",
        "ORDER BY p90_scheduled_headway_minutes DESC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteReliabilityBaseline(RouteReliabilityBaselineRowSchema.parse(row)),
  );
}

import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema, parseJsonField } from "./serving-shared.js";

const RouteBriefSummaryRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    route_score: z.number().int().min(0).max(100),
    public_visible: z.union([z.literal(0), z.literal(1), z.boolean()]),
    public_visibility_reason: z.string().min(1),
    average_speed_mph: z.number().nonnegative(),
    hotspot_count: z.number().int().nonnegative(),
    total_ridership: z.number().nonnegative(),
    total_transfers: z.number().nonnegative(),
    ace_active: z.union([z.literal(0), z.literal(1), z.boolean()]),
    ace_violation_count: z.number().int().nonnegative(),
    bus_lane_matched_lane_count: z.number().int().nonnegative(),
    schedule_match_rate: z.number().nonnegative(),
    peak_ridership_json: z.string(),
    slowest_window_json: z.string(),
  })
  .strict();

export type RouteBriefSummaryRow = z.output<typeof RouteBriefSummaryRowSchema>;

export type RouteBriefSummary = {
  routeId: string;
  month: string;
  routeScore: number;
  averageSpeedMph: number;
  hotspotCount: number;
  totalRidership: number;
  totalTransfers: number;
  aceActive: boolean;
  aceViolationCount: number;
  busLaneMatchedLaneCount: number;
  scheduleMatchRate: number;
  peakRidership: unknown;
  slowestWindow: unknown;
};

function toRouteBriefSummary(row: RouteBriefSummaryRow): RouteBriefSummary {
  return {
    routeId: row.route_id,
    month: row.month,
    routeScore: row.route_score,
    averageSpeedMph: row.average_speed_mph,
    hotspotCount: row.hotspot_count,
    totalRidership: row.total_ridership,
    totalTransfers: row.total_transfers,
    aceActive: row.ace_active === true || row.ace_active === 1,
    aceViolationCount: row.ace_violation_count,
    busLaneMatchedLaneCount: row.bus_lane_matched_lane_count,
    scheduleMatchRate: row.schedule_match_rate,
    peakRidership: parseJsonField(row.peak_ridership_json),
    slowestWindow: parseJsonField(row.slowest_window_json),
  };
}

export async function listRouteBriefSummaries(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteBriefSummary[]> {
  const result = await db
    .prepare<RouteBriefSummaryRow>(
      [
        "SELECT route_id, month, route_score, public_visible, public_visibility_reason, average_speed_mph, hotspot_count,",
        "total_ridership, total_transfers, ace_active, ace_violation_count,",
        "bus_lane_matched_lane_count, schedule_match_rate, peak_ridership_json, slowest_window_json",
        "FROM route_brief_summary",
        "WHERE month = ? AND public_visible = 1",
        "ORDER BY route_score ASC, average_speed_mph ASC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteBriefSummary(RouteBriefSummaryRowSchema.parse(row)),
  );
}

export async function getRouteBriefSummary(
  db: D1DatabaseLike,
  routeId: string,
  month: string,
): Promise<RouteBriefSummary | null> {
  const row = await db
    .prepare<RouteBriefSummaryRow>(
      [
        "SELECT route_id, month, route_score, public_visible, public_visibility_reason, average_speed_mph, hotspot_count,",
        "total_ridership, total_transfers, ace_active, ace_violation_count,",
        "bus_lane_matched_lane_count, schedule_match_rate, peak_ridership_json, slowest_window_json",
        "FROM route_brief_summary",
        "WHERE route_id = ? AND month = ?",
      ].join(" "),
    )
    .bind(routeId, month)
    .first();

  return row === null ? null : toRouteBriefSummary(RouteBriefSummaryRowSchema.parse(row));
}

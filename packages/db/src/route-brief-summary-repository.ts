import * as z from "zod";
import type { D1DatabaseLike } from "./d1/legacy.js";
import { IsoMonthSchema } from "./serving-shared.js";

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
  })
  .strict();

const RouteBriefPeakWindowRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    window_rank: z.number().int().positive(),
    day_of_week: z.string().min(1),
    hour_of_day: z.number().int().min(0).max(23),
    ridership: z.number().nonnegative().nullable(),
    transfers: z.number().nonnegative().nullable(),
    matched_observation_count: z.number().int().nonnegative().nullable(),
    bus_trip_count: z.number().int().nonnegative().nullable(),
    weighted_average_speed_mph: z.number().nonnegative().nullable(),
    slow_observation_share: z.number().nonnegative().nullable(),
  })
  .strict();

const RouteBriefSlowestWindowRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    window_rank: z.number().int().positive(),
    day_of_week: z.string().min(1),
    hour_of_day: z.number().int().min(0).max(23),
    observation_count: z.number().int().nonnegative().nullable(),
    bus_trip_count: z.number().int().nonnegative().nullable(),
    segment_count: z.number().int().nonnegative().nullable(),
    weighted_average_speed_mph: z.number().nonnegative().nullable(),
    weighted_average_travel_time_minutes: z.number().nonnegative().nullable(),
    slow_observation_share: z.number().nonnegative().nullable(),
  })
  .strict();

export type RouteBriefSummaryRow = z.output<typeof RouteBriefSummaryRowSchema>;
export type RouteBriefPeakWindowRow = z.output<typeof RouteBriefPeakWindowRowSchema>;
export type RouteBriefSlowestWindowRow = z.output<typeof RouteBriefSlowestWindowRowSchema>;

export type RouteBriefPeakWindow = {
  dayOfWeek: string;
  hourOfDay: number;
  ridership: number | null;
  transfers: number | null;
  matchedObservationCount: number | null;
  busTripCount: number | null;
  weightedAverageSpeedMph: number | null;
  slowObservationShare: number | null;
};

export type RouteBriefSlowestWindow = {
  dayOfWeek: string;
  hourOfDay: number;
  observationCount: number | null;
  busTripCount: number | null;
  segmentCount: number | null;
  weightedAverageSpeedMph: number | null;
  weightedAverageTravelTimeMinutes: number | null;
  slowObservationShare: number | null;
};

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
  peakRidership: RouteBriefPeakWindow | null;
  slowestWindow: RouteBriefSlowestWindow | null;
};

function key(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function peakWindowFromRow(row: RouteBriefPeakWindowRow): RouteBriefPeakWindow {
  return {
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    ridership: row.ridership,
    transfers: row.transfers,
    matchedObservationCount: row.matched_observation_count,
    busTripCount: row.bus_trip_count,
    weightedAverageSpeedMph: row.weighted_average_speed_mph,
    slowObservationShare: row.slow_observation_share,
  };
}

function slowestWindowFromRow(row: RouteBriefSlowestWindowRow): RouteBriefSlowestWindow {
  return {
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    observationCount: row.observation_count,
    busTripCount: row.bus_trip_count,
    segmentCount: row.segment_count,
    weightedAverageSpeedMph: row.weighted_average_speed_mph,
    weightedAverageTravelTimeMinutes: row.weighted_average_travel_time_minutes,
    slowObservationShare: row.slow_observation_share,
  };
}

function groupPeakWindows(rows: RouteBriefPeakWindowRow[]): Map<string, RouteBriefPeakWindow[]> {
  const output = new Map<string, RouteBriefPeakWindow[]>();

  for (const row of rows) {
    const groupKey = key(row.route_id, row.month);
    const group = output.get(groupKey) ?? [];
    group.push(peakWindowFromRow(row));
    output.set(groupKey, group);
  }

  return output;
}

function groupSlowestWindows(
  rows: RouteBriefSlowestWindowRow[],
): Map<string, RouteBriefSlowestWindow[]> {
  const output = new Map<string, RouteBriefSlowestWindow[]>();

  for (const row of rows) {
    const groupKey = key(row.route_id, row.month);
    const group = output.get(groupKey) ?? [];
    group.push(slowestWindowFromRow(row));
    output.set(groupKey, group);
  }

  return output;
}

function toRouteBriefSummary(
  row: RouteBriefSummaryRow,
  peakWindows: Map<string, RouteBriefPeakWindow[]>,
  slowestWindows: Map<string, RouteBriefSlowestWindow[]>,
): RouteBriefSummary {
  const groupKey = key(row.route_id, row.month);

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
    peakRidership: peakWindows.get(groupKey)?.[0] ?? null,
    slowestWindow: slowestWindows.get(groupKey)?.[0] ?? null,
  };
}

async function listPeakWindowRows(
  db: D1DatabaseLike,
  month: string,
  routeId?: string,
): Promise<RouteBriefPeakWindowRow[]> {
  const whereClause =
    routeId === undefined ? "WHERE month = ?" : "WHERE month = ? AND route_id = ?";
  const result = await db
    .prepare<RouteBriefPeakWindowRow>(
      [
        "SELECT route_id, month, window_rank, day_of_week, hour_of_day, ridership, transfers,",
        "matched_observation_count, bus_trip_count, weighted_average_speed_mph, slow_observation_share",
        "FROM route_brief_peak_window",
        whereClause,
        "ORDER BY route_id ASC, window_rank ASC",
      ].join(" "),
    )
    .bind(...(routeId === undefined ? [month] : [month, routeId]))
    .all();

  return (result.results ?? []).map((row) => RouteBriefPeakWindowRowSchema.parse(row));
}

async function listSlowestWindowRows(
  db: D1DatabaseLike,
  month: string,
  routeId?: string,
): Promise<RouteBriefSlowestWindowRow[]> {
  const whereClause =
    routeId === undefined ? "WHERE month = ?" : "WHERE month = ? AND route_id = ?";
  const result = await db
    .prepare<RouteBriefSlowestWindowRow>(
      [
        "SELECT route_id, month, window_rank, day_of_week, hour_of_day, observation_count,",
        "bus_trip_count, segment_count, weighted_average_speed_mph,",
        "weighted_average_travel_time_minutes, slow_observation_share",
        "FROM route_brief_slowest_window",
        whereClause,
        "ORDER BY route_id ASC, window_rank ASC",
      ].join(" "),
    )
    .bind(...(routeId === undefined ? [month] : [month, routeId]))
    .all();

  return (result.results ?? []).map((row) => RouteBriefSlowestWindowRowSchema.parse(row));
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
        "bus_lane_matched_lane_count, schedule_match_rate",
        "FROM route_brief_summary",
        "WHERE month = ? AND public_visible = 1",
        "ORDER BY route_score ASC, average_speed_mph ASC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  const rows = (result.results ?? []).map((row) => RouteBriefSummaryRowSchema.parse(row));
  const [peakRows, slowestRows] = await Promise.all([
    listPeakWindowRows(db, month),
    listSlowestWindowRows(db, month),
  ]);

  return rows.map((row) =>
    toRouteBriefSummary(row, groupPeakWindows(peakRows), groupSlowestWindows(slowestRows)),
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
        "bus_lane_matched_lane_count, schedule_match_rate",
        "FROM route_brief_summary",
        "WHERE route_id = ? AND month = ?",
      ].join(" "),
    )
    .bind(routeId, month)
    .first();

  if (row === null) {
    return null;
  }

  const [peakRows, slowestRows] = await Promise.all([
    listPeakWindowRows(db, month, routeId),
    listSlowestWindowRows(db, month, routeId),
  ]);

  return toRouteBriefSummary(
    RouteBriefSummaryRowSchema.parse(row),
    groupPeakWindows(peakRows),
    groupSlowestWindows(slowestRows),
  );
}

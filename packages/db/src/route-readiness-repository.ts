import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema } from "./serving-shared.js";

const RouteReadinessRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    route_short_name: z.string().min(1),
    route_long_name: z.string().nullable(),
    readiness_status: z.enum([
      "ready",
      "partial",
      "missing_geometry",
      "missing_schedule",
      "missing_speed",
    ]),
    build_eligible: z.union([z.literal(0), z.literal(1), z.boolean()]),
    readiness_score: z.number().int().min(0).max(100),
    speed_observation_count: z.number().int().nonnegative(),
    speed_bus_trip_count: z.number().int().nonnegative(),
    average_speed_mph: z.number().nonnegative().nullable(),
    schedule_timepoint_count: z.number().int().nonnegative(),
    shape_count: z.number().int().nonnegative(),
    stop_count: z.number().int().nonnegative(),
    timepoint_stop_count: z.number().int().nonnegative(),
  })
  .strict();

const RouteReadinessMissingInputRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    input_rank: z.number().int().positive(),
    input_name: z.string().min(1),
    severity: z.enum(["blocking", "warning"]),
    note: z.string().nullable(),
  })
  .strict();

export type RouteReadinessRow = z.output<typeof RouteReadinessRowSchema>;
export type RouteReadinessMissingInputRow = z.output<typeof RouteReadinessMissingInputRowSchema>;

export type RouteReadiness = {
  routeId: string;
  month: string;
  routeShortName: string;
  routeLongName: string | null;
  readinessStatus: RouteReadinessRow["readiness_status"];
  buildEligible: boolean;
  readinessScore: number;
  missingInputs: string[];
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
};

export function routeMonthKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

export async function listReadinessMissingInputRows(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteReadinessMissingInputRow[]> {
  const result = await db
    .prepare<RouteReadinessMissingInputRow>(
      [
        "SELECT route_id, month, input_rank, input_name, severity, note",
        "FROM route_readiness_missing_input",
        "WHERE month = ?",
        "ORDER BY route_id ASC, input_rank ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) => RouteReadinessMissingInputRowSchema.parse(row));
}

export function groupMissingInputs(
  rows: readonly RouteReadinessMissingInputRow[],
): Map<string, string[]> {
  const output = new Map<string, string[]>();

  for (const row of rows) {
    const key = routeMonthKey(row.route_id, row.month);
    const group = output.get(key) ?? [];
    group.push(row.input_name);
    output.set(key, group);
  }

  return output;
}

function toRouteReadiness(
  row: RouteReadinessRow,
  missingInputs: Map<string, string[]>,
): RouteReadiness {
  return {
    routeId: row.route_id,
    month: row.month,
    routeShortName: row.route_short_name,
    routeLongName: row.route_long_name,
    readinessStatus: row.readiness_status,
    buildEligible: row.build_eligible === true || row.build_eligible === 1,
    readinessScore: row.readiness_score,
    missingInputs: missingInputs.get(routeMonthKey(row.route_id, row.month)) ?? [],
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    scheduleTimepointCount: row.schedule_timepoint_count,
    shapeCount: row.shape_count,
    stopCount: row.stop_count,
    timepointStopCount: row.timepoint_stop_count,
  };
}

async function listReadinessRows(
  db: D1DatabaseLike,
  month: string,
  buildEligibleOnly: boolean,
): Promise<RouteReadiness[]> {
  const result = await db
    .prepare<RouteReadinessRow>(
      [
        "SELECT route_id, month, route_short_name, route_long_name, readiness_status,",
        "build_eligible, readiness_score, speed_observation_count, speed_bus_trip_count,",
        "average_speed_mph, schedule_timepoint_count, shape_count, stop_count, timepoint_stop_count",
        "FROM route_readiness",
        buildEligibleOnly ? "WHERE month = ? AND build_eligible = 1" : "WHERE month = ?",
        buildEligibleOnly
          ? "ORDER BY average_speed_mph ASC, route_id ASC"
          : "ORDER BY build_eligible DESC, readiness_score DESC, average_speed_mph ASC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  const rows = (result.results ?? []).map((row) => RouteReadinessRowSchema.parse(row));
  const missingInputs = groupMissingInputs(await listReadinessMissingInputRows(db, month));

  return rows.map((row) => toRouteReadiness(row, missingInputs));
}

export async function listRouteReadiness(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteReadiness[]> {
  return listReadinessRows(db, month, false);
}

export async function listBuildEligibleRoutes(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteReadiness[]> {
  return listReadinessRows(db, month, true);
}

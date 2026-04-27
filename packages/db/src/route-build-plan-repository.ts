import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema, parseJsonField } from "./serving-shared.js";

const RouteBuildPlanRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    route_short_name: z.string().min(1),
    route_long_name: z.string().nullable(),
    candidate_rank: z.number().int().positive().nullable(),
    plan_status: z.enum(["selected", "backlog", "already_built", "blocked"]),
    selected_for_next_batch: z.union([z.literal(0), z.literal(1), z.boolean()]),
    already_built: z.union([z.literal(0), z.literal(1), z.boolean()]),
    build_eligible: z.union([z.literal(0), z.literal(1), z.boolean()]),
    priority_score: z.number().nonnegative(),
    readiness_status: z.enum([
      "ready",
      "partial",
      "missing_geometry",
      "missing_schedule",
      "missing_speed",
    ]),
    readiness_score: z.number().int().min(0).max(100),
    missing_inputs_json: z.string(),
    speed_observation_count: z.number().int().nonnegative(),
    speed_bus_trip_count: z.number().int().nonnegative(),
    average_speed_mph: z.number().nonnegative().nullable(),
    schedule_timepoint_count: z.number().int().nonnegative(),
  })
  .strict();

export type RouteBuildPlanRow = z.output<typeof RouteBuildPlanRowSchema>;

export type RouteBuildPlanEntry = {
  routeId: string;
  month: string;
  routeShortName: string;
  routeLongName: string | null;
  candidateRank: number | null;
  planStatus: RouteBuildPlanRow["plan_status"];
  selectedForNextBatch: boolean;
  alreadyBuilt: boolean;
  buildEligible: boolean;
  priorityScore: number;
  readinessStatus: RouteBuildPlanRow["readiness_status"];
  readinessScore: number;
  missingInputs: unknown;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
};

function toRouteBuildPlanEntry(row: RouteBuildPlanRow): RouteBuildPlanEntry {
  return {
    routeId: row.route_id,
    month: row.month,
    routeShortName: row.route_short_name,
    routeLongName: row.route_long_name,
    candidateRank: row.candidate_rank,
    planStatus: row.plan_status,
    selectedForNextBatch: row.selected_for_next_batch === true || row.selected_for_next_batch === 1,
    alreadyBuilt: row.already_built === true || row.already_built === 1,
    buildEligible: row.build_eligible === true || row.build_eligible === 1,
    priorityScore: row.priority_score,
    readinessStatus: row.readiness_status,
    readinessScore: row.readiness_score,
    missingInputs: parseJsonField(row.missing_inputs_json),
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    scheduleTimepointCount: row.schedule_timepoint_count,
  };
}

export async function listRouteBuildPlan(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteBuildPlanEntry[]> {
  const result = await db
    .prepare<RouteBuildPlanRow>(
      [
        "SELECT route_id, month, route_short_name, route_long_name, candidate_rank,",
        "plan_status, selected_for_next_batch, already_built, build_eligible, priority_score,",
        "readiness_status, readiness_score, missing_inputs_json, speed_observation_count,",
        "speed_bus_trip_count, average_speed_mph, schedule_timepoint_count",
        "FROM route_build_plan",
        "WHERE month = ?",
        "ORDER BY selected_for_next_batch DESC,",
        "CASE plan_status WHEN 'selected' THEN 0 WHEN 'backlog' THEN 1",
        "WHEN 'already_built' THEN 2 ELSE 3 END ASC,",
        "candidate_rank ASC, priority_score DESC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteBuildPlanEntry(RouteBuildPlanRowSchema.parse(row)),
  );
}

export async function listSelectedRouteBuildCandidates(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteBuildPlanEntry[]> {
  const result = await db
    .prepare<RouteBuildPlanRow>(
      [
        "SELECT route_id, month, route_short_name, route_long_name, candidate_rank,",
        "plan_status, selected_for_next_batch, already_built, build_eligible, priority_score,",
        "readiness_status, readiness_score, missing_inputs_json, speed_observation_count,",
        "speed_bus_trip_count, average_speed_mph, schedule_timepoint_count",
        "FROM route_build_plan",
        "WHERE month = ? AND selected_for_next_batch = 1",
        "ORDER BY candidate_rank ASC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteBuildPlanEntry(RouteBuildPlanRowSchema.parse(row)),
  );
}

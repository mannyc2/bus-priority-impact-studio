import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeBuildPlan } from "../schema.js";
import {
  groupMissingInputs,
  listReadinessMissingInputRows,
  routeMonthKey,
} from "./route-readiness.js";
import { IsoMonthSchema } from "./shared.js";

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
  missingInputs: string[];
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
};

function toRouteBuildPlanEntry(
  row: RouteBuildPlanRow,
  missingInputs: Map<string, string[]>,
): RouteBuildPlanEntry {
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
    missingInputs: missingInputs.get(routeMonthKey(row.route_id, row.month)) ?? [],
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    scheduleTimepointCount: row.schedule_timepoint_count,
  };
}

async function listPlanRows(
  db: D1ServingDb,
  month: string,
  selectedOnly: boolean,
): Promise<RouteBuildPlanEntry[]> {
  const rows = await db
    .select({
      route_id: routeBuildPlan.routeId,
      month: routeBuildPlan.month,
      route_short_name: routeBuildPlan.routeShortName,
      route_long_name: routeBuildPlan.routeLongName,
      candidate_rank: routeBuildPlan.candidateRank,
      plan_status: routeBuildPlan.planStatus,
      selected_for_next_batch: routeBuildPlan.selectedForNextBatch,
      already_built: routeBuildPlan.alreadyBuilt,
      build_eligible: routeBuildPlan.buildEligible,
      priority_score: routeBuildPlan.priorityScore,
      readiness_status: routeBuildPlan.readinessStatus,
      readiness_score: routeBuildPlan.readinessScore,
      speed_observation_count: routeBuildPlan.speedObservationCount,
      speed_bus_trip_count: routeBuildPlan.speedBusTripCount,
      average_speed_mph: routeBuildPlan.averageSpeedMph,
      schedule_timepoint_count: routeBuildPlan.scheduleTimepointCount,
    })
    .from(routeBuildPlan)
    .where(
      selectedOnly
        ? and(eq(routeBuildPlan.month, month), eq(routeBuildPlan.selectedForNextBatch, true))
        : eq(routeBuildPlan.month, month),
    )
    .orderBy(
      ...(selectedOnly
        ? [asc(routeBuildPlan.candidateRank), asc(routeBuildPlan.routeId)]
        : [
            desc(routeBuildPlan.selectedForNextBatch),
            sql`case ${routeBuildPlan.planStatus} when 'selected' then 0 when 'backlog' then 1 when 'already_built' then 2 else 3 end`,
            asc(routeBuildPlan.candidateRank),
            desc(routeBuildPlan.priorityScore),
            asc(routeBuildPlan.routeId),
          ]),
    );

  const parsedRows = rows.map((row) => RouteBuildPlanRowSchema.parse(row));
  const missingInputs = groupMissingInputs(await listReadinessMissingInputRows(db, month));

  return parsedRows.map((row) => toRouteBuildPlanEntry(row, missingInputs));
}

export async function listRouteBuildPlan(
  db: D1ServingDb,
  month: string,
): Promise<RouteBuildPlanEntry[]> {
  return listPlanRows(db, month, false);
}

export async function listSelectedRouteBuildCandidates(
  db: D1ServingDb,
  month: string,
): Promise<RouteBuildPlanEntry[]> {
  return listPlanRows(db, month, true);
}

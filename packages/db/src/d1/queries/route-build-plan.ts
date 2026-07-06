import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeBuildPlan } from "../schema.js";
import {
  groupMissingInputs,
  listReadinessMissingInputRows,
  routeMonthKey,
} from "./route-readiness.js";
import { sqliteBool } from "./shared.js";

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
    selectedForNextBatch: sqliteBool(row.selected_for_next_batch),
    alreadyBuilt: sqliteBool(row.already_built),
    buildEligible: sqliteBool(row.build_eligible),
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

async function listPlanRows(db: D1ServingDb, month: string, selectedOnly: boolean) {
  return db
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
}

export type RouteBuildPlanRow = Awaited<ReturnType<typeof listPlanRows>>[number];

async function listPlanEntries(
  db: D1ServingDb,
  month: string,
  selectedOnly: boolean,
): Promise<RouteBuildPlanEntry[]> {
  const rows = await listPlanRows(db, month, selectedOnly);
  const missingInputs = groupMissingInputs(await listReadinessMissingInputRows(db, month));

  return rows.map((row) => toRouteBuildPlanEntry(row, missingInputs));
}

export async function listRouteBuildPlan(
  db: D1ServingDb,
  month: string,
): Promise<RouteBuildPlanEntry[]> {
  return listPlanEntries(db, month, false);
}

export async function listSelectedRouteBuildCandidates(
  db: D1ServingDb,
  month: string,
): Promise<RouteBuildPlanEntry[]> {
  return listPlanEntries(db, month, true);
}

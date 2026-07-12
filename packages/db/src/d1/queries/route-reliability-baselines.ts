import { asc, desc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeReliabilityBaseline, routeReliabilityGapWindow } from "../schema.js";
import { groupSourceStatuses, listRouteMonthSourceStatuses } from "./source-statuses.js";

export type RouteReliabilityGapWindow = {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  sampleCount: number;
  medianHeadwayMinutes: number;
  p90HeadwayMinutes: number;
  maxHeadwayMinutes: number;
};

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
  topLongGapWindows: RouteReliabilityGapWindow[];
  sourceStatus: Record<string, string>;
};

function key(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function gapWindowFromRow(row: RouteReliabilityGapWindowRow): RouteReliabilityGapWindow {
  return {
    routeId: row.route_id,
    dayType: row.day_type,
    direction: row.direction_id,
    stopId: row.stop_id,
    stopName: row.stop_name,
    sampleCount: row.sample_count,
    medianHeadwayMinutes: row.median_headway_minutes,
    p90HeadwayMinutes: row.p90_headway_minutes,
    maxHeadwayMinutes: row.max_headway_minutes,
  };
}

function groupGapWindows(
  rows: readonly RouteReliabilityGapWindowRow[],
): Map<string, RouteReliabilityGapWindow[]> {
  const output = new Map<string, RouteReliabilityGapWindow[]>();

  for (const row of rows) {
    const groupKey = key(row.route_id, row.month);
    const group = output.get(groupKey) ?? [];
    group.push(gapWindowFromRow(row));
    output.set(groupKey, group);
  }

  return output;
}

function toRouteReliabilityBaseline(
  row: RouteReliabilityBaselineRow,
  windows: Map<string, RouteReliabilityGapWindow[]>,
  statuses: Map<string, Record<string, string>>,
): RouteReliabilityBaseline {
  const groupKey = key(row.route_id, row.month);

  return {
    routeId: row.route_id,
    month: row.month,
    reliabilityStatus: row.reliability_status as RouteReliabilityBaseline["reliabilityStatus"],
    scheduledTimepointCount: row.scheduled_timepoint_count,
    stopHeadwayGroupCount: row.stop_headway_group_count,
    headwaySampleCount: row.headway_sample_count,
    medianScheduledHeadwayMinutes: row.median_scheduled_headway_minutes,
    p90ScheduledHeadwayMinutes: row.p90_scheduled_headway_minutes,
    maxScheduledHeadwayMinutes: row.max_scheduled_headway_minutes,
    scheduledShortHeadwayShare: row.scheduled_short_headway_share,
    scheduledLongGapShare: row.scheduled_long_gap_share,
    topLongGapWindows: windows.get(groupKey) ?? [],
    sourceStatus: statuses.get(groupKey) ?? {},
  };
}

async function listGapWindowRows(db: D1ServingDb, month: string) {
  return db
    .select({
      route_id: routeReliabilityGapWindow.routeId,
      month: routeReliabilityGapWindow.month,
      window_rank: routeReliabilityGapWindow.windowRank,
      day_type: routeReliabilityGapWindow.dayType,
      direction_id: routeReliabilityGapWindow.directionId,
      stop_id: routeReliabilityGapWindow.stopId,
      stop_name: routeReliabilityGapWindow.stopName,
      sample_count: routeReliabilityGapWindow.sampleCount,
      median_headway_minutes: routeReliabilityGapWindow.medianHeadwayMinutes,
      p90_headway_minutes: routeReliabilityGapWindow.p90HeadwayMinutes,
      max_headway_minutes: routeReliabilityGapWindow.maxHeadwayMinutes,
    })
    .from(routeReliabilityGapWindow)
    .where(eq(routeReliabilityGapWindow.month, month))
    .orderBy(asc(routeReliabilityGapWindow.routeId), asc(routeReliabilityGapWindow.windowRank));
}

async function selectRouteReliabilityBaselineRows(db: D1ServingDb, month: string) {
  return db
    .select({
      route_id: routeReliabilityBaseline.routeId,
      month: routeReliabilityBaseline.month,
      reliability_status: routeReliabilityBaseline.reliabilityStatus,
      scheduled_timepoint_count: routeReliabilityBaseline.scheduledTimepointCount,
      stop_headway_group_count: routeReliabilityBaseline.stopHeadwayGroupCount,
      headway_sample_count: routeReliabilityBaseline.headwaySampleCount,
      median_scheduled_headway_minutes: routeReliabilityBaseline.medianScheduledHeadwayMinutes,
      p90_scheduled_headway_minutes: routeReliabilityBaseline.p90ScheduledHeadwayMinutes,
      max_scheduled_headway_minutes: routeReliabilityBaseline.maxScheduledHeadwayMinutes,
      scheduled_short_headway_share: routeReliabilityBaseline.scheduledShortHeadwayShare,
      scheduled_long_gap_share: routeReliabilityBaseline.scheduledLongGapShare,
    })
    .from(routeReliabilityBaseline)
    .where(eq(routeReliabilityBaseline.month, month))
    .orderBy(
      desc(routeReliabilityBaseline.p90ScheduledHeadwayMinutes),
      asc(routeReliabilityBaseline.routeId),
    );
}

export type RouteReliabilityBaselineRow = Awaited<
  ReturnType<typeof selectRouteReliabilityBaselineRows>
>[number];
export type RouteReliabilityGapWindowRow = Awaited<ReturnType<typeof listGapWindowRows>>[number];

export async function listRouteReliabilityBaselines(
  db: D1ServingDb,
  month: string,
): Promise<RouteReliabilityBaseline[]> {
  const rows = await selectRouteReliabilityBaselineRows(db, month);
  const [gapWindows, sourceStatuses] = await Promise.all([
    listGapWindowRows(db, month),
    listRouteMonthSourceStatuses(db, month, "reliability"),
  ]);

  return rows.map((row) =>
    toRouteReliabilityBaseline(
      row,
      groupGapWindows(gapWindows),
      groupSourceStatuses(sourceStatuses),
    ),
  );
}

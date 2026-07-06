import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeComparisonRank } from "../schema.js";

export type RouteComparisonRank = {
  month: string;
  rank: number;
  routeId: string;
  routeScore: number;
  averageSpeedMph: number;
  totalRidership: number;
  aceViolationCount: number;
  busLaneMatchedLaneCount: number;
};

async function selectRouteComparisonRankRows(db: D1ServingDb, month: string) {
  return db
    .select({
      month: routeComparisonRank.month,
      rank: routeComparisonRank.rank,
      route_id: routeComparisonRank.routeId,
      route_score: routeComparisonRank.routeScore,
      average_speed_mph: routeComparisonRank.averageSpeedMph,
      total_ridership: routeComparisonRank.totalRidership,
      ace_violation_count: routeComparisonRank.aceViolationCount,
      bus_lane_matched_lane_count: routeComparisonRank.busLaneMatchedLaneCount,
    })
    .from(routeComparisonRank)
    .where(eq(routeComparisonRank.month, month))
    .orderBy(asc(routeComparisonRank.rank));
}

export type RouteComparisonRankRow = Awaited<
  ReturnType<typeof selectRouteComparisonRankRows>
>[number];

function toRouteComparisonRank(row: RouteComparisonRankRow): RouteComparisonRank {
  return {
    month: row.month,
    rank: row.rank,
    routeId: row.route_id,
    routeScore: row.route_score,
    averageSpeedMph: row.average_speed_mph,
    totalRidership: row.total_ridership,
    aceViolationCount: row.ace_violation_count,
    busLaneMatchedLaneCount: row.bus_lane_matched_lane_count,
  };
}

export async function listRouteComparisonRanks(
  db: D1ServingDb,
  month: string,
): Promise<RouteComparisonRank[]> {
  const rows = await selectRouteComparisonRankRows(db, month);
  return rows.map(toRouteComparisonRank);
}

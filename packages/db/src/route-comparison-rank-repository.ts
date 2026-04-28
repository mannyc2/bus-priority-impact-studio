import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "./d1/client.js";
import { routeComparisonRank } from "./d1/schema.js";
import { IsoMonthSchema } from "./serving-shared.js";

const RouteComparisonRankRowSchema = z
  .object({
    month: IsoMonthSchema,
    rank: z.number().int().positive(),
    route_id: z.string().min(1),
    route_score: z.number().int().min(0).max(100),
    average_speed_mph: z.number().nonnegative(),
    total_ridership: z.number().nonnegative(),
    ace_violation_count: z.number().int().nonnegative(),
    bus_lane_matched_lane_count: z.number().int().nonnegative(),
  })
  .strict();

export type RouteComparisonRankRow = z.output<typeof RouteComparisonRankRowSchema>;

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
  const rows = await db
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

  return rows.map((row) => toRouteComparisonRank(RouteComparisonRankRowSchema.parse(row)));
}

import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
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
  db: D1DatabaseLike,
  month: string,
): Promise<RouteComparisonRank[]> {
  const result = await db
    .prepare<RouteComparisonRankRow>(
      [
        "SELECT month, rank, route_id, route_score, average_speed_mph, total_ridership,",
        "ace_violation_count, bus_lane_matched_lane_count",
        "FROM route_comparison_rank",
        "WHERE month = ?",
        "ORDER BY rank ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteComparisonRank(RouteComparisonRankRowSchema.parse(row)),
  );
}

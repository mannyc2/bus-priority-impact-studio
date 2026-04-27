import { type RouteScorecard, RouteScorecardSchema } from "@bp/domain";
import type { D1DatabaseLike } from "./d1.js";

export const createRouteScorecardTableSql = `
CREATE TABLE IF NOT EXISTS route_scorecard (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  route_score INTEGER NOT NULL CHECK (route_score BETWEEN 0 AND 100),
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('full', 'no_observed_speed')),
  average_speed_mph REAL NOT NULL CHECK (average_speed_mph >= 0),
  hotspot_count INTEGER NOT NULL CHECK (hotspot_count >= 0),
  citations_json TEXT NOT NULL,
  PRIMARY KEY (route_id, month)
);
`;

export type RouteScorecardRow = {
  route_id: string;
  month: string;
  route_score: number;
  coverage_status: string;
  average_speed_mph: number;
  hotspot_count: number;
  citations_json: string;
};

export function serializeRouteScorecard(scorecard: RouteScorecard): RouteScorecardRow {
  const parsed = RouteScorecardSchema.parse(scorecard);

  return {
    route_id: parsed.routeId,
    month: parsed.month,
    route_score: parsed.routeScore,
    coverage_status: parsed.coverageStatus,
    average_speed_mph: parsed.averageSpeedMph,
    hotspot_count: parsed.hotspotCount,
    citations_json: JSON.stringify(parsed.citations),
  };
}

export function deserializeRouteScorecard(row: RouteScorecardRow): RouteScorecard {
  const citations = JSON.parse(row.citations_json) as unknown;

  return RouteScorecardSchema.parse({
    schemaVersion: 1,
    routeId: row.route_id,
    month: row.month,
    routeScore: row.route_score,
    coverageStatus: row.coverage_status,
    averageSpeedMph: row.average_speed_mph,
    hotspotCount: row.hotspot_count,
    citations,
  });
}

export async function getRouteScorecard(
  db: D1DatabaseLike,
  routeId: string,
  month: string,
): Promise<RouteScorecard | null> {
  const row = await db
    .prepare<RouteScorecardRow>(
      [
        "SELECT route_id, month, route_score, coverage_status,",
        "average_speed_mph, hotspot_count, citations_json",
        "FROM route_scorecard",
        "WHERE route_id = ? AND month = ?",
      ].join(" "),
    )
    .bind(routeId, month)
    .first();

  return row === null ? null : deserializeRouteScorecard(row);
}

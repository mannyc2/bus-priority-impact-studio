import { type RouteScorecard, RouteScorecardSchema } from "@bp/domain";

export const createRouteScorecardTableSql = `
CREATE TABLE IF NOT EXISTS route_scorecard (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  route_score INTEGER NOT NULL CHECK (route_score BETWEEN 0 AND 100),
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
    averageSpeedMph: row.average_speed_mph,
    hotspotCount: row.hotspot_count,
    citations,
  });
}

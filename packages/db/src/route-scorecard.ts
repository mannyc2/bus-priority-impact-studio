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
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteScorecardCitationTableSql = `
CREATE TABLE IF NOT EXISTS route_scorecard_citation (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  citation_rank INTEGER NOT NULL CHECK (citation_rank >= 1),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (route_id, month, citation_rank)
);
`;

export type RouteScorecardRow = {
  route_id: string;
  month: string;
  route_score: number;
  coverage_status: string;
  average_speed_mph: number;
  hotspot_count: number;
};

export type RouteScorecardCitationRow = {
  route_id: string;
  month: string;
  citation_rank: number;
  source_id: string;
  title: string;
  url: string;
  verified_at: string;
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
  };
}

export function serializeRouteScorecardCitations(
  scorecard: RouteScorecard,
): RouteScorecardCitationRow[] {
  const parsed = RouteScorecardSchema.parse(scorecard);

  return parsed.citations.map((citation, index) => ({
    route_id: parsed.routeId,
    month: parsed.month,
    citation_rank: index + 1,
    source_id: citation.sourceId,
    title: citation.title,
    url: citation.url,
    verified_at: citation.verifiedAt,
  }));
}

export function deserializeRouteScorecard(
  row: RouteScorecardRow,
  citations: RouteScorecardCitationRow[],
): RouteScorecard {
  return RouteScorecardSchema.parse({
    schemaVersion: 1,
    routeId: row.route_id,
    month: row.month,
    routeScore: row.route_score,
    coverageStatus: row.coverage_status,
    averageSpeedMph: row.average_speed_mph,
    hotspotCount: row.hotspot_count,
    citations: citations
      .toSorted((left, right) => left.citation_rank - right.citation_rank)
      .map((citation) => ({
        sourceId: citation.source_id,
        title: citation.title,
        url: citation.url,
        verifiedAt: citation.verified_at,
      })),
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
        "average_speed_mph, hotspot_count",
        "FROM route_scorecard",
        "WHERE route_id = ? AND month = ?",
      ].join(" "),
    )
    .bind(routeId, month)
    .first();

  if (row === null) {
    return null;
  }

  const citations = await db
    .prepare<RouteScorecardCitationRow>(
      [
        "SELECT route_id, month, citation_rank, source_id, title, url, verified_at",
        "FROM route_scorecard_citation",
        "WHERE route_id = ? AND month = ?",
        "ORDER BY citation_rank ASC",
      ].join(" "),
    )
    .bind(routeId, month)
    .all();

  return deserializeRouteScorecard(row, citations.results ?? []);
}

import { type RouteScorecard, RouteScorecardSchema } from "@bp/domain";
import type { D1DatabaseLike } from "./d1.js";

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

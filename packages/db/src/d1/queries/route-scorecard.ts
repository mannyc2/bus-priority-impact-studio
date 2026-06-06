import { type RouteScorecard, RouteScorecardSchema } from "@bp/domain/routes";
import { and, asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeScorecard, routeScorecardCitation } from "../schema.js";

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
  db: D1ServingDb,
  routeId: string,
  month: string,
): Promise<RouteScorecard | null> {
  const rows = await db
    .select({
      route_id: routeScorecard.routeId,
      month: routeScorecard.month,
      route_score: routeScorecard.routeScore,
      coverage_status: routeScorecard.coverageStatus,
      average_speed_mph: routeScorecard.averageSpeedMph,
      hotspot_count: routeScorecard.hotspotCount,
    })
    .from(routeScorecard)
    .where(and(eq(routeScorecard.routeId, routeId), eq(routeScorecard.month, month)))
    .limit(1);
  const row = rows[0] ?? null;

  if (row === null) {
    return null;
  }

  const citations = await db
    .select({
      route_id: routeScorecardCitation.routeId,
      month: routeScorecardCitation.month,
      citation_rank: routeScorecardCitation.citationRank,
      source_id: routeScorecardCitation.sourceId,
      title: routeScorecardCitation.title,
      url: routeScorecardCitation.url,
      verified_at: routeScorecardCitation.verifiedAt,
    })
    .from(routeScorecardCitation)
    .where(
      and(eq(routeScorecardCitation.routeId, routeId), eq(routeScorecardCitation.month, month)),
    )
    .orderBy(asc(routeScorecardCitation.citationRank));

  return deserializeRouteScorecard(row, citations);
}

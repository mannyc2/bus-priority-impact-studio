import { decodeStrict } from "@bp/domain/decode";
import { type RouteScorecard, RouteScorecardSchema } from "@bp/domain/routes";
import { and, asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeScorecard, routeScorecardCitation } from "../schema.js";

async function selectRouteScorecardRows(db: D1ServingDb, routeId: string, month: string) {
  return db
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
}

async function selectRouteScorecardCitationRows(db: D1ServingDb, routeId: string, month: string) {
  return db
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
}

export type RouteScorecardRow = Awaited<ReturnType<typeof selectRouteScorecardRows>>[number];
export type RouteScorecardCitationRow = Awaited<
  ReturnType<typeof selectRouteScorecardCitationRows>
>[number];

export function serializeRouteScorecard(scorecard: RouteScorecard): RouteScorecardRow {
  return {
    route_id: scorecard.routeId,
    month: scorecard.month,
    route_score: scorecard.routeScore,
    coverage_status: scorecard.coverageStatus,
    average_speed_mph: scorecard.averageSpeedMph,
    hotspot_count: scorecard.hotspotCount,
  };
}

export function serializeRouteScorecardCitations(
  scorecard: RouteScorecard,
): RouteScorecardCitationRow[] {
  return scorecard.citations.map((citation, index) => ({
    route_id: scorecard.routeId,
    month: scorecard.month,
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
  if (citations.length === 0) {
    throw new Error(`Route scorecard ${row.route_id}/${row.month} has no citations`);
  }

  return decodeStrict(RouteScorecardSchema)({
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
  const rows = await selectRouteScorecardRows(db, routeId, month);
  const row = rows[0] ?? null;

  if (row === null) {
    return null;
  }

  const citations = await selectRouteScorecardCitationRows(db, routeId, month);

  return deserializeRouteScorecard(row, citations);
}

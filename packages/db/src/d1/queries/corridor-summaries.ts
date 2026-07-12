import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import {
  corridor,
  corridorHotspot,
  corridorInterventionContext,
  corridorMonthSummary,
  corridorRouteMember,
} from "../schema.js";

async function selectCorridorRows(db: D1ServingDb) {
  return db
    .select({
      corridor_id: corridor.corridorId,
      corridor_name: corridor.corridorName,
      corridor_key: corridor.corridorKey,
      derivation_method: corridor.derivationMethod,
    })
    .from(corridor)
    .orderBy(asc(corridor.corridorId));
}

async function selectCorridorMonthSummaryRows(db: D1ServingDb, month: string) {
  return db
    .select({
      corridor_id: corridorMonthSummary.corridorId,
      month: corridorMonthSummary.month,
      route_count: corridorMonthSummary.routeCount,
      assigned_route_count: corridorMonthSummary.assignedRouteCount,
      ambiguous_route_count: corridorMonthSummary.ambiguousRouteCount,
      unassigned_route_count: corridorMonthSummary.unassignedRouteCount,
      total_ridership: corridorMonthSummary.totalRidership,
      total_transfers: corridorMonthSummary.totalTransfers,
      weighted_average_speed_mph: corridorMonthSummary.weightedAverageSpeedMph,
      hotspot_count: corridorMonthSummary.hotspotCount,
      observed_reliability_route_count: corridorMonthSummary.observedReliabilityRouteCount,
      insufficient_reliability_route_count: corridorMonthSummary.insufficientReliabilityRouteCount,
      intervention_comparison_count: corridorMonthSummary.interventionComparisonCount,
      evaluated_intervention_comparison_count:
        corridorMonthSummary.evaluatedInterventionComparisonCount,
    })
    .from(corridorMonthSummary)
    .where(eq(corridorMonthSummary.month, month))
    .orderBy(asc(corridorMonthSummary.corridorId));
}

async function selectCorridorRouteMemberRows(db: D1ServingDb, month: string) {
  return db
    .select({
      corridor_id: corridorRouteMember.corridorId,
      month: corridorRouteMember.month,
      route_id: corridorRouteMember.routeId,
      assignment_status: corridorRouteMember.assignmentStatus,
      assignment_reason: corridorRouteMember.assignmentReason,
      stop_count: corridorRouteMember.stopCount,
      matched_stop_count: corridorRouteMember.matchedStopCount,
      hotspot_count: corridorRouteMember.hotspotCount,
      matched_segment_count: corridorRouteMember.matchedSegmentCount,
      segment_evidence_score: corridorRouteMember.segmentEvidenceScore,
      total_ridership: corridorRouteMember.totalRidership,
      average_speed_mph: corridorRouteMember.averageSpeedMph,
    })
    .from(corridorRouteMember)
    .where(eq(corridorRouteMember.month, month))
    .orderBy(asc(corridorRouteMember.corridorId), asc(corridorRouteMember.routeId));
}

async function selectCorridorHotspotRows(db: D1ServingDb, month: string) {
  return db
    .select({
      corridor_id: corridorHotspot.corridorId,
      month: corridorHotspot.month,
      corridor_hotspot_rank: corridorHotspot.corridorHotspotRank,
      route_id: corridorHotspot.routeId,
      route_hotspot_rank: corridorHotspot.routeHotspotRank,
      from_stop_name: corridorHotspot.fromStopName,
      to_stop_name: corridorHotspot.toStopName,
      weighted_average_speed_mph: corridorHotspot.weightedAverageSpeedMph,
      hotspot_score: corridorHotspot.hotspotScore,
      rider_impact_score: corridorHotspot.riderImpactScore,
    })
    .from(corridorHotspot)
    .where(eq(corridorHotspot.month, month))
    .orderBy(asc(corridorHotspot.corridorId), asc(corridorHotspot.corridorHotspotRank));
}

async function selectCorridorInterventionContextRows(db: D1ServingDb, month: string) {
  return db
    .select({
      corridor_id: corridorInterventionContext.corridorId,
      month: corridorInterventionContext.month,
      context_rank: corridorInterventionContext.contextRank,
      route_id: corridorInterventionContext.routeId,
      event_id: corridorInterventionContext.eventId,
      intervention_type: corridorInterventionContext.interventionType,
      source_id: corridorInterventionContext.sourceId,
      program: corridorInterventionContext.program,
      implementation_month: corridorInterventionContext.implementationMonth,
      event_status: corridorInterventionContext.eventStatus,
      evaluation_level: corridorInterventionContext.evaluationLevel,
      comparison_status: corridorInterventionContext.comparisonStatus,
      speed_delta_mph: corridorInterventionContext.speedDeltaMph,
      adjusted_speed_delta_mph: corridorInterventionContext.adjustedSpeedDeltaMph,
      ridership_delta: corridorInterventionContext.ridershipDelta,
      adjusted_ridership_delta: corridorInterventionContext.adjustedRidershipDelta,
      comparison_route_count: corridorInterventionContext.comparisonRouteCount,
      caveat: corridorInterventionContext.caveat,
    })
    .from(corridorInterventionContext)
    .where(eq(corridorInterventionContext.month, month))
    .orderBy(
      asc(corridorInterventionContext.corridorId),
      asc(corridorInterventionContext.contextRank),
    );
}

export type CorridorRow = Awaited<ReturnType<typeof selectCorridorRows>>[number];
export type CorridorMonthSummaryRow = Awaited<
  ReturnType<typeof selectCorridorMonthSummaryRows>
>[number];
export type CorridorRouteMemberRow = Awaited<
  ReturnType<typeof selectCorridorRouteMemberRows>
>[number];
export type CorridorHotspotRow = Awaited<ReturnType<typeof selectCorridorHotspotRows>>[number];
export type CorridorInterventionContextRow = Awaited<
  ReturnType<typeof selectCorridorInterventionContextRows>
>[number];

export type CorridorSummary = {
  corridorId: string;
  corridorName: string;
  corridorKey: string;
  derivationMethod: string;
  month: string;
  routeCount: number;
  assignedRouteCount: number;
  ambiguousRouteCount: number;
  unassignedRouteCount: number;
  totalRidership: number;
  totalTransfers: number;
  weightedAverageSpeedMph: number | null;
  hotspotCount: number;
  observedReliabilityRouteCount: number;
  insufficientReliabilityRouteCount: number;
  interventionComparisonCount: number;
  evaluatedInterventionComparisonCount: number;
  routeMembers: CorridorRouteMemberRow[];
  topHotspots: CorridorHotspotRow[];
  interventionContext: CorridorInterventionContextRow[];
};

function groupByCorridor<T extends { corridor_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const output = new Map<string, T[]>();
  for (const row of rows) {
    const group = output.get(row.corridor_id) ?? [];
    group.push(row);
    output.set(row.corridor_id, group);
  }
  return output;
}

export async function listCorridorSummaries(
  db: D1ServingDb,
  month: string,
): Promise<CorridorSummary[]> {
  const [corridorRows, summaryRows, memberRows, hotspotRows, interventionContextRows] =
    await Promise.all([
      selectCorridorRows(db),
      selectCorridorMonthSummaryRows(db, month),
      selectCorridorRouteMemberRows(db, month),
      selectCorridorHotspotRows(db, month),
      selectCorridorInterventionContextRows(db, month),
    ]);
  const corridorsById = new Map(corridorRows.map((row) => [row.corridor_id, row]));
  const members = groupByCorridor(memberRows);
  const hotspots = groupByCorridor(hotspotRows);
  const interventionContexts = groupByCorridor(interventionContextRows);

  return summaryRows.map((row) => {
    const corridorRow = corridorsById.get(row.corridor_id);
    if (corridorRow === undefined) {
      throw new Error(`Missing corridor row for ${row.corridor_id}`);
    }

    return {
      corridorId: row.corridor_id,
      corridorName: corridorRow.corridor_name,
      corridorKey: corridorRow.corridor_key,
      derivationMethod: corridorRow.derivation_method,
      month: row.month,
      routeCount: row.route_count,
      assignedRouteCount: row.assigned_route_count,
      ambiguousRouteCount: row.ambiguous_route_count,
      unassignedRouteCount: row.unassigned_route_count,
      totalRidership: row.total_ridership,
      totalTransfers: row.total_transfers,
      weightedAverageSpeedMph: row.weighted_average_speed_mph,
      hotspotCount: row.hotspot_count,
      observedReliabilityRouteCount: row.observed_reliability_route_count,
      insufficientReliabilityRouteCount: row.insufficient_reliability_route_count,
      interventionComparisonCount: row.intervention_comparison_count,
      evaluatedInterventionComparisonCount: row.evaluated_intervention_comparison_count,
      routeMembers: members.get(row.corridor_id) ?? [],
      topHotspots: hotspots.get(row.corridor_id) ?? [],
      interventionContext: interventionContexts.get(row.corridor_id) ?? [],
    };
  });
}

import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import {
  corridor,
  corridorHotspot,
  corridorInterventionContext,
  corridorMonthSummary,
  corridorRouteMember,
} from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const CorridorRowSchema = z
  .object({
    corridor_id: z.string().min(1),
    corridor_name: z.string().min(1),
    corridor_key: z.string().min(1),
    derivation_method: z.string().min(1),
  })
  .strict();

const CorridorMonthSummaryRowSchema = z
  .object({
    corridor_id: z.string().min(1),
    month: IsoMonthSchema,
    route_count: z.number().int().nonnegative(),
    assigned_route_count: z.number().int().nonnegative(),
    ambiguous_route_count: z.number().int().nonnegative(),
    unassigned_route_count: z.number().int().nonnegative(),
    total_ridership: z.number().nonnegative(),
    total_transfers: z.number().nonnegative(),
    weighted_average_speed_mph: z.number().nonnegative().nullable(),
    hotspot_count: z.number().int().nonnegative(),
    observed_reliability_route_count: z.number().int().nonnegative(),
    insufficient_reliability_route_count: z.number().int().nonnegative(),
    intervention_comparison_count: z.number().int().nonnegative(),
    evaluated_intervention_comparison_count: z.number().int().nonnegative(),
  })
  .strict();

const CorridorRouteMemberRowSchema = z
  .object({
    corridor_id: z.string().min(1),
    month: IsoMonthSchema,
    route_id: z.string().min(1),
    assignment_status: z.enum(["assigned", "ambiguous", "unassigned"]),
    assignment_reason: z.string().min(1),
    stop_count: z.number().int().nonnegative(),
    matched_stop_count: z.number().int().nonnegative(),
    hotspot_count: z.number().int().nonnegative(),
    matched_segment_count: z.number().int().nonnegative(),
    segment_evidence_score: z.number().nonnegative(),
    total_ridership: z.number().nonnegative(),
    average_speed_mph: z.number().nonnegative(),
  })
  .strict();

const CorridorHotspotRowSchema = z
  .object({
    corridor_id: z.string().min(1),
    month: IsoMonthSchema,
    corridor_hotspot_rank: z.number().int().positive(),
    route_id: z.string().min(1),
    route_hotspot_rank: z.number().int().positive(),
    from_stop_name: z.string().min(1),
    to_stop_name: z.string().min(1),
    weighted_average_speed_mph: z.number().nonnegative(),
    hotspot_score: z.number().int().nonnegative(),
    rider_impact_score: z.number().int().nonnegative().nullable(),
  })
  .strict();

const CorridorInterventionContextRowSchema = z
  .object({
    corridor_id: z.string().min(1),
    month: IsoMonthSchema,
    context_rank: z.number().int().positive(),
    route_id: z.string().min(1),
    event_id: z.string().min(1),
    intervention_type: z.string().min(1),
    source_id: z.string().min(1),
    program: z.string().min(1),
    implementation_month: IsoMonthSchema,
    event_status: z.enum(["implemented", "future", "source_gap"]),
    evaluation_level: z.enum([
      "descriptive_before_after",
      "peer_adjusted_before_after",
      "insufficient_trend_data",
      "not_evaluated_future",
      "not_evaluated_source_gap",
    ]),
    comparison_status: z.enum([
      "evaluated",
      "future_intervention",
      "insufficient_pre_data",
      "insufficient_post_data",
      "source_gap_missing_implementation_date",
    ]),
    speed_delta_mph: z.number().nullable(),
    adjusted_speed_delta_mph: z.number().nullable(),
    ridership_delta: z.number().nullable(),
    adjusted_ridership_delta: z.number().nullable(),
    comparison_route_count: z.number().int().nonnegative(),
    caveat: z.string().min(1),
  })
  .strict();

export type CorridorRow = z.output<typeof CorridorRowSchema>;
export type CorridorMonthSummaryRow = z.output<typeof CorridorMonthSummaryRowSchema>;
export type CorridorRouteMemberRow = z.output<typeof CorridorRouteMemberRowSchema>;
export type CorridorHotspotRow = z.output<typeof CorridorHotspotRowSchema>;
export type CorridorInterventionContextRow = z.output<typeof CorridorInterventionContextRowSchema>;

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
      db
        .select({
          corridor_id: corridor.corridorId,
          corridor_name: corridor.corridorName,
          corridor_key: corridor.corridorKey,
          derivation_method: corridor.derivationMethod,
        })
        .from(corridor)
        .orderBy(asc(corridor.corridorId)),
      db
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
          insufficient_reliability_route_count:
            corridorMonthSummary.insufficientReliabilityRouteCount,
          intervention_comparison_count: corridorMonthSummary.interventionComparisonCount,
          evaluated_intervention_comparison_count:
            corridorMonthSummary.evaluatedInterventionComparisonCount,
        })
        .from(corridorMonthSummary)
        .where(eq(corridorMonthSummary.month, month))
        .orderBy(asc(corridorMonthSummary.corridorId)),
      db
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
        .orderBy(asc(corridorRouteMember.corridorId), asc(corridorRouteMember.routeId)),
      db
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
        .orderBy(asc(corridorHotspot.corridorId), asc(corridorHotspot.corridorHotspotRank)),
      db
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
        ),
    ]);
  const corridorsById = new Map(
    corridorRows.map((row) => {
      const parsed = CorridorRowSchema.parse(row);
      return [parsed.corridor_id, parsed];
    }),
  );
  const members = groupByCorridor(memberRows.map((row) => CorridorRouteMemberRowSchema.parse(row)));
  const hotspots = groupByCorridor(hotspotRows.map((row) => CorridorHotspotRowSchema.parse(row)));
  const interventionContexts = groupByCorridor(
    interventionContextRows.map((row) => CorridorInterventionContextRowSchema.parse(row)),
  );

  return summaryRows.map((row) => {
    const summary = CorridorMonthSummaryRowSchema.parse(row);
    const corridorRow = corridorsById.get(summary.corridor_id);
    if (corridorRow === undefined) {
      throw new Error(`Missing corridor row for ${summary.corridor_id}`);
    }

    return {
      corridorId: summary.corridor_id,
      corridorName: corridorRow.corridor_name,
      corridorKey: corridorRow.corridor_key,
      derivationMethod: corridorRow.derivation_method,
      month: summary.month,
      routeCount: summary.route_count,
      assignedRouteCount: summary.assigned_route_count,
      ambiguousRouteCount: summary.ambiguous_route_count,
      unassignedRouteCount: summary.unassigned_route_count,
      totalRidership: summary.total_ridership,
      totalTransfers: summary.total_transfers,
      weightedAverageSpeedMph: summary.weighted_average_speed_mph,
      hotspotCount: summary.hotspot_count,
      observedReliabilityRouteCount: summary.observed_reliability_route_count,
      insufficientReliabilityRouteCount: summary.insufficient_reliability_route_count,
      interventionComparisonCount: summary.intervention_comparison_count,
      evaluatedInterventionComparisonCount: summary.evaluated_intervention_comparison_count,
      routeMembers: members.get(summary.corridor_id) ?? [],
      topHotspots: hotspots.get(summary.corridor_id) ?? [],
      interventionContext: interventionContexts.get(summary.corridor_id) ?? [],
    };
  });
}

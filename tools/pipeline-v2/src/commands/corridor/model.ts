import { arg, defineCommand, z } from "@liche/core";
import {
  type LocalCorridorInterventionContext,
  type LocalCorridorRouteMember,
  type LocalInterventionEvent,
  type LocalRouteBriefSummary,
  type LocalRouteHotspot,
  type LocalRouteInterventionComparison,
  type LocalRouteStop,
  listInterventionEvents,
  listRouteBriefSummaries,
  listRouteHotspots,
  listRouteInterventionComparisons,
  listRouteObservedReliabilitySummaries,
  listRouteStops,
  replaceCorridorRows,
} from "@bp/db/local";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";

const defaultHotspotLimit = 10;

export type CorridorModelResult = {
  isoMonth: string;
  publicRouteCount: number;
  corridorCount: number;
  assignedRouteCount: number;
  ambiguousRouteCount: number;
  unassignedRouteCount: number;
  corridorHotspotCount: number;
  corridorInterventionContextCount: number;
};

type CorridorAssignment = {
  corridorId: string;
  corridorName: string;
  corridorKey: string;
  assignmentStatus: "assigned" | "ambiguous" | "unassigned";
  assignmentReason: string;
  stopCount: number;
  matchedStopCount: number;
  matchedSegmentCount: number;
  segmentEvidenceScore: number;
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeStreetName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\bAV\b/g, "AVENUE")
    .replace(/\bAVE\b/g, "AVENUE")
    .replace(/\bST\b/g, "STREET")
    .replace(/\bBLVD\b/g, "BOULEVARD")
    .replace(/\bRD\b/g, "ROAD")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streetFromStopName(stopName: string): string | null {
  const value = normalizeStreetName(stopName.split("/")[0] ?? stopName);
  return value.length === 0 ? null : value;
}

function corridorSlug(corridorKey: string): string {
  return corridorKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function corridorIdFor(corridorKey: string): string {
  return `street:${corridorSlug(corridorKey)}`;
}

function corridorNameFor(corridorKey: string): string {
  return corridorKey
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => (part.length <= 2 ? part : `${part[0]}${part.slice(1).toLowerCase()}`))
    .join(" ");
}

function stopStreetCounts(stops: readonly LocalRouteStop[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const stop of stops) {
    const street = streetFromStopName(stop.stopName);
    if (street !== null) counts.set(street, (counts.get(street) ?? 0) + 1);
  }
  return counts;
}

type SegmentStreetEvidence = {
  street: string;
  score: number;
  segmentIds: Set<string>;
};

function segmentStreetEvidence(hotspots: readonly LocalRouteHotspot[]): SegmentStreetEvidence[] {
  const evidence = new Map<string, SegmentStreetEvidence>();
  for (const hotspot of hotspots) {
    const streets = new Set(
      [
        streetFromStopName(hotspot.timepointStopName),
        streetFromStopName(hotspot.nextTimepointStopName),
      ].filter((street): street is string => street !== null),
    );
    for (const street of streets) {
      const current = evidence.get(street) ?? {
        street,
        score: 0,
        segmentIds: new Set<string>(),
      };
      current.score += hotspot.hotspotScore;
      current.segmentIds.add(hotspot.segmentId);
      evidence.set(street, current);
    }
  }
  return [...evidence.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.segmentIds.size - left.segmentIds.size ||
      left.street.localeCompare(right.street),
  );
}

function assignCorridor(
  routeId: string,
  stops: readonly LocalRouteStop[],
  hotspots: readonly LocalRouteHotspot[],
): CorridorAssignment {
  const counts = stopStreetCounts(stops);
  const segmentEvidence = segmentStreetEvidence(hotspots);
  const topSegment = segmentEvidence[0];
  if (topSegment !== undefined) {
    const secondSegment = segmentEvidence[1];
    const ambiguous = secondSegment !== undefined && secondSegment.score === topSegment.score;
    return {
      corridorId: corridorIdFor(topSegment.street),
      corridorName: corridorNameFor(topSegment.street),
      corridorKey: topSegment.street,
      assignmentStatus: ambiguous ? "ambiguous" : "assigned",
      assignmentReason: ambiguous
        ? "ambiguous_hotspot_segment_street"
        : "primary_hotspot_segment_street",
      stopCount: stops.length,
      matchedStopCount: counts.get(topSegment.street) ?? 0,
      matchedSegmentCount: topSegment.segmentIds.size,
      segmentEvidenceScore: round(topSegment.score),
    };
  }

  const ranked = [...counts.entries()].sort(
    ([leftStreet, leftCount], [rightStreet, rightCount]) =>
      rightCount - leftCount || leftStreet.localeCompare(rightStreet),
  );
  const top = ranked[0];
  if (top === undefined) {
    const corridorId = `unassigned:${routeId.toLowerCase()}`;
    return {
      corridorId,
      corridorName: `Unassigned ${routeId}`,
      corridorKey: corridorId,
      assignmentStatus: "unassigned",
      assignmentReason: stops.length === 0 ? "no_route_stops" : "no_parseable_stop_street",
      stopCount: stops.length,
      matchedStopCount: 0,
      matchedSegmentCount: 0,
      segmentEvidenceScore: 0,
    };
  }

  const [corridorKey, matchedStopCount] = top;
  const second = ranked[1];
  const ambiguous = second !== undefined && second[1] === matchedStopCount;
  return {
    corridorId: corridorIdFor(corridorKey),
    corridorName: corridorNameFor(corridorKey),
    corridorKey,
    assignmentStatus: ambiguous ? "ambiguous" : "assigned",
    assignmentReason: ambiguous ? "ambiguous_primary_stop_street" : "primary_stop_street",
    stopCount: stops.length,
    matchedStopCount,
    matchedSegmentCount: 0,
    segmentEvidenceScore: 0,
  };
}

function hotspotMatchesCorridor(hotspot: LocalRouteHotspot, corridorKey: string): boolean {
  return (
    streetFromStopName(hotspot.timepointStopName) === corridorKey ||
    streetFromStopName(hotspot.nextTimepointStopName) === corridorKey
  );
}

function routeMember(input: {
  brief: LocalRouteBriefSummary;
  assignment: CorridorAssignment;
  hotspotCount: number;
}): LocalCorridorRouteMember {
  return {
    corridorId: input.assignment.corridorId,
    month: input.brief.month,
    routeId: input.brief.routeId,
    assignmentStatus: input.assignment.assignmentStatus,
    assignmentReason: input.assignment.assignmentReason,
    stopCount: input.assignment.stopCount,
    matchedStopCount: input.assignment.matchedStopCount,
    hotspotCount: input.hotspotCount,
    matchedSegmentCount: input.assignment.matchedSegmentCount,
    segmentEvidenceScore: input.assignment.segmentEvidenceScore,
    totalRidership: input.brief.totalRidership,
    averageSpeedMph: input.brief.averageSpeedMph,
  };
}

function groupByCorridor<T extends { corridorId: string }>(rows: readonly T[]): Map<string, T[]> {
  const output = new Map<string, T[]>();
  for (const row of rows) {
    const group = output.get(row.corridorId) ?? [];
    group.push(row);
    output.set(row.corridorId, group);
  }
  return output;
}

function interventionStatusPriority(row: LocalRouteInterventionComparison): number {
  switch (row.comparisonStatus) {
    case "evaluated":
      return row.evaluationLevel === "peer_adjusted_before_after" ? 0 : 1;
    case "insufficient_pre_data":
    case "insufficient_post_data":
      return 2;
    case "future_intervention":
      return 3;
    case "source_gap_missing_implementation_date":
      return 4;
    default:
      return 5;
  }
}

function interventionDeltaScore(row: LocalRouteInterventionComparison): number {
  return row.adjustedSpeedDeltaMph ?? row.speedDeltaMph ?? Number.NEGATIVE_INFINITY;
}

function buildCorridorInterventionContexts(input: {
  isoMonth: string;
  membersByCorridor: Map<string, LocalCorridorRouteMember[]>;
  interventionsByRoute: Map<string, LocalRouteInterventionComparison[]>;
  eventsById: Map<string, LocalInterventionEvent>;
}): LocalCorridorInterventionContext[] {
  return [...input.membersByCorridor.entries()].flatMap(([corridorId, members]) => {
    const routeIds = new Set(members.map((member) => member.routeId));
    return [...routeIds]
      .flatMap((routeId) => input.interventionsByRoute.get(routeId) ?? [])
      .map((row) => {
        const event = input.eventsById.get(row.eventId);
        if (event === undefined)
          throw new Error(`Missing intervention event ${row.eventId} for corridor ${corridorId}`);
        return { row, event };
      })
      .sort((left, right) => {
        const priorityDelta =
          interventionStatusPriority(left.row) - interventionStatusPriority(right.row);
        if (priorityDelta !== 0) return priorityDelta;
        const deltaScore = interventionDeltaScore(right.row) - interventionDeltaScore(left.row);
        if (deltaScore !== 0) return deltaScore;
        return (
          left.row.routeId.localeCompare(right.row.routeId) ||
          left.row.eventId.localeCompare(right.row.eventId)
        );
      })
      .map(({ row, event }, index) => ({
        corridorId,
        month: input.isoMonth,
        contextRank: index + 1,
        routeId: row.routeId,
        eventId: row.eventId,
        interventionType: row.interventionType,
        sourceId: row.sourceId,
        program: event.program,
        implementationMonth: event.implementationMonth,
        eventStatus: event.eventStatus,
        evaluationLevel: row.evaluationLevel,
        comparisonStatus: row.comparisonStatus,
        speedDeltaMph: row.speedDeltaMph,
        adjustedSpeedDeltaMph: row.adjustedSpeedDeltaMph,
        ridershipDelta: row.ridershipDelta,
        adjustedRidershipDelta: row.adjustedRidershipDelta,
        comparisonRouteCount: row.comparisonRouteCount,
        caveat: row.caveat,
      }));
  });
}

export async function runCorridorModel(inputs: {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  hotspotLimit: number;
}): Promise<CorridorModelResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const hotspotLimit = Math.max(1, Math.round(inputs.hotspotLimit));

  const [briefs, reliabilityRows, interventionRows, interventionEvents] = await Promise.all([
    listRouteBriefSummaries(inputs.local.db, month),
    listRouteObservedReliabilitySummaries(inputs.local.db, month),
    listRouteInterventionComparisons(inputs.local.db, month),
    listInterventionEvents(inputs.local.db),
  ]);
  const publicBriefs = briefs.filter((brief) => brief.publicVisible);
  const reliabilityByRoute = new Map(
    reliabilityRows.map((row) => [row.routeId, row.reliabilityStatus]),
  );
  const interventionsByRoute = new Map<string, typeof interventionRows>();
  for (const row of interventionRows) {
    const group = interventionsByRoute.get(row.routeId) ?? [];
    group.push(row);
    interventionsByRoute.set(row.routeId, group);
  }
  const eventsById = new Map(interventionEvents.map((event) => [event.eventId, event]));

  const corridors = new Map<
    string,
    { corridorId: string; corridorName: string; corridorKey: string; derivationMethod: string }
  >();
  const routeMembers: LocalCorridorRouteMember[] = [];
  const routeHotspots = new Map<string, LocalRouteHotspot[]>();

  for (const brief of publicBriefs) {
    const [stops, hotspots] = await Promise.all([
      listRouteStops(inputs.local.db, brief.routeId, month),
      listRouteHotspots(inputs.local.db, brief.routeId, month),
    ]);
    const assignment = assignCorridor(brief.routeId, stops, hotspots);
    corridors.set(assignment.corridorId, {
      corridorId: assignment.corridorId,
      corridorName: assignment.corridorName,
      corridorKey: assignment.corridorKey,
      derivationMethod:
        assignment.assignmentStatus === "unassigned"
          ? "unassigned_route_placeholder"
          : assignment.assignmentReason.endsWith("hotspot_segment_street")
            ? "primary_route_hotspot_segment_street"
            : "primary_route_stop_street",
    });
    routeMembers.push(
      routeMember({
        brief,
        assignment,
        hotspotCount: hotspots.length,
      }),
    );
    routeHotspots.set(brief.routeId, hotspots);
  }

  const briefsByRoute = new Map(publicBriefs.map((brief) => [brief.routeId, brief]));
  const membersByCorridor = groupByCorridor(routeMembers);
  const interventionContexts = buildCorridorInterventionContexts({
    isoMonth: month,
    membersByCorridor,
    interventionsByRoute,
    eventsById,
  });
  const summaries = [...membersByCorridor.entries()].map(([corridorId, members]) => {
    const memberBriefs = members
      .map((member) => briefsByRoute.get(member.routeId))
      .filter((brief): brief is LocalRouteBriefSummary => brief !== undefined);
    const totalRidership = memberBriefs.reduce((sum, brief) => sum + brief.totalRidership, 0);
    const speedWeight =
      totalRidership > 0 ? totalRidership : memberBriefs.reduce((sum) => sum + 1, 0);
    const weightedAverageSpeedMph =
      memberBriefs.length === 0 || speedWeight <= 0
        ? null
        : round(
            memberBriefs.reduce((sum, brief) => {
              const weight = totalRidership > 0 ? brief.totalRidership : 1;
              return sum + brief.averageSpeedMph * weight;
            }, 0) / speedWeight,
          );
    const routeIds = new Set(members.map((member) => member.routeId));
    const comparisonRows = [...routeIds].flatMap(
      (routeId) => interventionsByRoute.get(routeId) ?? [],
    );
    return {
      corridorId,
      month,
      routeCount: members.length,
      assignedRouteCount: members.filter((member) => member.assignmentStatus === "assigned").length,
      ambiguousRouteCount: members.filter((member) => member.assignmentStatus === "ambiguous")
        .length,
      unassignedRouteCount: members.filter((member) => member.assignmentStatus === "unassigned")
        .length,
      totalRidership: round(totalRidership),
      totalTransfers: round(memberBriefs.reduce((sum, brief) => sum + brief.totalTransfers, 0)),
      weightedAverageSpeedMph,
      hotspotCount: members.reduce((sum, member) => sum + member.hotspotCount, 0),
      observedReliabilityRouteCount: [...routeIds].filter(
        (routeId) => reliabilityByRoute.get(routeId) === "observed",
      ).length,
      insufficientReliabilityRouteCount: [...routeIds].filter(
        (routeId) => reliabilityByRoute.get(routeId) === "insufficient_gtfs_rt_samples",
      ).length,
      interventionComparisonCount: comparisonRows.length,
      evaluatedInterventionComparisonCount: comparisonRows.filter(
        (row) => row.comparisonStatus === "evaluated",
      ).length,
    };
  });

  const hotspots = [...membersByCorridor.entries()].flatMap(([corridorId, members]) => {
    const corridor = corridors.get(corridorId);
    if (corridor === undefined || corridor.derivationMethod === "unassigned_route_placeholder")
      return [];
    const matchingHotspots = members.flatMap((member) =>
      (routeHotspots.get(member.routeId) ?? [])
        .filter((hotspot) => hotspotMatchesCorridor(hotspot, corridor.corridorKey))
        .map((hotspot) => ({ member, hotspot })),
    );
    return matchingHotspots
      .sort(
        (left, right) =>
          right.hotspot.hotspotScore - left.hotspot.hotspotScore ||
          left.hotspot.weightedAverageSpeedMph - right.hotspot.weightedAverageSpeedMph,
      )
      .slice(0, hotspotLimit)
      .map(({ hotspot }, index) => ({
        corridorId,
        month,
        corridorHotspotRank: index + 1,
        routeId: hotspot.routeId,
        routeHotspotRank: hotspot.hotspotRank ?? index + 1,
        fromStopName: hotspot.timepointStopName,
        toStopName: hotspot.nextTimepointStopName,
        weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
        hotspotScore: hotspot.hotspotScore,
        riderImpactScore: hotspot.riderImpactScore ?? null,
      }));
  });

  await replaceCorridorRows(inputs.local.db, month, {
    corridors: [...corridors.values()],
    routeMembers,
    summaries,
    interventionContexts,
    hotspots,
  });

  return {
    isoMonth: month,
    publicRouteCount: routeMembers.length,
    corridorCount: corridors.size,
    assignedRouteCount: routeMembers.filter((member) => member.assignmentStatus === "assigned")
      .length,
    ambiguousRouteCount: routeMembers.filter((member) => member.assignmentStatus === "ambiguous")
      .length,
    unassignedRouteCount: routeMembers.filter((member) => member.assignmentStatus === "unassigned")
      .length,
    corridorHotspotCount: hotspots.length,
    corridorInterventionContextCount: interventionContexts.length,
  };
}

export default defineCommand({
  path: ["corridor", "model"],
  summary: "Derive corridor groupings from route hotspots and stop streets.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      hotspotLimit: arg
        .positiveInt()
        .default(defaultHotspotLimit)
        .describe("Max hotspots per corridor"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    publicRouteCount: z.number(),
    corridorCount: z.number(),
    assignedRouteCount: z.number(),
    ambiguousRouteCount: z.number(),
    unassignedRouteCount: z.number(),
    corridorHotspotCount: z.number(),
    corridorInterventionContextCount: z.number(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "corridor.model",
      operation: "runCorridorModel",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        hotspotLimit: input.options.hotspotLimit,
      },
      run: (local) =>
        runCorridorModel({
          local,
          year: input.options.year,
          month: input.options.month,
          hotspotLimit: input.options.hotspotLimit,
        }),
    });
  },
});

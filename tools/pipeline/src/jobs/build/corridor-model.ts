import {
  type LocalCorridorRouteMember,
  type LocalRouteBriefSummary,
  type LocalRouteHotspot,
  type LocalRouteStop,
  listRouteBriefSummaries,
  listRouteHotspots,
  listRouteInterventionComparisons,
  listRouteObservedReliabilitySummaries,
  listRouteStops,
  replaceCorridorRows,
} from "@bp/db/local";
import { type CliOption, numberOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

const defaultHotspotLimit = 10;

type CorridorModelArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  hotspotLimit?: number;
};

type CorridorModelResult = {
  isoMonth: string;
  publicRouteCount: number;
  corridorCount: number;
  assignedRouteCount: number;
  ambiguousRouteCount: number;
  unassignedRouteCount: number;
  corridorHotspotCount: number;
};

type CorridorAssignment = {
  corridorId: string;
  corridorName: string;
  corridorKey: string;
  assignmentStatus: "assigned" | "ambiguous" | "unassigned";
  assignmentReason: string;
  stopCount: number;
  matchedStopCount: number;
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

function assignCorridor(routeId: string, stops: readonly LocalRouteStop[]): CorridorAssignment {
  const counts = new Map<string, number>();
  for (const stop of stops) {
    const street = streetFromStopName(stop.stopName);
    if (street !== null) {
      counts.set(street, (counts.get(street) ?? 0) + 1);
    }
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

function parseCliArgs(args: string[]): CorridorModelArgs {
  const extraOptions: CliOption<CorridorModelArgs>[] = [
    numberOption(["--hotspot-limit"], (output, value) => {
      output.hotspotLimit = value;
    }),
  ];

  return parseMonthDbCliArgs(args, {} as CorridorModelArgs, extraOptions);
}

export async function buildCorridorModel(
  args: CorridorModelArgs = {},
): Promise<CorridorModelResult> {
  const options = createMonthContext(args);
  const hotspotLimit = Math.max(1, Math.round(args.hotspotLimit ?? defaultHotspotLimit));

  const rows = await withLocalPipelineDb(options.dbPath, async (local) => {
    const [briefs, reliabilityRows, interventionRows] = await Promise.all([
      listRouteBriefSummaries(local.db, options.isoMonth),
      listRouteObservedReliabilitySummaries(local.db, options.isoMonth),
      listRouteInterventionComparisons(local.db, options.isoMonth),
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

    const corridors = new Map<
      string,
      { corridorId: string; corridorName: string; corridorKey: string; derivationMethod: string }
    >();
    const routeMembers: LocalCorridorRouteMember[] = [];
    const routeHotspots = new Map<string, LocalRouteHotspot[]>();

    for (const brief of publicBriefs) {
      const [stops, hotspots] = await Promise.all([
        listRouteStops(local.db, brief.routeId, options.isoMonth),
        listRouteHotspots(local.db, brief.routeId, options.isoMonth),
      ]);
      const assignment = assignCorridor(brief.routeId, stops);
      corridors.set(assignment.corridorId, {
        corridorId: assignment.corridorId,
        corridorName: assignment.corridorName,
        corridorKey: assignment.corridorKey,
        derivationMethod:
          assignment.assignmentStatus === "unassigned"
            ? "unassigned_route_placeholder"
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
        month: options.isoMonth,
        routeCount: members.length,
        assignedRouteCount: members.filter((member) => member.assignmentStatus === "assigned")
          .length,
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
      if (corridor === undefined || corridor.derivationMethod === "unassigned_route_placeholder") {
        return [];
      }
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
          month: options.isoMonth,
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

    await replaceCorridorRows(local.db, options.isoMonth, {
      corridors: [...corridors.values()],
      routeMembers,
      summaries,
      hotspots,
    });

    return {
      corridors: [...corridors.values()],
      routeMembers,
      hotspots,
    };
  });

  return {
    isoMonth: options.isoMonth,
    publicRouteCount: rows.routeMembers.length,
    corridorCount: rows.corridors.length,
    assignedRouteCount: rows.routeMembers.filter((member) => member.assignmentStatus === "assigned")
      .length,
    ambiguousRouteCount: rows.routeMembers.filter(
      (member) => member.assignmentStatus === "ambiguous",
    ).length,
    unassignedRouteCount: rows.routeMembers.filter(
      (member) => member.assignmentStatus === "unassigned",
    ).length,
    corridorHotspotCount: rows.hotspots.length,
  };
}

export function buildCorridorModelFromCli(args: string[]): Promise<CorridorModelResult> {
  return buildCorridorModel(parseCliArgs(args));
}

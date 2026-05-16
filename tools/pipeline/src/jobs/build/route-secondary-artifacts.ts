import {
  listAceRoutesForRoute,
  listAceViolationSummariesForRoute,
  listBusLanes,
  listRouteHotspots,
  listRouteSchedules,
  listRouteStops,
} from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createRouteMonthContext, parseRouteMonthDbCliArgs } from "../../lib/route-job.js";
import {
  aceInterventionSummary,
  busLaneMatches,
  scheduleComparisons,
} from "./route-brief-metrics.js";

type RouteArtifactArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

type BusLaneOverlayResult = {
  routeId: string;
  isoMonth: string;
  matchedLaneCount: number;
  matchedStreetCount: number;
};

type InterventionOverlayResult = {
  routeId: string;
  isoMonth: string;
  aceRouteMatchCount: number;
  activeProgramCount: number;
};

type ScheduleComparisonResult = {
  routeId: string;
  isoMonth: string;
  scheduledPairCount: number;
  matchedHotspotCount: number;
};

function parseBuildArgs(args: RouteArtifactArgs) {
  return createRouteMonthContext(args);
}

function parseCliArgs(args: string[]): RouteArtifactArgs {
  return parseRouteMonthDbCliArgs(args, {} as RouteArtifactArgs);
}

export async function buildRouteBusLaneOverlay(
  args: RouteArtifactArgs = {},
): Promise<BusLaneOverlayResult> {
  const options = parseBuildArgs(args);
  const routeId = z.decode(RouteIdCodec, options.routeId);
  const [stops, busLanes] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([listRouteStops(local.db, routeId, options.isoMonth), listBusLanes(local.db)]),
  );
  const matched = busLaneMatches(busLanes, stops);
  const matchedStreets = [...new Set(matched.map((m) => m.lane.street))];

  return {
    routeId,
    isoMonth: options.isoMonth,
    matchedLaneCount: matched.length,
    matchedStreetCount: matchedStreets.length,
  };
}

export async function buildRouteBusLaneOverlayFromCli(
  args: string[],
): Promise<BusLaneOverlayResult> {
  return buildRouteBusLaneOverlay(parseCliArgs(args));
}

export async function buildRouteInterventionOverlay(
  args: RouteArtifactArgs = {},
): Promise<InterventionOverlayResult> {
  const options = parseBuildArgs(args);
  const routeId = z.decode(RouteIdCodec, options.routeId);
  const [routeMatches, routeViolations] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listAceRoutesForRoute(local.db, routeId),
      listAceViolationSummariesForRoute(local.db, routeId, options.isoMonth),
    ]),
  );
  const ace = aceInterventionSummary({
    acePrograms: routeMatches,
    aceViolations: routeViolations,
    year: options.year,
    month: options.month,
  });

  return {
    routeId,
    isoMonth: options.isoMonth,
    aceRouteMatchCount: routeMatches.length,
    activeProgramCount: ace.activePrograms.length,
  };
}

export async function buildRouteInterventionOverlayFromCli(
  args: string[],
): Promise<InterventionOverlayResult> {
  return buildRouteInterventionOverlay(parseCliArgs(args));
}

export async function buildRouteScheduleComparison(
  args: RouteArtifactArgs = {},
): Promise<ScheduleComparisonResult> {
  const options = parseBuildArgs(args);
  const [schedules, hotspots] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteSchedules(local.db, options.routeId, options.isoMonth),
      listRouteHotspots(local.db, options.routeId, options.isoMonth),
    ]),
  );
  const comparison = scheduleComparisons(schedules, hotspots);

  return {
    routeId: options.routeId,
    isoMonth: options.isoMonth,
    scheduledPairCount: comparison.scheduledPairCount,
    matchedHotspotCount: comparison.matchedHotspotCount,
  };
}

export async function buildRouteScheduleComparisonFromCli(
  args: string[],
): Promise<ScheduleComparisonResult> {
  return buildRouteScheduleComparison(parseCliArgs(args));
}

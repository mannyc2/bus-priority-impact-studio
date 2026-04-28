import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type LocalBusLane,
  listAceRoutesForRoute,
  listAceViolationSummariesForRoute,
  listBusLanes,
  listRouteBriefSummaries,
  listRouteStops,
} from "@bp/db/local";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;
const proximityThresholdMeters = 150;

type RouteInterventionHistoryArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type RouteInterventionHistoryResult = {
  isoMonth: string;
  historyPath: string;
  summaryPath: string;
  routeCount: number;
  aceMatchedRouteCount: number;
  busLaneMatchedRouteCount: number;
};

type Program = {
  program: string;
  implementationDate: string;
};

type BusLane = LocalBusLane;
type Coordinate = {
  longitude: number;
  latitude: number;
};

function parseBuildArgs(
  args: RouteInterventionHistoryArgs = {},
): Required<RouteInterventionHistoryArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteInterventionHistoryArgs {
  const output: RouteInterventionHistoryArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined && value !== null)),
  ].sort();
}

function sortedDates(values: Array<string | null | undefined>): string[] {
  return uniqueSorted(values).sort();
}

function monthEndIso(year: number, month: number): string {
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(nextMonthStart.getTime() - 1);

  return monthEnd.toISOString();
}

function normalizeStreetName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\bAV\b/g, "AVENUE")
    .replace(/\bAVE\b/g, "AVENUE")
    .replace(/\bST\b/g, "STREET")
    .replace(/\bBLVD\b/g, "BOULEVARD")
    .replace(/\bRD\b/g, "ROAD")
    .replace(/\s+/g, " ")
    .trim();
}

function routeStreetFromStopName(stopName: string): string {
  return normalizeStreetName(stopName.split("/")[0] ?? stopName);
}

function metersBetween(left: Coordinate, right: Coordinate): number {
  const latitudeMeters = (left.latitude - right.latitude) * 111_320;
  const longitudeMeters =
    (left.longitude - right.longitude) *
    111_320 *
    Math.cos(((left.latitude + right.latitude) / 2 / 180) * Math.PI);

  return Math.sqrt(latitudeMeters ** 2 + longitudeMeters ** 2);
}

function minDistanceMeters(laneCoordinates: Coordinate[], stopCoordinates: Coordinate[]): number {
  let minDistance = Number.POSITIVE_INFINITY;

  for (const laneCoordinate of laneCoordinates) {
    for (const stopCoordinate of stopCoordinates) {
      minDistance = Math.min(minDistance, metersBetween(laneCoordinate, stopCoordinate));
    }
  }

  return minDistance;
}

function summarizePrograms(activePrograms: Program[], futurePrograms: Program[]) {
  const programs = [
    ...activePrograms.map((program) => ({ ...program, status: "active" as const })),
    ...futurePrograms.map((program) => ({ ...program, status: "future" as const })),
  ].sort(
    (left, right) =>
      left.implementationDate.localeCompare(right.implementationDate) ||
      left.program.localeCompare(right.program),
  );

  return {
    routeMatched: programs.length > 0,
    routeMatchCount: programs.length,
    activeProgramCount: activePrograms.length,
    futureProgramCount: futurePrograms.length,
    firstImplementationDate: programs[0]?.implementationDate ?? null,
    latestImplementationDate: programs.at(-1)?.implementationDate ?? null,
    programs,
  };
}

function summarizeBusLanes(lanes: BusLane[]) {
  const openDates = sortedDates(lanes.map((lane) => lane.openDate));

  return {
    matchedLaneCount: lanes.length,
    matchedStreetCount: uniqueSorted(lanes.map((lane) => lane.street)).length,
    openDateCount: openDates.length,
    missingOpenDateCount: lanes.filter(
      (lane) => lane.openDate === undefined || lane.openDate === null,
    ).length,
    earliestOpenDate: openDates[0] ?? null,
    latestOpenDate: openDates.at(-1) ?? null,
    laneTypes: uniqueSorted(lanes.map((lane) => lane.laneType)),
    laneSubtypes: uniqueSorted(lanes.map((lane) => lane.laneSubtype)),
    facilities: uniqueSorted(lanes.map((lane) => lane.facility)).slice(0, 25),
  };
}

export async function buildRouteInterventionHistory(
  args: RouteInterventionHistoryArgs = {},
): Promise<RouteInterventionHistoryResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const analysisPeriodEnd = monthEndIso(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const historyPath = join(batchDir, "route-intervention-history.json");
  const summaryPath = join(batchDir, "route-intervention-history-summary.json");
  const local = await openLocalPipelineDb(options.dbPath);
  const rows = await (async () => {
    try {
      const [builtRoutes, busLanes] = await Promise.all([
        listRouteBriefSummaries(local.db, month),
        listBusLanes(local.db),
      ]);

      return await Promise.all(
        builtRoutes.map(async (route) => {
          const [programs, violations, stops] = await Promise.all([
            listAceRoutesForRoute(local.db, route.routeId),
            listAceViolationSummariesForRoute(local.db, route.routeId, month),
            listRouteStops(local.db, route.routeId, month),
          ]);
          const activePrograms = programs.filter(
            (program) => program.implementationDate <= analysisPeriodEnd,
          );
          const futurePrograms = programs.filter(
            (program) => program.implementationDate > analysisPeriodEnd,
          );
          const stopCoordinates = stops.map((stop) => ({
            longitude: stop.longitude,
            latitude: stop.latitude,
          }));
          const routeStreets = new Set(stops.map((stop) => routeStreetFromStopName(stop.stopName)));
          const matchedBusLanes = busLanes.filter((lane) => {
            if (lane.borough !== "MAN") {
              return false;
            }

            const laneStreet = normalizeStreetName(lane.street);
            const laneFacility = normalizeStreetName(lane.facility);
            return (
              routeStreets.has(laneStreet) ||
              routeStreets.has(laneFacility) ||
              minDistanceMeters(lane.coordinates, stopCoordinates) <= proximityThresholdMeters
            );
          });
          const aceViolationCount = violations.reduce((sum, row) => sum + row.violationCount, 0);
          const ace = summarizePrograms(activePrograms, futurePrograms);

          return {
            schemaVersion,
            routeId: route.routeId,
            isoMonth: month,
            ace,
            enforcement: {
              aceViolationCount,
              aceViolationGroupedRowCount: violations.length,
              enforcementActivationStatus: ace.routeMatched
                ? "ace_implementation_date_available"
                : "no_ace_route_match",
            },
            busLanes: summarizeBusLanes(matchedBusLanes),
            signalPriority: {
              status: "not_ingested",
              note: "No signal-priority source has been added to the manifest or pipeline yet.",
            },
            laneUpgrades: {
              status: "not_ingested",
              note: "Bus-lane open dates are available where provided, but lane-upgrade/version history is not yet ingested.",
            },
          };
        }),
      );
    } finally {
      local.sqlite.close();
    }
  })();
  const summary = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    routeCount: rows.length,
    aceMatchedRouteCount: rows.filter((row) => row.ace.routeMatched).length,
    activeAceRouteCount: rows.filter((row) => row.ace.activeProgramCount > 0).length,
    busLaneMatchedRouteCount: rows.filter((row) => row.busLanes.matchedLaneCount > 0).length,
    busLaneOpenDateRouteCount: rows.filter((row) => row.busLanes.openDateCount > 0).length,
    sourceReadiness: {
      aceImplementationDates: "available",
      aceViolationCounts: "available_monthly_grouped",
      busLaneOpenDates: "available_where_published",
      signalPriority: "not_ingested",
      laneUpgradeHistory: "not_ingested",
      enforcementActivation: "partial_ace_implementation_dates_only",
    },
    caveats: [
      "ACE dates are route-level program implementation dates, not camera-by-camera activation windows.",
      "Bus-lane dates come from the NYC DOT bus-lane layer where open-date fields are populated.",
      "Signal priority, lane upgrade history, and enforcement warning periods still need source discovery and ingestion.",
    ],
    rows,
  };

  await mkdir(batchDir, { recursive: true });
  await Promise.all([
    writeJson(historyPath, {
      schemaVersion,
      analysisPeriod: month,
      generatedAt: summary.generatedAt,
      rows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    isoMonth: month,
    historyPath,
    summaryPath,
    routeCount: rows.length,
    aceMatchedRouteCount: summary.aceMatchedRouteCount,
    busLaneMatchedRouteCount: summary.busLaneMatchedRouteCount,
  };
}

export function buildRouteInterventionHistoryFromCli(
  args: string[],
): Promise<RouteInterventionHistoryResult> {
  return buildRouteInterventionHistory(parseCliArgs(args));
}

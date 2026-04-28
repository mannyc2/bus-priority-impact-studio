import { listBusLanes, listRouteStops } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import {
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { busLaneMatches, busLaneProximityThresholdMeters } from "./route-brief-metrics.js";

const schemaVersion = 1;

type BusLaneOverlayArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

type BusLaneOverlayResult = {
  routeId: string;
  isoMonth: string;
  overlayPath: string;
  matchedLaneCount: number;
  matchedStreetCount: number;
};

function parseBuildArgs(args: BusLaneOverlayArgs): Required<BusLaneOverlayArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): BusLaneOverlayArgs {
  return parseCliOptions<BusLaneOverlayArgs>(args, {}, [
    routeOption(),
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
}

export async function buildM1BusLaneOverlay(
  args: BusLaneOverlayArgs = {},
): Promise<BusLaneOverlayResult> {
  const options = parseBuildArgs(args);
  const routeId = z.decode(RouteIdCodec, options.routeId);
  const month = isoMonth(options.year, options.month);
  const [stops, busLanes] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([listRouteStops(local.db, routeId, month), listBusLanes(local.db)]),
  );
  const matchedLanes = busLaneMatches(busLanes, stops)
    .map((match) => ({
      segmentId: match.lane.segmentId,
      street: match.lane.street,
      facility: match.lane.facility,
      direction: match.lane.direction ?? null,
      hours: match.lane.hours ?? null,
      days: match.lane.days ?? null,
      laneType: match.lane.laneType ?? null,
      laneSubtype: match.lane.laneSubtype ?? null,
      openDate: match.lane.openDate ?? null,
      shapeLength: match.lane.shapeLength ?? null,
      streetMatched: match.streetMatched,
      proximityMatched: match.proximityMatched,
      nearestStopDistanceMeters: match.nearestStopDistanceMeters,
    }))
    .sort((left, right) => {
      if (left.street !== right.street) {
        return left.street.localeCompare(right.street);
      }

      return left.segmentId.localeCompare(right.segmentId);
    });
  const matchedStreets = [...new Set(matchedLanes.map((lane) => lane.street))].sort();
  const overlay = {
    schemaVersion,
    routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    method: {
      proximityThresholdMeters: busLaneProximityThresholdMeters,
      matchRule:
        "Manhattan bus-lane rows are included when their street/facility matches a route stop street or a bus-lane geometry vertex is within the threshold of a route stop.",
      caveat:
        "This is a corridor/proximity overlay, not a measured overlap between bus-lane geometry and MTA timepoint-to-timepoint route segments.",
    },
    matchedLaneCount: matchedLanes.length,
    matchedStreetCount: matchedStreets.length,
    matchedStreets,
    matchedLanes,
    sources: [
      {
        sourceId: "nyc_dot_bus_lanes_local_streets",
        title: "NYC DOT Bus Lanes - Local Streets",
        url: "https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3",
        verifiedAt: null,
      },
    ],
    caveats: [
      "Bus-lane overlay is based on street/proximity matching and should not be interpreted as exact route-segment coverage.",
      "Bus-lane hours, direction, and rules may not align with every bus trip or hotspot window.",
    ],
  };

  const overlayPath = await writeRouteSliceArtifact(
    routeId,
    month,
    "bus-lane-overlay.json",
    overlay,
  );

  return {
    routeId,
    isoMonth: month,
    overlayPath,
    matchedLaneCount: matchedLanes.length,
    matchedStreetCount: matchedStreets.length,
  };
}

export async function buildM1BusLaneOverlayFromCli(args: string[]): Promise<BusLaneOverlayResult> {
  return buildM1BusLaneOverlay(parseCliArgs(args));
}

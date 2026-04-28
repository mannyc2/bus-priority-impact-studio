import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { RouteIdCodec } from "@bp/domain";
import { NormalizedBusLaneSchema, NormalizedStopSchema } from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;
const proximityThresholdMeters = 150;

const BusLanesArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: z.literal("nyc_dot_bus_lanes_local_streets"),
    fetchedAt: z.iso.datetime(),
    rows: z.array(NormalizedBusLaneSchema),
  })
  .strict();

const StopsArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    rows: z.array(NormalizedStopSchema),
  })
  .strict();

type BusLaneOverlayArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  interventionDir?: string;
};

type BusLaneOverlayResult = {
  routeId: string;
  isoMonth: string;
  overlayPath: string;
  matchedLaneCount: number;
  matchedStreetCount: number;
};

type Coordinate = {
  longitude: number;
  latitude: number;
};

function parseBuildArgs(args: BusLaneOverlayArgs): Required<BusLaneOverlayArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    interventionDir: args.interventionDir ?? fromRepoRoot(join("data/working/interventions")),
  };
}

function parseCliArgs(args: string[]): BusLaneOverlayArgs {
  const output: BusLaneOverlayArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--route" && value !== undefined) {
      output.routeId = value;
      index += 1;
      continue;
    }

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

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function normalizeStreetName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\bAV\b/g, "AVENUE")
    .replace(/\bAVE\b/g, "AVENUE")
    .replace(/\bST\b/g, "STREET")
    .replace(/\bBLVD\b/g, "BOULEVARD")
    .replace(/\bRD\b/g, "ROAD")
    .replace(/\b1ST\b/g, "1")
    .replace(/\b2ND\b/g, "2")
    .replace(/\b3RD\b/g, "3")
    .replace(/\b4TH\b/g, "4")
    .replace(/\b5TH\b/g, "5")
    .replace(/\b6TH\b/g, "6")
    .replace(/\b7TH\b/g, "7")
    .replace(/\b8TH\b/g, "8")
    .replace(/\b9TH\b/g, "9")
    .replace(/\b10TH\b/g, "10")
    .replace(/\s+/g, " ")
    .trim();
}

function routeStreetFromStopName(stopName: string): string {
  return normalizeStreetName(stopName.split("/")[0] ?? stopName);
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function collectCoordinates(value: unknown, output: Coordinate[] = []): Coordinate[] {
  if (isCoordinate(value)) {
    output.push({ longitude: value[0], latitude: value[1] });
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCoordinates(item, output);
    }
  }

  return output;
}

function geometryCoordinates(geometry: unknown): Coordinate[] {
  if (geometry === undefined || geometry === null || typeof geometry !== "object") {
    return [];
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  return collectCoordinates(coordinates);
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

export async function buildM1BusLaneOverlay(
  args: BusLaneOverlayArgs = {},
): Promise<BusLaneOverlayResult> {
  const options = parseBuildArgs(args);
  const routeId = z.decode(RouteIdCodec, options.routeId);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(routeId, month);
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const overlayPath = join(artifactDir, "bus-lane-overlay.json");
  const stopsPath = fromRepoRoot(join("data/working/route-slices", key, "stops.json"));
  const busLanesPath = join(options.interventionDir, "bus-lanes-local-streets.json");
  const stops = StopsArtifactSchema.parse(await Bun.file(stopsPath).json());
  const busLanes = BusLanesArtifactSchema.parse(await Bun.file(busLanesPath).json());
  const stopCoordinates = stops.rows.map((stop) => ({
    longitude: stop.longitude,
    latitude: stop.latitude,
  }));
  const routeStreets = new Set(stops.rows.map((stop) => routeStreetFromStopName(stop.stopName)));
  const matchedLanes = busLanes.rows
    .filter((lane) => lane.borough === "MAN")
    .map((lane) => {
      const laneStreet = normalizeStreetName(lane.street);
      const laneFacility = normalizeStreetName(lane.facility);
      const streetMatched = routeStreets.has(laneStreet) || routeStreets.has(laneFacility);
      const nearestStopDistanceMeters = minDistanceMeters(
        geometryCoordinates(lane.geometry),
        stopCoordinates,
      );
      const proximityMatched = nearestStopDistanceMeters <= proximityThresholdMeters;

      return {
        segmentId: lane.segmentId,
        street: lane.street,
        facility: lane.facility,
        direction: lane.direction ?? null,
        hours: lane.hours ?? null,
        days: lane.days ?? null,
        laneType: lane.laneType ?? null,
        laneSubtype: lane.laneSubtype ?? null,
        openDate: lane.openDate ?? null,
        shapeLength: lane.shapeLength ?? null,
        streetMatched,
        proximityMatched,
        nearestStopDistanceMeters: Number.isFinite(nearestStopDistanceMeters)
          ? Math.round(nearestStopDistanceMeters)
          : null,
      };
    })
    .filter((lane) => lane.streetMatched || lane.proximityMatched)
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
      proximityThresholdMeters,
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
        verifiedAt: busLanes.fetchedAt,
      },
    ],
    caveats: [
      "Bus-lane overlay is based on street/proximity matching and should not be interpreted as exact route-segment coverage.",
      "Bus-lane hours, direction, and rules may not align with every bus trip or hotspot window.",
    ],
  };

  await mkdir(artifactDir, { recursive: true });
  await writeJson(overlayPath, overlay);

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

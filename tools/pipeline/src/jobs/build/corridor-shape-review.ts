import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LocalCorridor,
  LocalCorridorRouteMember,
  LocalRouteHotspot,
  LocalRouteSegmentSpeed,
} from "@bp/db/local";
import {
  listCorridorRouteMembers,
  listCorridors,
  listRouteBriefSummaries,
  listRouteHotspots,
  listRouteSegmentSpeeds,
} from "@bp/db/local";
import { normalizeRouteShapeRows, type SocrataRow } from "@bp/sources";
import { type CliOption, numberOption } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;
const defaultMaxEndpointDistanceMeters = 250;

type Coordinate = {
  longitude: number;
  latitude: number;
};

type RouteShapePath = {
  shapeId: string;
  coordinates: Coordinate[];
};

type SegmentEndpoint = {
  segmentId: string;
  from: Coordinate;
  to: Coordinate;
};

export type CorridorShapeReviewStatus =
  | "pass"
  | "shape_distance_warning"
  | "missing_shape"
  | "missing_segment_coordinates"
  | "missing_segment_evidence"
  | "unassigned";

export type CorridorShapeReviewRoute = {
  routeId: string;
  corridorId: string;
  corridorName: string;
  assignmentStatus: string;
  assignmentReason: string;
  shapeCount: number;
  shapeCoordinateCount: number;
  matchedSegmentCount: number;
  reviewedSegmentCount: number;
  missingSegmentCoordinateCount: number;
  maxEndpointDistanceMeters: number | null;
  medianEndpointDistanceMeters: number | null;
  reviewStatus: CorridorShapeReviewStatus;
  caveat: string;
};

export type CorridorShapeReviewArtifact = {
  schemaVersion: typeof schemaVersion;
  artifactKind: "corridor_shape_review";
  month: string;
  generatedAt: string;
  routeShapeSnapshotPath: string;
  routeShapeSnapshotFetchedAt: string | null;
  maxAllowedEndpointDistanceMeters: number;
  summary: {
    publicRouteCount: number;
    segmentBackedRouteCount: number;
    shapeReviewedRouteCount: number;
    passRouteCount: number;
    warningRouteCount: number;
    missingShapeRouteCount: number;
    missingSegmentEvidenceRouteCount: number;
    missingSegmentCoordinateRouteCount: number;
    unassignedRouteCount: number;
    maxEndpointDistanceMeters: number | null;
    p95EndpointDistanceMeters: number | null;
  };
  routes: CorridorShapeReviewRoute[];
};

type CorridorShapeReviewArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  routeShapeSnapshotPath?: string;
  maxEndpointDistanceMeters?: number;
};

type CorridorShapeReviewResult = CorridorShapeReviewArtifact["summary"] & {
  isoMonth: string;
  artifactPath: string;
};

type RouteShapeSnapshot = {
  fetchedAt: string | null;
  shapesByRoute: Map<string, RouteShapePath[]>;
};

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

function hotspotMatchesCorridor(hotspot: LocalRouteHotspot, corridorKey: string): boolean {
  return (
    streetFromStopName(hotspot.timepointStopName) === corridorKey ||
    streetFromStopName(hotspot.nextTimepointStopName) === corridorKey
  );
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(sortedValues: readonly number[], q: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? null;
  }

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function segmentIdFor(row: LocalRouteSegmentSpeed): string {
  return [row.direction, row.stopOrder, row.timepointStopId, row.nextTimepointStopId].join(":");
}

function segmentIdsFor(row: LocalRouteSegmentSpeed): string[] {
  const bareId = segmentIdFor(row);
  return [bareId, `${row.routeId}:${row.isoMonth}:${bareId}`];
}

function segmentEndpoints(rows: readonly LocalRouteSegmentSpeed[]): Map<string, SegmentEndpoint> {
  const output = new Map<string, SegmentEndpoint>();

  for (const row of rows) {
    const endpoint = {
      segmentId: segmentIdFor(row),
      from: {
        longitude: row.timepointStopLongitude,
        latitude: row.timepointStopLatitude,
      },
      to: {
        longitude: row.nextTimepointStopLongitude,
        latitude: row.nextTimepointStopLatitude,
      },
    };

    for (const segmentId of segmentIdsFor(row)) {
      if (!output.has(segmentId)) {
        output.set(segmentId, endpoint);
      }
    }
  }

  return output;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function coordinateFromPair(value: [number, number]): Coordinate {
  return {
    longitude: value[0],
    latitude: value[1],
  };
}

function extractLineStrings(geometry: unknown): Coordinate[][] {
  if (typeof geometry !== "object" || geometry === null) {
    return [];
  }

  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type === "LineString" && Array.isArray(candidate.coordinates)) {
    return [
      candidate.coordinates
        .filter(isCoordinatePair)
        .map((coordinate) => coordinateFromPair(coordinate)),
    ];
  }

  if (candidate.type === "MultiLineString" && Array.isArray(candidate.coordinates)) {
    return candidate.coordinates
      .filter((line): line is unknown[] => Array.isArray(line))
      .map((line) =>
        line.filter(isCoordinatePair).map((coordinate) => coordinateFromPair(coordinate)),
      );
  }

  return [];
}

async function readRouteShapeSnapshot(path: string): Promise<RouteShapeSnapshot> {
  const parsed = (await Bun.file(path).json()) as {
    fetchedAt?: unknown;
    rows?: unknown;
  };
  const rows = Array.isArray(parsed.rows) ? (parsed.rows as SocrataRow[]) : [];
  const shapes = normalizeRouteShapeRows(rows);
  const shapesByRoute = new Map<string, RouteShapePath[]>();

  for (const shape of shapes) {
    const paths = extractLineStrings(shape.geometry).filter((line) => line.length > 0);
    if (paths.length === 0) {
      continue;
    }

    const group = shapesByRoute.get(shape.routeId) ?? [];
    for (const coordinates of paths) {
      group.push({
        shapeId: shape.shapeId,
        coordinates,
      });
    }
    shapesByRoute.set(shape.routeId, group);
  }

  return {
    fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : null,
    shapesByRoute,
  };
}

function metersBetween(left: Coordinate, right: Coordinate): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = Math.PI / 180;
  const lat1 = left.latitude * toRadians;
  const lat2 = right.latitude * toRadians;
  const deltaLat = (right.latitude - left.latitude) * toRadians;
  const deltaLon = (right.longitude - left.longitude) * toRadians;
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointSegmentDistanceMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const referenceLatitude =
    ((point.latitude + start.latitude + end.latitude) / 3) * (Math.PI / 180);
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = 111_320 * Math.cos(referenceLatitude);
  const px = point.longitude * metersPerDegreeLongitude;
  const py = point.latitude * metersPerDegreeLatitude;
  const sx = start.longitude * metersPerDegreeLongitude;
  const sy = start.latitude * metersPerDegreeLatitude;
  const ex = end.longitude * metersPerDegreeLongitude;
  const ey = end.latitude * metersPerDegreeLatitude;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return metersBetween(point, start);
  }

  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  const nearest = {
    longitude: (sx + t * dx) / metersPerDegreeLongitude,
    latitude: (sy + t * dy) / metersPerDegreeLatitude,
  };

  return metersBetween(point, nearest);
}

function minDistanceToShapes(point: Coordinate, shapes: readonly RouteShapePath[]): number | null {
  let best = Number.POSITIVE_INFINITY;

  for (const shape of shapes) {
    if (shape.coordinates.length === 1) {
      best = Math.min(best, metersBetween(point, shape.coordinates[0] as Coordinate));
      continue;
    }

    for (let index = 0; index < shape.coordinates.length - 1; index += 1) {
      const start = shape.coordinates[index];
      const end = shape.coordinates[index + 1];
      if (start === undefined || end === undefined) {
        continue;
      }

      best = Math.min(best, pointSegmentDistanceMeters(point, start, end));
    }
  }

  return Number.isFinite(best) ? best : null;
}

function shapeCoordinateCount(shapes: readonly RouteShapePath[]): number {
  return shapes.reduce((sum, shape) => sum + shape.coordinates.length, 0);
}

function caveatForStatus(status: CorridorShapeReviewStatus, maxDistance: number | null): string {
  switch (status) {
    case "pass":
      return `Matched hotspot segment endpoints are within ${round(maxDistance ?? 0)} meters of GTFS route-shape geometry.`;
    case "shape_distance_warning":
      return `At least one matched hotspot segment endpoint is ${round(maxDistance ?? 0)} meters from GTFS route-shape geometry; review this corridor assignment manually.`;
    case "missing_shape":
      return "No current GTFS route-shape geometry was available for this public route.";
    case "missing_segment_coordinates":
      return "Corridor segment evidence exists, but the matching segment-speed coordinates were unavailable.";
    case "missing_segment_evidence":
      return "No corridor-matched hotspot segment evidence was available to review against route shapes.";
    case "unassigned":
      return "Route is assigned to an explicit unassigned placeholder, so shape review is not applicable.";
  }
}

function routeReview(input: {
  member: LocalCorridorRouteMember;
  corridor: LocalCorridor | null;
  hotspots: readonly LocalRouteHotspot[];
  segmentSpeeds: readonly LocalRouteSegmentSpeed[];
  shapes: readonly RouteShapePath[];
  maxAllowedEndpointDistanceMeters: number;
}): CorridorShapeReviewRoute {
  const shapeCount = input.shapes.length;
  const coordinates = shapeCoordinateCount(input.shapes);
  const base = {
    routeId: input.member.routeId,
    corridorId: input.member.corridorId,
    corridorName: input.corridor?.corridorName ?? input.member.corridorId,
    assignmentStatus: input.member.assignmentStatus,
    assignmentReason: input.member.assignmentReason,
    shapeCount,
    shapeCoordinateCount: coordinates,
    matchedSegmentCount: input.member.matchedSegmentCount,
    reviewedSegmentCount: 0,
    missingSegmentCoordinateCount: 0,
    maxEndpointDistanceMeters: null,
    medianEndpointDistanceMeters: null,
  };

  if (input.member.assignmentStatus === "unassigned") {
    return {
      ...base,
      reviewStatus: "unassigned",
      caveat: caveatForStatus("unassigned", null),
    };
  }

  if (shapeCount === 0 || coordinates === 0) {
    return {
      ...base,
      reviewStatus: "missing_shape",
      caveat: caveatForStatus("missing_shape", null),
    };
  }

  const corridorKey = input.corridor?.corridorKey;
  const matchedHotspotSegmentIds =
    corridorKey === undefined
      ? []
      : [
          ...new Set(
            input.hotspots
              .filter((hotspot) => hotspotMatchesCorridor(hotspot, corridorKey))
              .map((hotspot) => hotspot.segmentId),
          ),
        ];

  if (input.member.matchedSegmentCount === 0 || matchedHotspotSegmentIds.length === 0) {
    return {
      ...base,
      reviewStatus: "missing_segment_evidence",
      caveat: caveatForStatus("missing_segment_evidence", null),
    };
  }

  const segmentById = segmentEndpoints(input.segmentSpeeds);
  const endpointDistances: number[] = [];
  let reviewedSegmentCount = 0;
  let missingSegmentCoordinateCount = 0;

  for (const segmentId of matchedHotspotSegmentIds) {
    const segment = segmentById.get(segmentId);
    if (segment === undefined) {
      missingSegmentCoordinateCount += 1;
      continue;
    }

    const fromDistance = minDistanceToShapes(segment.from, input.shapes);
    const toDistance = minDistanceToShapes(segment.to, input.shapes);
    if (fromDistance === null || toDistance === null) {
      missingSegmentCoordinateCount += 1;
      continue;
    }

    endpointDistances.push(fromDistance, toDistance);
    reviewedSegmentCount += 1;
  }

  if (endpointDistances.length === 0) {
    return {
      ...base,
      missingSegmentCoordinateCount,
      reviewStatus: "missing_segment_coordinates",
      caveat: caveatForStatus("missing_segment_coordinates", null),
    };
  }

  const sortedDistances = endpointDistances.toSorted((left, right) => left - right);
  const maxDistance = round(Math.max(...endpointDistances));
  const medianDistance = round(quantile(sortedDistances, 0.5) ?? 0);
  const reviewStatus =
    maxDistance > input.maxAllowedEndpointDistanceMeters ? "shape_distance_warning" : "pass";

  return {
    ...base,
    reviewedSegmentCount,
    missingSegmentCoordinateCount,
    maxEndpointDistanceMeters: maxDistance,
    medianEndpointDistanceMeters: medianDistance,
    reviewStatus,
    caveat: caveatForStatus(reviewStatus, maxDistance),
  };
}

export function corridorShapeReviewArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "route-batches", month, "corridor-shape-review.json");
}

export async function readCorridorShapeReviewArtifact(input: {
  artifactRoot: string;
  month: string;
}): Promise<CorridorShapeReviewArtifact | null> {
  const path = corridorShapeReviewArtifactPath(input.artifactRoot, input.month);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  return (await file.json()) as CorridorShapeReviewArtifact;
}

function defaultRouteShapeSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

function parseCliArgs(args: string[]): CorridorShapeReviewArgs {
  const extraOptions: CliOption<CorridorShapeReviewArgs>[] = [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--route-shape-snapshot"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.routeShapeSnapshotPath = fromCliPath(value);
        }
      },
    },
    numberOption(["--max-endpoint-distance-meters"], (output, value) => {
      output.maxEndpointDistanceMeters = value;
    }),
  ];

  return parseMonthDbCliArgs(args, {} as CorridorShapeReviewArgs, extraOptions);
}

export async function buildCorridorShapeReview(
  args: CorridorShapeReviewArgs = {},
): Promise<CorridorShapeReviewResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const artifactPath = corridorShapeReviewArtifactPath(artifactRoot, options.isoMonth);
  const routeShapeSnapshotPath = args.routeShapeSnapshotPath ?? defaultRouteShapeSnapshotPath();
  const maxAllowedEndpointDistanceMeters = Math.max(
    1,
    Math.round(args.maxEndpointDistanceMeters ?? defaultMaxEndpointDistanceMeters),
  );
  const shapeSnapshot = await readRouteShapeSnapshot(routeShapeSnapshotPath);

  const routes = await withLocalPipelineDb(options.dbPath, async (local) => {
    const [briefs, corridors, members] = await Promise.all([
      listRouteBriefSummaries(local.db, options.isoMonth),
      listCorridors(local.db),
      listCorridorRouteMembers(local.db, options.isoMonth),
    ]);
    const publicRouteIds = new Set(
      briefs.filter((brief) => brief.publicVisible).map((brief) => brief.routeId),
    );
    const corridorById = new Map(corridors.map((corridor) => [corridor.corridorId, corridor]));
    const publicMembers = members.filter((member) => publicRouteIds.has(member.routeId));

    return Promise.all(
      publicMembers.map(async (member) => {
        const [hotspots, segmentSpeeds] = await Promise.all([
          listRouteHotspots(local.db, member.routeId, options.isoMonth),
          listRouteSegmentSpeeds(local.db, member.routeId, options.isoMonth),
        ]);

        return routeReview({
          member,
          corridor: corridorById.get(member.corridorId) ?? null,
          hotspots,
          segmentSpeeds,
          shapes: shapeSnapshot.shapesByRoute.get(member.routeId) ?? [],
          maxAllowedEndpointDistanceMeters,
        });
      }),
    );
  });

  const distances = routes
    .map((row) => row.maxEndpointDistanceMeters)
    .filter((value): value is number => value !== null)
    .toSorted((left, right) => left - right);
  const summary: CorridorShapeReviewArtifact["summary"] = {
    publicRouteCount: routes.length,
    segmentBackedRouteCount: routes.filter((row) => row.matchedSegmentCount > 0).length,
    shapeReviewedRouteCount: routes.filter((row) =>
      ["pass", "shape_distance_warning"].includes(row.reviewStatus),
    ).length,
    passRouteCount: routes.filter((row) => row.reviewStatus === "pass").length,
    warningRouteCount: routes.filter((row) => row.reviewStatus === "shape_distance_warning").length,
    missingShapeRouteCount: routes.filter((row) => row.reviewStatus === "missing_shape").length,
    missingSegmentEvidenceRouteCount: routes.filter(
      (row) => row.reviewStatus === "missing_segment_evidence",
    ).length,
    missingSegmentCoordinateRouteCount: routes.filter(
      (row) => row.reviewStatus === "missing_segment_coordinates",
    ).length,
    unassignedRouteCount: routes.filter((row) => row.reviewStatus === "unassigned").length,
    maxEndpointDistanceMeters: distances.at(-1) ?? null,
    p95EndpointDistanceMeters:
      distances.length === 0 ? null : round(quantile(distances, 0.95) ?? 0),
  };
  const artifact: CorridorShapeReviewArtifact = {
    schemaVersion,
    artifactKind: "corridor_shape_review",
    month: options.isoMonth,
    generatedAt: new Date().toISOString(),
    routeShapeSnapshotPath,
    routeShapeSnapshotFetchedAt: shapeSnapshot.fetchedAt,
    maxAllowedEndpointDistanceMeters,
    summary,
    routes,
  };

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, artifact);

  return {
    isoMonth: options.isoMonth,
    artifactPath,
    ...summary,
  };
}

export function buildCorridorShapeReviewFromCli(
  args: string[],
): Promise<CorridorShapeReviewResult> {
  return buildCorridorShapeReview(parseCliArgs(args));
}

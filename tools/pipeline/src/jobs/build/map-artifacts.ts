import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LocalBusLane, LocalRouteHotspot, LocalRouteSegmentSpeed } from "@bp/db/local";
import {
  listBusLanes,
  listRouteBriefSummaries,
  listRouteHotspots,
  listRouteSegmentSpeeds,
} from "@bp/db/local";
import {
  type MapRouteSegmentFeatureCollection,
  MapRouteSegmentFeatureCollectionSchema,
} from "@bp/domain";
import {
  type NormalizedRouteShape,
  type NormalizedStop,
  normalizeRouteShapeRows,
  normalizeStopRows,
  type SocrataRow,
} from "@bp/sources";
import type { CliOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;
const contentTypeJson = "application/json" as const;
const contentTypeGeoJson = "application/geo+json" as const;
const displayRouteTypes = new Set(["Local", "Limited", "SBS"]);

type MapArtifactsArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  routeShapeSnapshotPath?: string;
  stopSnapshotPath?: string;
  busLaneSnapshotPath?: string;
};

type Coordinate = {
  longitude: number;
  latitude: number;
};

type RouteShapePath = {
  routeId: string;
  directionId: "0" | "1";
  direction: string;
  shapeId: string;
  routeShortName: string;
  routeLongName: string | null;
  routeType: string | null;
  coordinates: Coordinate[];
};

type RouteSegmentGroup = {
  segmentId: string;
  routeId: string;
  month: string;
  direction: string;
  directionId: "0" | "1";
  stopOrder: number;
  timepointStopId: string;
  timepointStopName: string;
  timepointStop: Coordinate;
  nextTimepointStopId: string;
  nextTimepointStopName: string;
  nextTimepointStop: Coordinate;
  averageSpeedMph: number | null;
};

type Projection = {
  coordinate: Coordinate;
  distanceAlongMeters: number;
  distanceToLineMeters: number;
  segmentIndex: number;
};

type SegmentGeometryResult = {
  coordinates: Coordinate[];
  endpointDistanceMeters: number;
};

type FeatureCollection<Feature> = {
  type: "FeatureCollection";
  features: Feature[];
};

type GeoJsonFeature<Geometry, Properties> = {
  type: "Feature";
  id: string;
  geometry: Geometry;
  properties: Properties;
};

type LineStringGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

type PointGeometry = {
  type: "Point";
  coordinates: [number, number];
};

type MapArtifactKind =
  | "map_source_snapshot"
  | "map_route_shapes_geojson"
  | "map_timepoint_stops_geojson"
  | "map_bus_lanes_geojson"
  | "map_route_segments_geojson";

type MapArtifactEntry = {
  artifactKind: MapArtifactKind;
  artifactKey: string;
  contentType: typeof contentTypeJson | typeof contentTypeGeoJson;
  byteLength: number;
  sha256: string;
  featureCount: number;
  routeId: string | null;
};

export type MapArtifactManifest = {
  schemaVersion: typeof schemaVersion;
  artifactKind: "map_artifact_manifest";
  analysisPeriod: string;
  generatedAt: string;
  status: "pass";
  artifactCount: number;
  routeSegmentArtifactCount: number;
  totalFeatureCount: number;
  totalByteLength: number;
  issueCount: 0;
  artifacts: MapArtifactEntry[];
};

type MapArtifactIssue = {
  code: string;
  message: string;
  artifactKey?: string;
};

export type MapArtifactVerification = {
  status: "pass" | "fail";
  manifestPath: string;
  artifactCount: number;
  routeSegmentArtifactCount: number;
  totalFeatureCount: number;
  totalByteLength: number;
  issueCount: number;
  issues: MapArtifactIssue[];
};

export type MapArtifactsResult = {
  isoMonth: string;
  manifestPath: string;
  artifactCount: number;
  routeSegmentArtifactCount: number;
  routeSegmentFeatureCount: number;
  totalFeatureCount: number;
  totalByteLength: number;
  publicRouteCount: number;
};

type SnapshotMetadata = {
  sourceId: string;
  snapshotPath: string;
  status: "available" | "missing";
  fetchedAt: string | null;
  rowCount: number;
  sha256: string | null;
};

type RouteShapeSnapshot = {
  metadata: SnapshotMetadata;
  rows: SocrataRow[];
  shapes: RouteShapePath[];
};

type StopSnapshot = {
  metadata: SnapshotMetadata;
  rows: SocrataRow[];
  stops: NormalizedStop[];
};

type ManifestCandidate = {
  schemaVersion?: unknown;
  artifactKind?: unknown;
  analysisPeriod?: unknown;
  generatedAt?: unknown;
  status?: unknown;
  artifactCount?: unknown;
  routeSegmentArtifactCount?: unknown;
  totalFeatureCount?: unknown;
  totalByteLength?: unknown;
  issueCount?: unknown;
  artifacts?: unknown;
};

function parseCliArgs(args: string[]): MapArtifactsArgs {
  const extraOptions: CliOption<MapArtifactsArgs>[] = [
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
    {
      flags: ["--stop-snapshot"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.stopSnapshotPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--bus-lane-snapshot"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.busLaneSnapshotPath = fromCliPath(value);
        }
      },
    },
  ];

  return parseMonthDbCliArgs(args, {} as MapArtifactsArgs, extraOptions);
}

function defaultRouteShapeSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

function defaultStopSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_stops.json");
}

function defaultBusLaneSnapshotPath(): string {
  return fromRepoRoot("data/raw/interventions/bus-lanes-local-streets.json");
}

function mapArtifactKey(...parts: string[]): string {
  return join("map", ...parts);
}

function mapArtifactPath(artifactRoot: string, ...parts: string[]): string {
  return join(artifactRoot, mapArtifactKey(...parts));
}

export function mapArtifactManifestPath(artifactRoot: string, month: string): string {
  return mapArtifactPath(artifactRoot, month, "manifest.json");
}

function routeSegmentArtifactKey(routeId: string, month: string): string {
  return mapArtifactKey("route-segments", routeId.toLowerCase(), month, "all-day.geojson");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function routeSegmentIdFor(
  row: Pick<
    LocalRouteSegmentSpeed,
    "direction" | "stopOrder" | "timepointStopId" | "nextTimepointStopId"
  >,
): string {
  return [row.direction, row.stopOrder, row.timepointStopId, row.nextTimepointStopId].join(":");
}

function routeShapeId(row: RouteShapePath, index: number): string {
  return ["route", row.routeId, row.directionId, row.shapeId, index].join(":");
}

function routeKey(routeId: string, direction: string): string {
  return `${routeId}:${direction}`;
}

function rounded(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundedCoordinate(coordinate: Coordinate): [number, number] {
  return [rounded(coordinate.longitude), rounded(coordinate.latitude)];
}

function uniqueCoordinateList(coordinates: readonly Coordinate[]): Coordinate[] {
  const output: Coordinate[] = [];
  for (const coordinate of coordinates) {
    const previous = output.at(-1);
    if (
      previous !== undefined &&
      rounded(previous.longitude) === rounded(coordinate.longitude) &&
      rounded(previous.latitude) === rounded(coordinate.latitude)
    ) {
      continue;
    }
    output.push(coordinate);
  }
  return output;
}

function isDirectionId(value: string): value is "0" | "1" {
  return value === "0" || value === "1";
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
  if (!isJsonObject(geometry)) {
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

function normalizedRouteShapes(rows: readonly NormalizedRouteShape[]): RouteShapePath[] {
  return rows.flatMap((row) => {
    if (!row.inEffect || !isDirectionId(row.directionId)) {
      return [];
    }
    const directionId = row.directionId;

    return extractLineStrings(row.geometry)
      .filter((coordinates) => coordinates.length >= 2)
      .map((coordinates) => ({
        routeId: row.routeId,
        directionId,
        direction: row.direction,
        shapeId: row.shapeId,
        routeShortName: row.routeShortName,
        routeLongName: row.routeLongName ?? null,
        routeType: row.routeType ?? null,
        coordinates,
      }));
  });
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

function projectPointToSegment(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): { coordinate: Coordinate; distanceMeters: number; segmentShare: number } {
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
  const segmentShare =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  const nearest = {
    longitude: (sx + segmentShare * dx) / metersPerDegreeLongitude,
    latitude: (sy + segmentShare * dy) / metersPerDegreeLatitude,
  };

  return {
    coordinate: nearest,
    distanceMeters: metersBetween(point, nearest),
    segmentShare,
  };
}

function projectPointToShape(point: Coordinate, shape: RouteShapePath): Projection | null {
  let best: Projection | null = null;
  let accumulatedMeters = 0;

  for (let index = 0; index < shape.coordinates.length - 1; index += 1) {
    const start = shape.coordinates[index];
    const end = shape.coordinates[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }

    const segmentLengthMeters = metersBetween(start, end);
    const projection = projectPointToSegment(point, start, end);
    const candidate: Projection = {
      coordinate: projection.coordinate,
      distanceAlongMeters: accumulatedMeters + segmentLengthMeters * projection.segmentShare,
      distanceToLineMeters: projection.distanceMeters,
      segmentIndex: index,
    };
    if (best === null || candidate.distanceToLineMeters < best.distanceToLineMeters) {
      best = candidate;
    }
    accumulatedMeters += segmentLengthMeters;
  }

  return best;
}

function sliceShape(
  shape: RouteShapePath,
  startProjection: Projection,
  endProjection: Projection,
): Coordinate[] {
  const forward = startProjection.distanceAlongMeters <= endProjection.distanceAlongMeters;
  const start = forward ? startProjection : endProjection;
  const end = forward ? endProjection : startProjection;
  const coordinates: Coordinate[] = [start.coordinate];

  for (let index = start.segmentIndex + 1; index <= end.segmentIndex; index += 1) {
    const coordinate = shape.coordinates[index];
    if (coordinate !== undefined) {
      coordinates.push(coordinate);
    }
  }

  coordinates.push(end.coordinate);
  const deduped = uniqueCoordinateList(coordinates);
  return forward ? deduped : deduped.toReversed();
}

function segmentGeometry(
  segment: RouteSegmentGroup,
  shapes: readonly RouteShapePath[],
): SegmentGeometryResult | null {
  let best: {
    endpointDistanceMeters: number;
    geometryDistanceMeters: number;
    orderPenalty: number;
    coordinates: Coordinate[];
  } | null = null;

  for (const shape of shapes) {
    const start = projectPointToShape(segment.timepointStop, shape);
    const end = projectPointToShape(segment.nextTimepointStop, shape);
    if (start === null || end === null) {
      continue;
    }

    const coordinates = sliceShape(shape, start, end);
    if (coordinates.length < 2) {
      continue;
    }

    const orderPenalty = start.distanceAlongMeters <= end.distanceAlongMeters ? 0 : 1_000_000;
    const candidate = {
      endpointDistanceMeters: Math.max(start.distanceToLineMeters, end.distanceToLineMeters),
      geometryDistanceMeters: start.distanceToLineMeters + end.distanceToLineMeters,
      orderPenalty,
      coordinates,
    };
    if (
      best === null ||
      candidate.orderPenalty + candidate.geometryDistanceMeters <
        best.orderPenalty + best.geometryDistanceMeters
    ) {
      best = candidate;
    }
  }

  if (best === null) {
    return null;
  }

  return {
    coordinates: best.coordinates,
    endpointDistanceMeters: rounded(best.endpointDistanceMeters, 2),
  };
}

function weightedAverageSpeed(rows: readonly LocalRouteSegmentSpeed[]): number | null {
  let weightedSpeed = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const weight = Math.max(0, row.busTripCount);
    if (weight === 0) {
      continue;
    }
    weightedSpeed += row.averageRoadSpeedMph * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    return rounded(weightedSpeed / totalWeight, 2);
  }

  if (rows.length === 0) {
    return null;
  }

  return rounded(rows.reduce((sum, row) => sum + row.averageRoadSpeedMph, 0) / rows.length, 2);
}

function segmentGroups(input: {
  routeId: string;
  month: string;
  rows: readonly LocalRouteSegmentSpeed[];
  directionIdByDirection: Map<string, "0" | "1">;
}): RouteSegmentGroup[] {
  const groups = new Map<string, LocalRouteSegmentSpeed[]>();
  for (const row of input.rows) {
    const segmentId = routeSegmentIdFor(row);
    const group = groups.get(segmentId) ?? [];
    group.push(row);
    groups.set(segmentId, group);
  }

  return [...groups.entries()]
    .map(([segmentId, rows]) => {
      const first = rows[0];
      if (first === undefined) {
        return null;
      }
      const directionId = input.directionIdByDirection.get(first.direction);
      if (directionId === undefined) {
        return null;
      }

      return {
        segmentId,
        routeId: input.routeId,
        month: input.month,
        direction: first.direction,
        directionId,
        stopOrder: first.stopOrder,
        timepointStopId: first.timepointStopId,
        timepointStopName: first.timepointStopName,
        timepointStop: {
          longitude: first.timepointStopLongitude,
          latitude: first.timepointStopLatitude,
        },
        nextTimepointStopId: first.nextTimepointStopId,
        nextTimepointStopName: first.nextTimepointStopName,
        nextTimepointStop: {
          longitude: first.nextTimepointStopLongitude,
          latitude: first.nextTimepointStopLatitude,
        },
        averageSpeedMph: weightedAverageSpeed(rows),
      } satisfies RouteSegmentGroup;
    })
    .filter((row): row is RouteSegmentGroup => row !== null)
    .sort((left, right) =>
      left.direction === right.direction
        ? left.stopOrder - right.stopOrder
        : left.direction.localeCompare(right.direction),
    );
}

function hotspotBySegmentId(
  hotspots: readonly LocalRouteHotspot[],
): Map<string, LocalRouteHotspot> {
  return new Map(hotspots.map((hotspot) => [hotspot.segmentId, hotspot]));
}

function routeSegmentsFeatureCollection(input: {
  routeId: string;
  month: string;
  segments: readonly RouteSegmentGroup[];
  hotspots: readonly LocalRouteHotspot[];
  shapesByDirection: Map<string, RouteShapePath[]>;
}): MapRouteSegmentFeatureCollection {
  const hotspotRows = hotspotBySegmentId(input.hotspots);
  const features: unknown[] = [];

  for (const segment of input.segments) {
    const geometry = segmentGeometry(segment, input.shapesByDirection.get(segment.direction) ?? []);
    if (geometry === null) {
      continue;
    }

    const hotspot = hotspotRows.get(segment.segmentId);
    features.push({
      type: "Feature",
      id: ["route-segment", segment.routeId, segment.month, segment.segmentId].join(":"),
      geometry: {
        type: "LineString",
        coordinates: geometry.coordinates.map(roundedCoordinate),
      },
      properties: {
        segmentId: segment.segmentId,
        routeId: segment.routeId,
        directionId: segment.directionId,
        month: segment.month,
        hourOfDay: null,
        averageSpeedMph: segment.averageSpeedMph,
        hotspotScore: rounded(hotspot?.hotspotScore ?? 0, 2),
        rankOnRoute: hotspot?.hotspotRank ?? null,
        startStopName: segment.timepointStopName,
        endStopName: segment.nextTimepointStopName,
      },
    });
  }

  return MapRouteSegmentFeatureCollectionSchema.parse({
    type: "FeatureCollection",
    features,
  });
}

function routeShapesFeatureCollection(shapes: readonly RouteShapePath[]): FeatureCollection<
  GeoJsonFeature<
    LineStringGeometry,
    {
      routeId: string;
      routeShortName: string;
      routeLongName: string | null;
      directionId: string;
      direction: string;
      shapeId: string;
      routeType: string | null;
    }
  >
> {
  return {
    type: "FeatureCollection",
    features: shapes
      .filter((row) => row.routeType !== null && displayRouteTypes.has(row.routeType))
      .flatMap((row, index) => ({
        type: "Feature" as const,
        id: routeShapeId(row, index),
        geometry: {
          type: "LineString" as const,
          coordinates: row.coordinates.map(roundedCoordinate),
        },
        properties: {
          routeId: row.routeId,
          routeShortName: row.routeShortName,
          routeLongName: row.routeLongName,
          directionId: row.directionId,
          direction: row.direction,
          shapeId: row.shapeId,
          routeType: row.routeType,
        },
      })),
  };
}

function stopsFeatureCollection(stops: readonly NormalizedStop[]): FeatureCollection<
  GeoJsonFeature<
    PointGeometry,
    {
      routeId: string;
      routeShortName: string;
      stopId: string;
      stopName: string;
      directionId: string;
      direction: string;
      timepoint: boolean;
    }
  >
> {
  return {
    type: "FeatureCollection",
    features: stops
      .filter((row) => row.inEffect && row.timepoint)
      .map((row) => ({
        type: "Feature" as const,
        id: ["stop", row.routeId, row.directionId, row.stopId].join(":"),
        geometry: {
          type: "Point" as const,
          coordinates: roundedCoordinate({ longitude: row.longitude, latitude: row.latitude }),
        },
        properties: {
          routeId: row.routeId,
          routeShortName: row.routeShortName,
          stopId: row.stopId,
          stopName: row.stopName,
          directionId: row.directionId,
          direction: row.direction,
          timepoint: row.timepoint,
        },
      })),
  };
}

function busLaneFeatureCollection(lanes: readonly LocalBusLane[]): FeatureCollection<
  GeoJsonFeature<
    LineStringGeometry,
    {
      segmentId: string;
      street: string;
      borough: string;
      facility: string;
      laneType: string | null;
      openDate: string | null;
    }
  >
> {
  return {
    type: "FeatureCollection",
    features: lanes
      .filter((row) => row.coordinates.length >= 2)
      .map((row) => ({
        type: "Feature" as const,
        id: ["bus-lane", row.segmentId].join(":"),
        geometry: {
          type: "LineString" as const,
          coordinates: row.coordinates.map((coordinate) => roundedCoordinate(coordinate)),
        },
        properties: {
          segmentId: row.segmentId,
          street: row.street,
          borough: row.borough,
          facility: row.facility,
          laneType: row.laneType ?? null,
          openDate: row.openDate ?? null,
        },
      })),
  };
}

async function readSnapshotMetadata(input: {
  sourceId: string;
  snapshotPath: string;
}): Promise<{ metadata: SnapshotMetadata; rows: SocrataRow[] }> {
  const file = Bun.file(input.snapshotPath);
  if (!(await file.exists())) {
    return {
      metadata: {
        sourceId: input.sourceId,
        snapshotPath: input.snapshotPath,
        status: "missing",
        fetchedAt: null,
        rowCount: 0,
        sha256: null,
      },
      rows: [],
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
    fetchedAt?: unknown;
    rows?: unknown;
  };
  const rows = Array.isArray(parsed.rows) ? (parsed.rows as SocrataRow[]) : [];
  return {
    metadata: {
      sourceId: input.sourceId,
      snapshotPath: input.snapshotPath,
      status: "available",
      fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : null,
      rowCount: rows.length,
      sha256: hashBytes(bytes),
    },
    rows,
  };
}

async function readRouteShapeSnapshot(path: string): Promise<RouteShapeSnapshot> {
  const snapshot = await readSnapshotMetadata({
    sourceId: "current_bus_routes",
    snapshotPath: path,
  });
  if (snapshot.metadata.status !== "available") {
    throw new Error(`Missing route-shape snapshot at ${path}`);
  }

  return {
    ...snapshot,
    shapes: normalizedRouteShapes(normalizeRouteShapeRows(snapshot.rows)),
  };
}

async function readStopSnapshot(path: string): Promise<StopSnapshot> {
  const snapshot = await readSnapshotMetadata({
    sourceId: "current_bus_stops",
    snapshotPath: path,
  });
  if (snapshot.metadata.status !== "available") {
    throw new Error(`Missing stop snapshot at ${path}`);
  }

  return {
    ...snapshot,
    stops: normalizeStopRows(snapshot.rows),
  };
}

function shapesByRouteDirection(shapes: readonly RouteShapePath[]): Map<string, RouteShapePath[]> {
  const output = new Map<string, RouteShapePath[]>();
  for (const shape of shapes) {
    const key = routeKey(shape.routeId, shape.direction);
    const group = output.get(key) ?? [];
    group.push(shape);
    output.set(key, group);
  }
  return output;
}

function directionIdsByRouteDirection(shapes: readonly RouteShapePath[]): Map<string, "0" | "1"> {
  const output = new Map<string, "0" | "1">();
  for (const shape of shapes) {
    const key = routeKey(shape.routeId, shape.direction);
    if (!output.has(key)) {
      output.set(key, shape.directionId);
    }
  }
  return output;
}

async function writeJsonArtifact(input: {
  path: string;
  artifactKey: string;
  artifactKind: MapArtifactKind;
  contentType: typeof contentTypeJson | typeof contentTypeGeoJson;
  routeId: string | null;
  payload: unknown;
  featureCount: number;
}): Promise<MapArtifactEntry> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(input.payload, null, 2)}\n`);
  await mkdir(dirname(input.path), { recursive: true });
  await Bun.write(input.path, bytes);

  return {
    artifactKind: input.artifactKind,
    artifactKey: input.artifactKey,
    contentType: input.contentType,
    byteLength: bytes.byteLength,
    sha256: hashBytes(bytes),
    featureCount: input.featureCount,
    routeId: input.routeId,
  };
}

async function readMapBuildRows(input: { dbPath: string; month: string }): Promise<{
  publicRouteIds: string[];
  busLanes: LocalBusLane[];
  routeRows: {
    routeId: string;
    speedRows: LocalRouteSegmentSpeed[];
    hotspots: LocalRouteHotspot[];
  }[];
}> {
  return withLocalPipelineDb(input.dbPath, async (local) => {
    const [briefs, busLanes] = await Promise.all([
      listRouteBriefSummaries(local.db, input.month),
      listBusLanes(local.db),
    ]);
    const publicRouteIds = briefs
      .filter((row) => row.publicVisible)
      .map((row) => row.routeId)
      .sort();
    const routeRows = await Promise.all(
      publicRouteIds.map(async (routeId) => {
        const [speedRows, hotspots] = await Promise.all([
          listRouteSegmentSpeeds(local.db, routeId, input.month),
          listRouteHotspots(local.db, routeId, input.month),
        ]);
        return { routeId, speedRows, hotspots };
      }),
    );

    return { publicRouteIds, busLanes, routeRows };
  });
}

export async function buildMapArtifacts(args: MapArtifactsArgs = {}): Promise<MapArtifactsResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const routeShapeSnapshot = await readRouteShapeSnapshot(
    args.routeShapeSnapshotPath ?? defaultRouteShapeSnapshotPath(),
  );
  const stopSnapshot = await readStopSnapshot(args.stopSnapshotPath ?? defaultStopSnapshotPath());
  const busLaneSnapshot = await readSnapshotMetadata({
    sourceId: "nyc_dot_bus_lanes_local_streets",
    snapshotPath: args.busLaneSnapshotPath ?? defaultBusLaneSnapshotPath(),
  });
  const rows = await readMapBuildRows({
    dbPath: options.dbPath,
    month: options.isoMonth,
  });
  const shapesByDirection = shapesByRouteDirection(routeShapeSnapshot.shapes);
  const directionIdByDirection = directionIdsByRouteDirection(routeShapeSnapshot.shapes);
  const sourcePayload = {
    schemaVersion,
    artifactKind: "map_source_snapshot",
    analysisPeriod: options.isoMonth,
    generatedAt,
    sources: [routeShapeSnapshot.metadata, stopSnapshot.metadata, busLaneSnapshot.metadata],
  };
  const routeShapes = routeShapesFeatureCollection(routeShapeSnapshot.shapes);
  const stops = stopsFeatureCollection(stopSnapshot.stops);
  const busLanes = busLaneFeatureCollection(rows.busLanes);
  const artifacts: MapArtifactEntry[] = [];

  artifacts.push(
    await writeJsonArtifact({
      path: mapArtifactPath(artifactRoot, "sources", "source-snapshot.json"),
      artifactKey: mapArtifactKey("sources", "source-snapshot.json"),
      artifactKind: "map_source_snapshot",
      contentType: contentTypeJson,
      routeId: null,
      payload: sourcePayload,
      featureCount: sourcePayload.sources.length,
    }),
  );
  artifacts.push(
    await writeJsonArtifact({
      path: mapArtifactPath(artifactRoot, "routes", "current-local-limited-sbs.min.geojson"),
      artifactKey: mapArtifactKey("routes", "current-local-limited-sbs.min.geojson"),
      artifactKind: "map_route_shapes_geojson",
      contentType: contentTypeGeoJson,
      routeId: null,
      payload: routeShapes,
      featureCount: routeShapes.features.length,
    }),
  );
  artifacts.push(
    await writeJsonArtifact({
      path: mapArtifactPath(artifactRoot, "stops", "current-timepoints.min.geojson"),
      artifactKey: mapArtifactKey("stops", "current-timepoints.min.geojson"),
      artifactKind: "map_timepoint_stops_geojson",
      contentType: contentTypeGeoJson,
      routeId: null,
      payload: stops,
      featureCount: stops.features.length,
    }),
  );
  artifacts.push(
    await writeJsonArtifact({
      path: mapArtifactPath(artifactRoot, "bus-lanes", "local-streets.min.geojson"),
      artifactKey: mapArtifactKey("bus-lanes", "local-streets.min.geojson"),
      artifactKind: "map_bus_lanes_geojson",
      contentType: contentTypeGeoJson,
      routeId: null,
      payload: busLanes,
      featureCount: busLanes.features.length,
    }),
  );

  for (const route of rows.routeRows) {
    const routeDirectionIds = new Map<string, "0" | "1">();
    const routeShapes = new Map<string, RouteShapePath[]>();
    for (const [key, value] of directionIdByDirection) {
      const [routeId, direction] = key.split(":");
      if (routeId === route.routeId && direction !== undefined) {
        routeDirectionIds.set(direction, value);
      }
    }
    for (const [key, value] of shapesByDirection) {
      const [routeId, direction] = key.split(":");
      if (routeId === route.routeId && direction !== undefined) {
        routeShapes.set(direction, value);
      }
    }

    const segments = segmentGroups({
      routeId: route.routeId,
      month: options.isoMonth,
      rows: route.speedRows,
      directionIdByDirection: routeDirectionIds,
    });
    const payload = routeSegmentsFeatureCollection({
      routeId: route.routeId,
      month: options.isoMonth,
      segments,
      hotspots: route.hotspots,
      shapesByDirection: routeShapes,
    });
    const artifactKey = routeSegmentArtifactKey(route.routeId, options.isoMonth);
    artifacts.push(
      await writeJsonArtifact({
        path: join(artifactRoot, artifactKey),
        artifactKey,
        artifactKind: "map_route_segments_geojson",
        contentType: contentTypeGeoJson,
        routeId: route.routeId,
        payload,
        featureCount: payload.features.length,
      }),
    );
  }

  const totalByteLength = artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  const totalFeatureCount = artifacts.reduce((sum, row) => sum + row.featureCount, 0);
  const routeSegmentArtifactCount = artifacts.filter(
    (row) => row.artifactKind === "map_route_segments_geojson",
  ).length;
  const routeSegmentFeatureCount = artifacts
    .filter((row) => row.artifactKind === "map_route_segments_geojson")
    .reduce((sum, row) => sum + row.featureCount, 0);
  const manifest: MapArtifactManifest = {
    schemaVersion,
    artifactKind: "map_artifact_manifest",
    analysisPeriod: options.isoMonth,
    generatedAt,
    status: "pass",
    artifactCount: artifacts.length,
    routeSegmentArtifactCount,
    totalFeatureCount,
    totalByteLength,
    issueCount: 0,
    artifacts,
  };
  const manifestPath = mapArtifactManifestPath(artifactRoot, options.isoMonth);
  await mkdir(dirname(manifestPath), { recursive: true });
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    isoMonth: options.isoMonth,
    manifestPath,
    artifactCount: artifacts.length,
    routeSegmentArtifactCount,
    routeSegmentFeatureCount,
    totalFeatureCount,
    totalByteLength,
    publicRouteCount: rows.publicRouteIds.length,
  };
}

export async function readMapArtifactManifest(input: {
  artifactRoot: string;
  month: string;
}): Promise<MapArtifactManifest | null> {
  const file = Bun.file(mapArtifactManifestPath(input.artifactRoot, input.month));
  if (!(await file.exists())) {
    return null;
  }

  try {
    const parsed = await file.json();
    return isMapArtifactManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isMapArtifactManifest(value: unknown): value is MapArtifactManifest {
  if (!isJsonObject(value)) {
    return false;
  }

  const candidate = value as ManifestCandidate;
  return (
    candidate.schemaVersion === schemaVersion &&
    candidate.artifactKind === "map_artifact_manifest" &&
    typeof candidate.analysisPeriod === "string" &&
    typeof candidate.generatedAt === "string" &&
    candidate.status === "pass" &&
    typeof candidate.artifactCount === "number" &&
    typeof candidate.routeSegmentArtifactCount === "number" &&
    typeof candidate.totalFeatureCount === "number" &&
    typeof candidate.totalByteLength === "number" &&
    candidate.issueCount === 0 &&
    Array.isArray(candidate.artifacts)
  );
}

function featureCountForPayload(payload: unknown): number | null {
  if (!isJsonObject(payload)) {
    return null;
  }
  const candidate = payload as { features?: unknown };
  const features = candidate.features;
  return Array.isArray(features) ? features.length : null;
}

function artifactPayloadIssues(input: {
  artifact: MapArtifactEntry;
  payload: unknown;
  month: string;
}): MapArtifactIssue[] {
  const issues: MapArtifactIssue[] = [];
  const expectedFeatureCount = featureCountForPayload(input.payload);
  if (input.artifact.artifactKind !== "map_source_snapshot" && expectedFeatureCount === null) {
    issues.push({
      code: "map_artifact_payload_features_missing",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} does not include a GeoJSON features array.`,
    });
  }
  if (expectedFeatureCount !== null && expectedFeatureCount !== input.artifact.featureCount) {
    issues.push({
      code: "map_artifact_payload_feature_count_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} manifest featureCount is ${input.artifact.featureCount}, but payload has ${expectedFeatureCount}.`,
    });
  }
  if (input.artifact.artifactKind === "map_route_segments_geojson") {
    const result = MapRouteSegmentFeatureCollectionSchema.safeParse(input.payload);
    if (!result.success) {
      issues.push({
        code: "map_route_segment_payload_invalid",
        artifactKey: input.artifact.artifactKey,
        message: `Map route-segment artifact ${input.artifact.artifactKey} failed the domain GeoJSON contract.`,
      });
    } else {
      const monthMismatches = result.data.features.filter(
        (feature) => feature.properties.month !== input.month,
      );
      if (monthMismatches.length > 0) {
        issues.push({
          code: "map_route_segment_payload_month_mismatch",
          artifactKey: input.artifact.artifactKey,
          message: `Map route-segment artifact ${input.artifact.artifactKey} has ${monthMismatches.length} feature(s) outside ${input.month}.`,
        });
      }
      const routeMismatches =
        input.artifact.routeId === null
          ? []
          : result.data.features.filter(
              (feature) => feature.properties.routeId !== input.artifact.routeId,
            );
      if (routeMismatches.length > 0) {
        issues.push({
          code: "map_route_segment_payload_route_mismatch",
          artifactKey: input.artifact.artifactKey,
          message: `Map route-segment artifact ${input.artifact.artifactKey} has ${routeMismatches.length} feature(s) for a different route.`,
        });
      }
    }
  }

  return issues;
}

async function verifyArtifactFile(input: {
  artifactRoot: string;
  month: string;
  artifact: MapArtifactEntry;
}): Promise<MapArtifactIssue[]> {
  const path = join(input.artifactRoot, input.artifact.artifactKey);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return [
      {
        code: "map_artifact_file_missing",
        artifactKey: input.artifact.artifactKey,
        message: `Missing map artifact file ${input.artifact.artifactKey}.`,
      },
    ];
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const issues: MapArtifactIssue[] = [];
  if (bytes.byteLength !== input.artifact.byteLength) {
    issues.push({
      code: "map_artifact_byte_length_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} expected ${input.artifact.byteLength} bytes but found ${bytes.byteLength}.`,
    });
  }
  if (hashBytes(bytes) !== input.artifact.sha256) {
    issues.push({
      code: "map_artifact_hash_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} failed SHA-256 verification.`,
    });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    issues.push({
      code: "map_artifact_payload_invalid_json",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} could not be parsed as JSON.`,
    });
  }
  issues.push(...artifactPayloadIssues({ ...input, payload }));

  return issues;
}

export async function verifyMapArtifactManifest(input: {
  artifactRoot: string;
  month: string;
  expectedRouteIds?: readonly string[];
}): Promise<MapArtifactVerification> {
  const manifestPath = mapArtifactManifestPath(input.artifactRoot, input.month);
  const manifest = await readMapArtifactManifest(input);
  if (manifest === null) {
    return {
      status: "fail",
      manifestPath,
      artifactCount: 0,
      routeSegmentArtifactCount: 0,
      totalFeatureCount: 0,
      totalByteLength: 0,
      issueCount: 1,
      issues: [
        {
          code: "map_artifact_manifest_missing",
          message: `Missing or invalid map artifact manifest for ${input.month}.`,
        },
      ],
    };
  }

  const issues: MapArtifactIssue[] = [];
  if (manifest.analysisPeriod !== input.month) {
    issues.push({
      code: "map_artifact_manifest_month_mismatch",
      message: `Map artifact manifest is for ${manifest.analysisPeriod}, expected ${input.month}.`,
    });
  }

  const requiredKinds: MapArtifactKind[] = [
    "map_source_snapshot",
    "map_route_shapes_geojson",
    "map_timepoint_stops_geojson",
    "map_bus_lanes_geojson",
  ];
  for (const kind of requiredKinds) {
    if (!manifest.artifacts.some((row) => row.artifactKind === kind)) {
      issues.push({
        code: "map_artifact_manifest_required_artifact_missing",
        message: `Map artifact manifest lacks required artifact kind ${kind}.`,
      });
    }
  }

  const routeSegmentArtifacts = manifest.artifacts.filter(
    (row) => row.artifactKind === "map_route_segments_geojson",
  );
  if (manifest.routeSegmentArtifactCount !== routeSegmentArtifacts.length) {
    issues.push({
      code: "map_artifact_manifest_route_segment_count_mismatch",
      message: `Map artifact manifest routeSegmentArtifactCount is ${manifest.routeSegmentArtifactCount}; actual rows ${routeSegmentArtifacts.length}.`,
    });
  }
  if (input.expectedRouteIds !== undefined) {
    const actualRouteIds = new Set(
      routeSegmentArtifacts
        .map((row) => row.routeId)
        .filter((routeId): routeId is string => routeId !== null),
    );
    const missingRoutes = input.expectedRouteIds.filter((routeId) => !actualRouteIds.has(routeId));
    if (missingRoutes.length > 0) {
      issues.push({
        code: "map_route_segment_artifact_routes_missing",
        message: `${missingRoutes.length} public route(s) lack map route-segment artifacts: ${missingRoutes.slice(0, 5).join(", ")}.`,
      });
    }
  }

  const fileIssues = (
    await Promise.all(
      manifest.artifacts.map((artifact) =>
        verifyArtifactFile({
          artifactRoot: input.artifactRoot,
          month: input.month,
          artifact,
        }),
      ),
    )
  ).flat();
  issues.push(...fileIssues);

  const totalByteLength = manifest.artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  const totalFeatureCount = manifest.artifacts.reduce((sum, row) => sum + row.featureCount, 0);
  if (manifest.artifactCount !== manifest.artifacts.length) {
    issues.push({
      code: "map_artifact_manifest_count_mismatch",
      message: `Map artifact manifest artifactCount is ${manifest.artifactCount}; actual rows ${manifest.artifacts.length}.`,
    });
  }
  if (manifest.totalByteLength !== totalByteLength) {
    issues.push({
      code: "map_artifact_manifest_byte_total_mismatch",
      message: `Map artifact manifest totalByteLength is ${manifest.totalByteLength}; artifact rows total ${totalByteLength}.`,
    });
  }
  if (manifest.totalFeatureCount !== totalFeatureCount) {
    issues.push({
      code: "map_artifact_manifest_feature_total_mismatch",
      message: `Map artifact manifest totalFeatureCount is ${manifest.totalFeatureCount}; artifact rows total ${totalFeatureCount}.`,
    });
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    manifestPath,
    artifactCount: manifest.artifacts.length,
    routeSegmentArtifactCount: routeSegmentArtifacts.length,
    totalFeatureCount,
    totalByteLength,
    issueCount: issues.length,
    issues,
  };
}

export function buildMapArtifactsFromCli(args: string[]): Promise<MapArtifactsResult> {
  return buildMapArtifacts(parseCliArgs(args));
}

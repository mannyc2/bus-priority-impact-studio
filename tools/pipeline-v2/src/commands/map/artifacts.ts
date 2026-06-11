import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  mapArtifactKey,
  mapArtifactManifestPath,
  mapArtifactPath,
  routeSegmentMapArtifactKey,
} from "@bp/applied-research/artifacts";
import {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
  MAP_ARTIFACT_SCHEMA_VERSION,
  type MapArtifactEntry,
  type MapArtifactManifest,
  type MapArtifactVerification,
  mapArtifactSha256,
  readMapArtifactManifest,
  verifyMapArtifactManifest,
} from "@bp/applied-research/evaluation";
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
} from "@bp/domain/maps";
import {
  type NormalizedRouteShape,
  type NormalizedStop,
  normalizeRouteShapeRows,
  normalizeStopRows,
} from "@bp/sources/adapters/mta/routes-stops";
import type { SocrataRow } from "@bp/sources/clients/socrata";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const displayRouteTypes = new Set(["Local", "Limited", "SBS"]);

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

export type { MapArtifactManifest, MapArtifactVerification };
export { mapArtifactManifestPath, readMapArtifactManifest, verifyMapArtifactManifest };

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

function defaultRouteShapeSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

function defaultStopSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_stops.json");
}

function defaultBusLaneSnapshotPath(): string {
  return fromRepoRoot("data/raw/interventions/bus-lanes-local-streets.json");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      sha256: mapArtifactSha256(bytes),
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
  artifactKind: MapArtifactEntry["artifactKind"];
  contentType: MapArtifactEntry["contentType"];
  routeId: string | null;
  payload: unknown;
  featureCount: number;
}): Promise<MapArtifactEntry> {
  const artifact = buildMapJsonArtifact(input);
  await mkdir(dirname(input.path), { recursive: true });
  await Bun.write(input.path, artifact.bytes);

  return artifact.entry;
}

async function readMapBuildRows(input: { local: OpenLocalPipelineDb; month: string }): Promise<{
  publicRouteIds: string[];
  busLanes: LocalBusLane[];
  routeRows: {
    routeId: string;
    speedRows: LocalRouteSegmentSpeed[];
    hotspots: LocalRouteHotspot[];
  }[];
}> {
  const [briefs, busLanes] = await Promise.all([
    listRouteBriefSummaries(input.local.db, input.month),
    listBusLanes(input.local.db),
  ]);
  const publicRouteIds = briefs
    .filter((row) => row.publicVisible)
    .map((row) => row.routeId)
    .sort();
  const routeRows = await Promise.all(
    publicRouteIds.map(async (routeId) => {
      const [speedRows, hotspots] = await Promise.all([
        listRouteSegmentSpeeds(input.local.db, routeId, input.month),
        listRouteHotspots(input.local.db, routeId, input.month),
      ]);
      return { routeId, speedRows, hotspots };
    }),
  );
  return { publicRouteIds, busLanes, routeRows };
}

export type MapArtifactsInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  artifactRoot?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  busLaneSnapshotPath?: string | undefined;
};

export async function runMapArtifacts(args: MapArtifactsInputs): Promise<MapArtifactsResult> {
  const isoMonthStr = isoMonth(args.year, args.month);
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
  const options = { isoMonth: isoMonthStr };
  const rows = await readMapBuildRows({
    local: args.local,
    month: options.isoMonth,
  });
  const shapesByDirection = shapesByRouteDirection(routeShapeSnapshot.shapes);
  const directionIdByDirection = directionIdsByRouteDirection(routeShapeSnapshot.shapes);
  const sourcePayload = {
    schemaVersion: MAP_ARTIFACT_SCHEMA_VERSION,
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
      contentType: MAP_ARTIFACT_JSON_CONTENT_TYPE,
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
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
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
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
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
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
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
    const artifactKey = routeSegmentMapArtifactKey(route.routeId, options.isoMonth);
    artifacts.push(
      await writeJsonArtifact({
        path: join(artifactRoot, artifactKey),
        artifactKey,
        artifactKind: "map_route_segments_geojson",
        contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
        routeId: route.routeId,
        payload,
        featureCount: payload.features.length,
      }),
    );
  }

  const routeSegmentFeatureCount = artifacts
    .filter((row) => row.artifactKind === "map_route_segments_geojson")
    .reduce((sum, row) => sum + row.featureCount, 0);
  const manifest = buildMapArtifactManifest({
    month: options.isoMonth,
    generatedAt,
    artifacts,
  });
  const manifestPath = mapArtifactManifestPath(artifactRoot, options.isoMonth);
  await mkdir(dirname(manifestPath), { recursive: true });
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    isoMonth: options.isoMonth,
    manifestPath,
    artifactCount: manifest.artifactCount,
    routeSegmentArtifactCount: manifest.routeSegmentArtifactCount,
    routeSegmentFeatureCount,
    totalFeatureCount: manifest.totalFeatureCount,
    totalByteLength: manifest.totalByteLength,
    publicRouteCount: rows.publicRouteIds.length,
  };
}

export default defineCommand({
  path: ["map", "artifacts"],
  summary: "Build map GeoJSON artifacts (routes, stops, bus lanes, route segments) and manifest.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      routeShapeSnapshot: z.string().optional().describe("Override route-shape snapshot path"),
      stopSnapshot: z.string().optional().describe("Override stop snapshot path"),
      busLaneSnapshot: z.string().optional().describe("Override bus-lane snapshot path"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    manifestPath: z.string(),
    artifactCount: z.number(),
    routeSegmentArtifactCount: z.number(),
    routeSegmentFeatureCount: z.number(),
    totalFeatureCount: z.number(),
    totalByteLength: z.number(),
    publicRouteCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runMapArtifacts({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      routeShapeSnapshotPath:
        input.options.routeShapeSnapshot === undefined
          ? undefined
          : fromCliPath(input.options.routeShapeSnapshot),
      stopSnapshotPath:
        input.options.stopSnapshot === undefined
          ? undefined
          : fromCliPath(input.options.stopSnapshot),
      busLaneSnapshotPath:
        input.options.busLaneSnapshot === undefined
          ? undefined
          : fromCliPath(input.options.busLaneSnapshot),
    });
  },
});

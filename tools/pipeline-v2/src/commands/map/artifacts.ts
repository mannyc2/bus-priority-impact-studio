import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  mapArtifactKey,
  mapArtifactManifestPath,
  mapArtifactPath,
  routeSegmentMapArtifactKey,
} from "@bp/analytics/artifacts";
import {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  isMapArtifactManifest,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
  MAP_ARTIFACT_SCHEMA_VERSION,
  type MapArtifactEntry,
  type MapArtifactIssue,
  type MapArtifactManifest,
  type MapArtifactVerification,
  mapArtifactPayloadIssues,
  mapArtifactSha256,
  verifyMapArtifactManifestContents,
} from "@bp/analytics/evaluation";
import {
  classifyRouteSegmentSourceKey,
  matchRouteSpeedSpineSegment,
  serializeSourceSegmentId,
  serializeStudioSegmentId,
} from "@bp/analytics/feature-history";
import type {
  LocalBusLane,
  LocalRouteBriefSummary,
  LocalRouteHotspot,
  LocalRouteSegmentSpeed,
} from "@bp/db/local";
import {
  listBusLanes,
  listRouteBriefSummaries,
  listRouteHotspots,
  listRouteSegmentSpeeds,
} from "@bp/db/local";
import {
  type MapBorough,
  MapContextFeatureCollectionSchema,
  type MapNetworkFeatureCollection,
  MapNetworkFeatureCollectionSchema,
  MapRouteFactsResponseSchema,
  type MapRouteSegmentFeatureCollection,
  MapRouteSegmentFeatureCollectionSchema,
} from "@bp/domain/maps";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  type NormalizedRouteShape,
  type NormalizedStop,
  normalizeRouteShapeRows,
  normalizeStopRows,
} from "@bp/sources/adapters/mta/routes-stops";
import { Effect } from "effect";
import { localTransformConcurrency, runBoundedPromises } from "../../effect/concurrency.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  type LoadedRouteSpeedSpineCrosswalk,
  loadRouteSpeedSpineCrosswalk,
} from "../../lib/route-speed-spine-crosswalk.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";
import type { SocrataRow } from "../../lib/soda3.ts";
import { pointInPolygon } from "./context.ts";

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

export type NetworkRouteBuildInput = {
  routeId: string;
  summary: LocalRouteBriefSummary;
  speedRows: readonly LocalRouteSegmentSpeed[];
  segmentPayload: MapRouteSegmentFeatureCollection;
  servedBoroughs?: readonly MapBorough[] | undefined;
};

export type { MapArtifactManifest, MapArtifactVerification };
export { mapArtifactManifestPath };

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

function defaultContextPath(artifactRoot: string): string {
  return join(artifactRoot, "map", "context", "nyc-boroughs.min.geojson");
}

export async function servedBoroughsByRoute(input: {
  contextPath: string;
  stops: readonly NormalizedStop[];
}): Promise<Map<string, MapBorough[]> | null> {
  const contextFile = Bun.file(input.contextPath);
  if (!(await contextFile.exists())) return null;
  const context = decodeSchemaStrict(MapContextFeatureCollectionSchema, await contextFile.json());
  const result = new Map<string, Set<MapBorough>>();
  for (const stop of input.stops) {
    if (!stop.inEffect) continue;
    const point = [stop.longitude, stop.latitude] as const;
    for (const borough of context.features) {
      const contains = borough.geometry.coordinates.some((polygon) =>
        pointInPolygon(point, polygon),
      );
      if (!contains) continue;
      const matches = result.get(stop.routeId) ?? new Set<MapBorough>();
      matches.add(borough.properties.boroName);
      result.set(stop.routeId, matches);
    }
  }
  return new Map(
    [...result].map(([routeId, boroughs]) => [routeId, [...boroughs].toSorted()] as const),
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routeSegmentIdFor(
  input: Pick<RouteSegmentGroup, "routeId" | "month"> & {
    row: Pick<
      LocalRouteSegmentSpeed,
      "direction" | "stopOrder" | "timepointStopId" | "nextTimepointStopId"
    >;
  },
): string {
  const classified = classifyRouteSegmentSourceKey({
    routeId: input.routeId,
    month: input.month,
    direction: input.row.direction,
    stopOrder: input.row.stopOrder,
    fromStopId: input.row.timepointStopId,
    toStopId: input.row.nextTimepointStopId,
  });
  if (classified.status !== "keyed") {
    throw new Error(`Published map segment ${input.routeId} ${input.month} has no stop pair.`);
  }
  return serializeSourceSegmentId(classified.key);
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
  if (mapArtifactSha256(bytes) !== input.artifact.sha256) {
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
  issues.push(...mapArtifactPayloadIssues({ ...input, payload }));

  return issues;
}

export async function verifyMapArtifactManifest(input: {
  artifactRoot: string;
  month: string;
  expectedRouteIds?: readonly string[];
}): Promise<MapArtifactVerification> {
  const manifestPath = mapArtifactManifestPath(input.artifactRoot, input.month);
  const manifest = await readMapArtifactManifest(input);
  const artifactIssues =
    manifest === null
      ? []
      : (
          await runBoundedPromises(manifest.artifacts, localTransformConcurrency, (artifact) =>
            verifyArtifactFile({
              artifactRoot: input.artifactRoot,
              month: input.month,
              artifact,
            }),
          )
        ).flat();

  return verifyMapArtifactManifestContents({
    manifestPath,
    month: input.month,
    manifest,
    artifactIssues,
    ...(input.expectedRouteIds === undefined ? {} : { expectedRouteIds: input.expectedRouteIds }),
  });
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

  return null;
}

function segmentGroups(input: {
  routeId: string;
  month: string;
  rows: readonly LocalRouteSegmentSpeed[];
  directionIdByDirection: Map<string, "0" | "1">;
}): RouteSegmentGroup[] {
  const groups = new Map<string, LocalRouteSegmentSpeed[]>();
  for (const row of input.rows) {
    const segmentId = routeSegmentIdFor({ routeId: input.routeId, month: input.month, row });
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
  spine: LoadedRouteSpeedSpineCrosswalk;
}): MapRouteSegmentFeatureCollection {
  const hotspotRows = hotspotBySegmentId(input.hotspots);
  const features: unknown[] = [];

  for (const segment of input.segments) {
    const geometry = segmentGeometry(segment, input.shapesByDirection.get(segment.direction) ?? []);
    if (geometry === null) {
      continue;
    }

    const hotspot = hotspotRows.get(segment.segmentId);
    const classified = classifyRouteSegmentSourceKey({
      routeId: segment.routeId,
      month: segment.month,
      direction: segment.direction,
      stopOrder: segment.stopOrder,
      fromStopId: segment.timepointStopId,
      toStopId: segment.nextTimepointStopId,
    });
    if (classified.status !== "keyed") {
      throw new Error(
        `Published map segment ${segment.routeId} ${segment.month} has no stop pair.`,
      );
    }
    const sourceSegmentId = serializeSourceSegmentId(classified.key);
    const studioSegmentId = serializeStudioSegmentId(classified.key);
    const spineMatch =
      input.spine.status === "ready"
        ? matchRouteSpeedSpineSegment(input.spine.crosswalk, classified.key)
        : null;
    features.push({
      type: "Feature",
      id: ["route-segment", studioSegmentId].join(":"),
      geometry: {
        type: "LineString",
        coordinates: geometry.coordinates.map(roundedCoordinate),
      },
      properties: {
        segmentId: segment.segmentId,
        sourceSegmentId,
        studioSegmentId,
        spineSegmentId: spineMatch?.status === "matched" ? spineMatch.spineSegmentId : null,
        spineJoinStatus:
          input.spine.status === "not_built"
            ? "not_built"
            : spineMatch?.status === "matched"
              ? "matched"
              : "unmatched",
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

  return decodeSchemaStrict(MapRouteSegmentFeatureCollectionSchema, {
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

function routeHourEvidence(speedRows: readonly LocalRouteSegmentSpeed[]): {
  hourlySpeedMph: Array<number | null>;
  hourlyTraversalCount: number[];
} {
  const hourlySpeedMph: Array<number | null> = [];
  const hourlyTraversalCount: number[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const rows = speedRows.filter((row) => row.hourOfDay === hour);
    const traversalCount = rows.reduce((sum, row) => sum + Math.max(0, row.busTripCount), 0);
    hourlyTraversalCount.push(traversalCount);
    hourlySpeedMph.push(traversalCount > 0 ? weightedAverageSpeed(rows) : null);
  }
  return { hourlySpeedMph, hourlyTraversalCount };
}

function thinCoordinatePairs(
  coordinates: readonly (readonly [number, number])[],
): [number, number][] {
  if (coordinates.length <= 8) {
    return coordinates.map(([lon, lat]) => [rounded(lon), rounded(lat)]);
  }
  const step = Math.max(1, Math.ceil(coordinates.length / 18));
  const output: [number, number][] = [];
  for (let index = 0; index < coordinates.length; index += step) {
    const coordinate = coordinates[index];
    if (coordinate !== undefined) {
      output.push([rounded(coordinate[0]), rounded(coordinate[1])]);
    }
  }
  const last = coordinates.at(-1);
  if (last !== undefined) {
    const previous = output.at(-1);
    const roundedLast: [number, number] = [rounded(last[0]), rounded(last[1])];
    if (
      previous === undefined ||
      previous[0] !== roundedLast[0] ||
      previous[1] !== roundedLast[1]
    ) {
      output.push(roundedLast);
    }
  }
  return output;
}

export function buildNetworkMapFeatureCollection(input: {
  routes: readonly NetworkRouteBuildInput[];
}): MapNetworkFeatureCollection {
  return decodeSchemaStrict(MapNetworkFeatureCollectionSchema, {
    type: "FeatureCollection",
    features: input.routes.flatMap((route) => {
      const coordinates = route.segmentPayload.features
        .map((feature) => thinCoordinatePairs(feature.geometry.coordinates))
        .filter((line) => line.length >= 2);
      if (coordinates.length === 0) {
        return [];
      }
      const hourly = routeHourEvidence(route.speedRows);
      return [
        {
          type: "Feature" as const,
          geometry: {
            type: "MultiLineString" as const,
            coordinates,
          },
          properties: {
            routeId: route.routeId,
            month: route.summary.month,
            ...hourly,
            servedBoroughs: route.servedBoroughs ?? [],
            servedBoroughsStatus: route.servedBoroughs === undefined ? "unavailable" : "verified",
          },
        },
      ];
    }),
  });
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
    summary: LocalRouteBriefSummary;
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
  const summariesByRoute = new Map(briefs.map((row) => [row.routeId, row]));
  const routeRows = await runBoundedPromises(
    publicRouteIds,
    localTransformConcurrency,
    async (routeId) => {
      const summary = summariesByRoute.get(routeId);
      if (summary === undefined) {
        throw new Error(`Missing route brief summary for public route ${routeId}`);
      }
      const [speedRows, hotspots] = await Promise.all([
        listRouteSegmentSpeeds(input.local.db, routeId, input.month),
        listRouteHotspots(input.local.db, routeId, input.month),
      ]);
      return { routeId, summary, speedRows, hotspots };
    },
  );
  return { publicRouteIds, busLanes, routeRows };
}

export type MapArtifactsInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  releaseProfile: "demo" | "full";
  artifactRoot?: string | undefined;
  speedSpineRoot?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  busLaneSnapshotPath?: string | undefined;
  contextPath?: string | undefined;
  routeFactsPath?: string | undefined;
  routeIds?: readonly string[] | undefined;
};

export async function runMapArtifacts(args: MapArtifactsInputs): Promise<MapArtifactsResult> {
  const isoMonthStr = isoMonth(args.year, args.month);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const speedSpineRoot = args.speedSpineRoot ?? artifactRoot;
  const generatedAt = new Date().toISOString();
  const routeFactsPath =
    args.routeFactsPath ?? join(artifactRoot, "studio", "v1", "map-route-facts.json");
  const routeFactsFile = Bun.file(routeFactsPath);
  const routeFacts = (await routeFactsFile.exists())
    ? decodeSchemaStrict(MapRouteFactsResponseSchema, await routeFactsFile.json())
    : null;
  if (routeFacts !== null && routeFacts.baselineMonth !== isoMonthStr) {
    throw new Error(
      `Map route facts are for ${routeFacts.baselineMonth}, expected ${isoMonthStr}.`,
    );
  }
  if (args.releaseProfile === "full" && routeFacts === null) {
    throw new Error(`Full map release requires route facts at ${routeFactsPath}.`);
  }
  const routeFactsReference: MapArtifactManifest["routeFacts"] =
    routeFacts === null
      ? { status: "unavailable", reason: "Same-month map route facts are unavailable." }
      : {
          status: "available",
          artifactKey: "studio/v1/map-route-facts.json",
          sha256: mapArtifactSha256(new Uint8Array(await routeFactsFile.arrayBuffer())),
          schemaVersion: 1,
          baselineMonth: routeFacts.baselineMonth,
          routeCount: routeFacts.routes.length,
        };
  const routeShapeSnapshot = await readRouteShapeSnapshot(
    args.routeShapeSnapshotPath ?? defaultRouteShapeSnapshotPath(),
  );
  const stopSnapshot = await readStopSnapshot(args.stopSnapshotPath ?? defaultStopSnapshotPath());
  const contextPath = args.contextPath ?? defaultContextPath(artifactRoot);
  const contextFile = Bun.file(contextPath);
  const context = (await contextFile.exists())
    ? decodeSchemaStrict(MapContextFeatureCollectionSchema, await contextFile.json())
    : null;
  const boroughsByRoute = await servedBoroughsByRoute({
    contextPath,
    stops: stopSnapshot.stops,
  });
  const busLaneSnapshot = await readSnapshotMetadata({
    sourceId: "nyc_dot_bus_lanes_local_streets",
    snapshotPath: args.busLaneSnapshotPath ?? defaultBusLaneSnapshotPath(),
  });
  const options = { isoMonth: isoMonthStr };
  const rows = await readMapBuildRows({
    local: args.local,
    month: options.isoMonth,
  });
  const routeFilter = new Set((args.routeIds ?? []).map((routeId) => routeId.trim().toUpperCase()));
  const selectedRouteRows = rows.routeRows.filter(
    (route) => routeFilter.size === 0 || routeFilter.has(route.routeId),
  );
  if (args.releaseProfile === "full") {
    const factRouteIds = new Set<string>(
      routeFacts?.routes.map((fact) => fact.route.routeId as string) ?? [],
    );
    const missingFacts = selectedRouteRows
      .map((route) => route.routeId)
      .filter((routeId) => !factRouteIds.has(routeId));
    if (missingFacts.length > 0) {
      throw new Error(
        `Full map release lacks route facts for ${missingFacts.length} mapped route(s): ${missingFacts.slice(0, 5).join(", ")}.`,
      );
    }
    const missingBoroughs = selectedRouteRows
      .map((route) => route.routeId)
      .filter((routeId) => (boroughsByRoute?.get(routeId)?.length ?? 0) === 0);
    if (missingBoroughs.length > 0) {
      throw new Error(
        `Full map release lacks verified served-borough membership for ${missingBoroughs.length} route(s): ${missingBoroughs.slice(0, 5).join(", ")}.`,
      );
    }
  }
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
  const networkRoutes: NetworkRouteBuildInput[] = [];

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
  if (context !== null) {
    artifacts.push(
      await writeJsonArtifact({
        path: defaultContextPath(artifactRoot),
        artifactKey: mapArtifactKey("context", "nyc-boroughs.min.geojson"),
        artifactKind: "map_borough_context_geojson",
        contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
        routeId: null,
        payload: context,
        featureCount: context.features.length,
      }),
    );
  }
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

  const routeArtifactResults = await runBoundedPromises(
    selectedRouteRows,
    localTransformConcurrency,
    async (route) => {
      const routeDirectionIds = new Map<string, "0" | "1">();
      const routeShapes = new Map<string, RouteShapePath[]>();
      for (const [key, value] of directionIdByDirection) {
        const [routeId, direction] = key.split(":");
        if (routeId === route.routeId && direction !== undefined)
          routeDirectionIds.set(direction, value);
      }
      for (const [key, value] of shapesByDirection) {
        const [routeId, direction] = key.split(":");
        if (routeId === route.routeId && direction !== undefined) routeShapes.set(direction, value);
      }

      const segments = segmentGroups({
        routeId: route.routeId,
        month: options.isoMonth,
        rows: route.speedRows,
        directionIdByDirection: routeDirectionIds,
      });
      const spine = await loadRouteSpeedSpineCrosswalk({
        artifactRoot: speedSpineRoot,
        routeId: route.routeId,
      });
      const payload = routeSegmentsFeatureCollection({
        routeId: route.routeId,
        month: options.isoMonth,
        segments,
        hotspots: route.hotspots,
        shapesByDirection: routeShapes,
        spine,
      });
      const matchedSpineIds = new Set<string>();
      let unmatchedSegmentCount = 0;
      for (const feature of payload.features) {
        const { spineJoinStatus, spineSegmentId } = feature.properties;
        if (spineJoinStatus === "unmatched") unmatchedSegmentCount += 1;
        if (spineSegmentId === null) continue;
        if (matchedSpineIds.has(spineSegmentId)) {
          throw new Error(
            `Map route ${route.routeId} ${options.isoMonth} maps more than one current segment to ${spineSegmentId}.`,
          );
        }
        matchedSpineIds.add(spineSegmentId);
      }
      if (
        spine.status === "ready" &&
        spine.audit.readiness === "series_ready" &&
        unmatchedSegmentCount > 0
      ) {
        throw new Error(
          `Map route ${route.routeId} is series_ready but has ${unmatchedSegmentCount} unmatched current segments.`,
        );
      }
      const artifactKey = routeSegmentMapArtifactKey(route.routeId, options.isoMonth);
      return {
        networkRoute: {
          routeId: route.routeId,
          summary: route.summary,
          speedRows: route.speedRows,
          segmentPayload: payload,
          ...(boroughsByRoute?.get(route.routeId) === undefined
            ? {}
            : { servedBoroughs: boroughsByRoute.get(route.routeId) }),
        },
        artifact: await writeJsonArtifact({
          path: join(artifactRoot, artifactKey),
          artifactKey,
          artifactKind: "map_route_segments_geojson",
          contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
          routeId: route.routeId,
          payload,
          featureCount: payload.features.length,
        }),
      };
    },
  );
  for (const result of routeArtifactResults) {
    networkRoutes.push(result.networkRoute);
    artifacts.push(result.artifact);
  }
  const networkPayload = buildNetworkMapFeatureCollection({ routes: networkRoutes });
  artifacts.push(
    await writeJsonArtifact({
      path: mapArtifactPath(artifactRoot, options.isoMonth, "network-simplified.geojson"),
      artifactKey: mapArtifactKey(options.isoMonth, "network-simplified.geojson"),
      artifactKind: "map_network_simplified_geojson",
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: networkPayload,
      featureCount: networkPayload.features.length,
    }),
  );

  const routeSegmentFeatureCount = artifacts
    .filter((row) => row.artifactKind === "map_route_segments_geojson")
    .reduce((sum, row) => sum + row.featureCount, 0);
  const manifest = buildMapArtifactManifest({
    month: options.isoMonth,
    generatedAt,
    artifacts,
    releaseProfile: args.releaseProfile,
    routeFacts: routeFactsReference,
  });
  const manifestPath = mapArtifactManifestPath(artifactRoot, options.isoMonth);
  await mkdir(dirname(manifestPath), { recursive: true });
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const verification = await verifyMapArtifactManifest({
    artifactRoot,
    month: options.isoMonth,
    expectedRouteIds: selectedRouteRows.map((route) => route.routeId),
  });
  const verifiedManifest: MapArtifactManifest = {
    ...manifest,
    verificationStatus: verification.status,
    status: verification.status,
    issueCount: verification.issueCount,
  };
  await Bun.write(manifestPath, `${JSON.stringify(verifiedManifest, null, 2)}\n`);
  if (args.releaseProfile === "full" && verification.status === "fail") {
    throw new Error(
      `Full map release verification failed with ${verification.issueCount} issue(s); see ${manifestPath}.`,
    );
  }

  return {
    isoMonth: options.isoMonth,
    manifestPath,
    artifactCount: verifiedManifest.artifactCount,
    routeSegmentArtifactCount: verifiedManifest.routeSegmentArtifactCount,
    routeSegmentFeatureCount,
    totalFeatureCount: verifiedManifest.totalFeatureCount,
    totalByteLength: verifiedManifest.totalByteLength,
    publicRouteCount: selectedRouteRows.length,
  };
}

export default defineCommand({
  path: ["map", "artifacts"],
  summary: "Build map GeoJSON artifacts (routes, stops, bus lanes, route segments) and manifest.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        speedSpineRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override route speed-spine artifact root",
        }),
        routes: Schema.optionalKey(Schema.String).annotate({
          description: "Comma-separated route IDs to include",
        }),
        routeShapeSnapshot: Schema.optionalKey(Schema.String).annotate({
          description: "Override route-shape snapshot path",
        }),
        stopSnapshot: Schema.optionalKey(Schema.String).annotate({
          description: "Override stop snapshot path",
        }),
        busLaneSnapshot: Schema.optionalKey(Schema.String).annotate({
          description: "Override bus-lane snapshot path",
        }),
        context: Schema.optionalKey(Schema.String).annotate({
          description: "Override generated borough-context artifact path",
        }),
        routeFacts: Schema.optionalKey(Schema.String).annotate({
          description: "Override compact same-month map-route-facts projection path",
        }),
        profile: Schema.Literals(["demo", "full"])
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("demo")))
          .annotate({ description: "Map release profile" }),
      },
    }),
  },
  output: Schema.Struct({
    isoMonth: Schema.String,
    manifestPath: Schema.String,
    artifactCount: Schema.Number,
    routeSegmentArtifactCount: Schema.Number,
    routeSegmentFeatureCount: Schema.Number,
    totalFeatureCount: Schema.Number,
    totalByteLength: Schema.Number,
    publicRouteCount: Schema.Number,
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const speedSpineRoot =
      input.options.speedSpineRoot === undefined
        ? undefined
        : fromCliPath(input.options.speedSpineRoot);
    const routeShapeSnapshotPath =
      input.options.routeShapeSnapshot === undefined
        ? undefined
        : fromCliPath(input.options.routeShapeSnapshot);
    const stopSnapshotPath =
      input.options.stopSnapshot === undefined
        ? undefined
        : fromCliPath(input.options.stopSnapshot);
    const busLaneSnapshotPath =
      input.options.busLaneSnapshot === undefined
        ? undefined
        : fromCliPath(input.options.busLaneSnapshot);
    const contextPath =
      input.options.context === undefined ? undefined : fromCliPath(input.options.context);
    const routeFactsPath =
      input.options.routeFacts === undefined ? undefined : fromCliPath(input.options.routeFacts);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "map.artifacts",
      operation: "runMapArtifacts",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
      },
      run: (local) =>
        runMapArtifacts({
          local,
          year: input.options.year,
          month: input.options.month,
          releaseProfile: input.options.profile,
          artifactRoot,
          speedSpineRoot,
          routeShapeSnapshotPath,
          stopSnapshotPath,
          busLaneSnapshotPath,
          contextPath,
          routeFactsPath,
          routeIds: input.options.routes?.split(",").map((routeId) => routeId.trim()),
        }),
    });
  },
});

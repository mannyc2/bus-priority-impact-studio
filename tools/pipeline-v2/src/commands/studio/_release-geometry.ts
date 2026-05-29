import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type LocalBusLane, listBusLanes, listRouteSegmentSpeeds } from "@bp/db/local";
import {
  type NormalizedRouteShape,
  type NormalizedStop,
  normalizeRouteShapeRows,
  normalizeStopRows,
  type SocrataRow,
} from "@bp/sources";
import { fromRepoRoot } from "../../lib/paths.ts";
import { openLocalPipelineDb } from "../../lib/local-db.ts";
import type {
  BBox,
  BusLanePath,
  Coordinate,
  Projection,
  RawSourceSnapshot,
  RawTspSourceMetadata,
  RouteBriefInputArtifact,
  RouteGeometrySummary,
  RouteShapePath,
  SegmentEndpoints,
  SegmentLaneOverlap,
  TspEvidence,
} from "./_release-types.ts";

export async function readJsonIfExists<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as T;
}

export async function readTextIfExists(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  return file.text();
}

export function finiteNumber(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function metersBetween(left: Coordinate, right: Coordinate): number {
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = radians(right.latitude - left.latitude);
  const deltaLongitude = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pathLengthMeters(coordinates: readonly Coordinate[]): number {
  return coordinates.reduce((sum, coordinate, index) => {
    const prior = coordinates[index - 1];
    return prior === undefined ? sum : sum + metersBetween(prior, coordinate);
  }, 0);
}

function coordinateFromPair(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

export function coordinatesFromGeometry(geometry: unknown): Coordinate[] {
  if (typeof geometry !== "object" || geometry === null) return [];
  const value = geometry as { type?: unknown; coordinates?: unknown };
  if (value.type === "LineString" && Array.isArray(value.coordinates)) {
    return value.coordinates.flatMap((pair) => {
      const coordinate = coordinateFromPair(pair);
      return coordinate === null ? [] : [coordinate];
    });
  }
  if (value.type === "MultiLineString" && Array.isArray(value.coordinates)) {
    return value.coordinates.flatMap((line) =>
      Array.isArray(line)
        ? line.flatMap((pair) => {
            const coordinate = coordinateFromPair(pair);
            return coordinate === null ? [] : [coordinate];
          })
        : [],
    );
  }
  return [];
}

export function shapeLengthMiles(shape: NormalizedRouteShape): number {
  const sourceLengthFeet = finiteNumber(shape.shapeLength);
  return sourceLengthFeet === null
    ? pathLengthMeters(coordinatesFromGeometry(shape.geometry)) * 0.000621371
    : sourceLengthFeet / 5280;
}

export function nearestStopName(
  stops: readonly NormalizedStop[],
  coordinate: Coordinate,
): string | null {
  const candidates = stops.filter((stop) => stop.inEffect && stop.timepoint);
  const usableStops = candidates.length > 0 ? candidates : stops.filter((stop) => stop.inEffect);
  let best: { name: string; distanceMeters: number } | null = null;
  for (const stop of usableStops) {
    const distanceMeters = metersBetween(coordinate, {
      latitude: stop.latitude,
      longitude: stop.longitude,
    });
    if (best === null || distanceMeters < best.distanceMeters) {
      best = { name: stop.stopName, distanceMeters };
    }
  }
  return best?.name ?? null;
}

export function longNameEndpoints(routeLongName: string | null, fallback: string) {
  const parts = routeLongName?.split(" - ").map((part) => part.trim()) ?? [];
  return {
    start: parts[0] && parts[0].length > 0 ? parts[0] : fallback,
    end: parts[1] && parts[1].length > 0 ? parts[1] : "Terminal",
  };
}

export function groupByRouteId<T extends { routeId: string }>(rows: readonly T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const group = result.get(row.routeId) ?? [];
    group.push(row);
    result.set(row.routeId, group);
  }
  return result;
}

export function routeShapePaths(rows: readonly NormalizedRouteShape[]): RouteShapePath[] {
  return rows.flatMap((shape) => {
    if (!shape.inEffect) return [];
    const coordinates = coordinatesFromGeometry(shape.geometry);
    if (coordinates.length < 2) return [];
    return [
      {
        routeId: shape.routeId,
        direction: shape.direction,
        shapeId: shape.shapeId,
        coordinates,
      },
    ];
  });
}

export function assertRouteGeometryCoverage(
  routeIds: readonly string[],
  routeGeometry: ReadonlyMap<string, RouteGeometrySummary>,
): void {
  const missing = routeIds.filter((routeId) => !routeGeometry.has(routeId));
  if (missing.length === 0) return;
  throw new Error(
    `Studio release requires route-shape geometry for laneCoverage; missing ${missing.length} route(s): ${missing
      .slice(0, 20)
      .join(", ")}${missing.length > 20 ? ", ..." : ""}`,
  );
}

export function groupShapePathsByRouteDirection(
  shapes: readonly RouteShapePath[],
): Map<string, RouteShapePath[]> {
  const output = new Map<string, RouteShapePath[]>();
  for (const shape of shapes) {
    const key = `${shape.routeId}:${shape.direction}`;
    const group = output.get(key) ?? [];
    group.push(shape);
    output.set(key, group);
  }
  for (const [key, group] of output) {
    output.set(
      key,
      group.toSorted(
        (left, right) =>
          pathLengthMeters(right.coordinates) - pathLengthMeters(left.coordinates) ||
          left.shapeId.localeCompare(right.shapeId),
      ),
    );
  }
  return output;
}

export function stopCoordinateIndex(stops: readonly NormalizedStop[]): Map<string, Coordinate> {
  const output = new Map<string, Coordinate>();
  for (const stop of stops.filter((row) => row.inEffect)) {
    const coordinate = { latitude: stop.latitude, longitude: stop.longitude };
    output.set(`${stop.routeId}:${stop.direction}:${stop.stopId}`, coordinate);
    if (!output.has(`${stop.routeId}:*:${stop.stopId}`)) {
      output.set(`${stop.routeId}:*:${stop.stopId}`, coordinate);
    }
  }
  return output;
}

export function parseRouteBriefSegmentId(
  segment: NonNullable<RouteBriefInputArtifact["topSegments"]>[number],
): { direction: string; fromStopId: string; toStopId: string } | null {
  const parts = segment.segmentId.split(":");
  if (parts.length < 6) return null;
  const direction = parts.at(-4) ?? segment.direction;
  const fromStopId = parts.at(-2);
  const toStopId = parts.at(-1);
  return fromStopId === undefined || toStopId === undefined
    ? null
    : { direction, fromStopId, toStopId };
}

export function routeBriefSegmentCoreId(segmentId: string): string {
  const parts = segmentId.split(":");
  return parts.length < 4 ? segmentId : parts.slice(-4).join(":");
}

export async function routeSegmentEndpointIndex(args: {
  localDbPath: string;
  isoMonth: string;
  routeIds: readonly string[];
}): Promise<Map<string, Map<string, SegmentEndpoints>>> {
  const local = await openLocalPipelineDb(args.localDbPath);
  try {
    const entries = await Promise.all(
      args.routeIds.map(async (routeId) => {
        const rows = await listRouteSegmentSpeeds(local.db, routeId, args.isoMonth);
        const bySegment = new Map<string, SegmentEndpoints>();
        for (const row of rows) {
          const coreId = [
            row.direction,
            row.stopOrder,
            row.timepointStopId,
            row.nextTimepointStopId,
          ].join(":");
          if (!bySegment.has(coreId)) {
            bySegment.set(coreId, {
              from: {
                latitude: row.timepointStopLatitude,
                longitude: row.timepointStopLongitude,
              },
              to: {
                latitude: row.nextTimepointStopLatitude,
                longitude: row.nextTimepointStopLongitude,
              },
            });
          }
        }
        return [routeId, bySegment] as const;
      }),
    );
    return new Map(entries);
  } finally {
    local.sqlite.close();
  }
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
  const coordinate = {
    longitude: (sx + segmentShare * dx) / metersPerDegreeLongitude,
    latitude: (sy + segmentShare * dy) / metersPerDegreeLatitude,
  };
  return {
    coordinate,
    distanceMeters: metersBetween(point, coordinate),
    segmentShare,
  };
}

function projectPointToShape(point: Coordinate, shape: RouteShapePath): Projection | null {
  let best: Projection | null = null;
  let accumulatedMeters = 0;

  for (let index = 0; index < shape.coordinates.length - 1; index += 1) {
    const start = shape.coordinates[index];
    const end = shape.coordinates[index + 1];
    if (start === undefined || end === undefined) continue;
    const segmentLengthMeters = metersBetween(start, end);
    const projection = projectPointToSegment(point, start, end);
    const candidate = {
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
    if (coordinate !== undefined) coordinates.push(coordinate);
  }

  coordinates.push(end.coordinate);
  return forward ? coordinates : coordinates.toReversed();
}

export function segmentShapeCoordinates(
  shapes: readonly RouteShapePath[],
  from: Coordinate,
  to: Coordinate,
): Coordinate[] | null {
  let best: {
    orderPenalty: number;
    distanceToShapeMeters: number;
    coordinates: Coordinate[];
  } | null = null;

  for (const shape of shapes) {
    const start = projectPointToShape(from, shape);
    const end = projectPointToShape(to, shape);
    if (start === null || end === null) continue;
    const coordinates = sliceShape(shape, start, end);
    if (coordinates.length < 2) continue;
    const candidate = {
      orderPenalty: start.distanceAlongMeters <= end.distanceAlongMeters ? 0 : 1_000_000,
      distanceToShapeMeters: start.distanceToLineMeters + end.distanceToLineMeters,
      coordinates,
    };
    if (
      best === null ||
      candidate.orderPenalty + candidate.distanceToShapeMeters <
        best.orderPenalty + best.distanceToShapeMeters
    ) {
      best = candidate;
    }
  }

  return best?.coordinates ?? null;
}

function bboxForCoordinates(coordinates: readonly Coordinate[]): BBox {
  return {
    latitudeMin: Math.min(...coordinates.map((coordinate) => coordinate.latitude)),
    latitudeMax: Math.max(...coordinates.map((coordinate) => coordinate.latitude)),
    longitudeMin: Math.min(...coordinates.map((coordinate) => coordinate.longitude)),
    longitudeMax: Math.max(...coordinates.map((coordinate) => coordinate.longitude)),
  };
}

function bboxIntersects(left: BBox, right: BBox, paddingDegrees: number): boolean {
  return !(
    left.latitudeMax + paddingDegrees < right.latitudeMin ||
    left.latitudeMin - paddingDegrees > right.latitudeMax ||
    left.longitudeMax + paddingDegrees < right.longitudeMin ||
    left.longitudeMin - paddingDegrees > right.longitudeMax
  );
}

export function busLanePaths(lanes: readonly LocalBusLane[]): BusLanePath[] {
  return lanes.flatMap((lane) =>
    lane.coordinates.length < 2
      ? []
      : [
          {
            segmentId: lane.segmentId,
            laneType: lane.laneType ?? null,
            hours: lane.hours ?? null,
            days: lane.days ?? null,
            coordinates: lane.coordinates,
            bbox: bboxForCoordinates(lane.coordinates),
          },
        ],
  );
}

function distinctNonEmpty(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].map((value) => value?.trim()).filter((value) => value !== ""))]
    .filter((value): value is string => value !== undefined)
    .toSorted((left, right) => left.localeCompare(right));
}

function distanceToLineMeters(point: Coordinate, coordinates: readonly Coordinate[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    if (start === undefined || end === undefined) continue;
    best = Math.min(best, projectPointToSegment(point, start, end).distanceMeters);
  }
  return best;
}

const busLaneOverlapThresholdMeters = 45;

export function laneOverlapForSegment(
  segmentCoordinates: readonly Coordinate[],
  lanes: readonly BusLanePath[],
): SegmentLaneOverlap {
  let totalMeters = 0;
  let coveredMeters = 0;
  const matchedLanes = new Map<string, BusLanePath>();
  const paddingDegrees = busLaneOverlapThresholdMeters / 111_320;

  for (let index = 0; index < segmentCoordinates.length - 1; index += 1) {
    const start = segmentCoordinates[index];
    const end = segmentCoordinates[index + 1];
    if (start === undefined || end === undefined) continue;
    const lengthMeters = metersBetween(start, end);
    if (lengthMeters === 0) continue;
    totalMeters += lengthMeters;
    const midpoint = {
      longitude: (start.longitude + end.longitude) / 2,
      latitude: (start.latitude + end.latitude) / 2,
    };
    const pieceBbox = bboxForCoordinates([start, end]);
    const matchedLane = lanes.find((lane) => {
      if (!bboxIntersects(pieceBbox, lane.bbox, paddingDegrees)) return false;
      const distance = distanceToLineMeters(midpoint, lane.coordinates);
      if (distance <= busLaneOverlapThresholdMeters) {
        matchedLanes.set(lane.segmentId, lane);
        return true;
      }
      return false;
    });
    if (matchedLane !== undefined) {
      coveredMeters += lengthMeters;
    }
  }

  const laneOverlapShare =
    totalMeters === 0 ? 0 : Number(Math.min(1, coveredMeters / totalMeters).toFixed(4));
  const laneMatchedCount = matchedLanes.size;
  const lane: SegmentLaneOverlap["lane"] =
    laneMatchedCount === 0 || laneOverlapShare === 0
      ? "none"
      : laneOverlapShare >= 0.6
        ? "yes"
        : laneOverlapShare >= 0.2
          ? "partial"
          : "minimal";
  return {
    lane,
    laneSource: "dot_bus_lanes_geometry",
    laneOverlapShare,
    laneMatchedCount,
    laneTypes: distinctNonEmpty([...matchedLanes.values()].map((matched) => matched.laneType)),
    laneOperatingHours: distinctNonEmpty(
      [...matchedLanes.values()].map((matched) => matched.hours),
    ),
    laneOperatingDays: distinctNonEmpty([...matchedLanes.values()].map((matched) => matched.days)),
    segmentGeometry: {
      type: "LineString",
      coordinates: segmentCoordinates.map((coordinate) => [
        Number(coordinate.longitude.toFixed(6)),
        Number(coordinate.latitude.toFixed(6)),
      ]),
    },
  };
}

export function unavailableLaneOverlap(): SegmentLaneOverlap {
  return {
    lane: "none",
    laneSource: "geometry_unavailable",
    laneOverlapShare: 0,
    laneMatchedCount: 0,
    laneTypes: [],
    laneOperatingHours: [],
    laneOperatingDays: [],
    segmentGeometry: null,
  };
}

const tspSourceRoutes: Array<{
  routeIds: string[];
  labels: string[];
  status: Extract<TspEvidence["tspStatus"], "installed" | "candidate">;
  corridor: string;
  streetMatchers: string[];
}> = [
  {
    routeIds: ["S79+"],
    labels: ["S79 SBS"],
    status: "installed",
    corridor: "Hylan Boulevard",
    streetMatchers: ["HYLAN", "RICHMOND AV", "YUKON", "92ND", "DAHLGREN", "FT HAMILTON"],
  },
  {
    routeIds: ["M15+"],
    labels: ["M15 SBS"],
    status: "installed",
    corridor: "First/Second Avenue",
    streetMatchers: ["1 AV", "FIRST", "2 AV", "SECOND", "ALLEN", "SOUTH FERRY", "HOUSTON"],
  },
  {
    routeIds: ["B44+"],
    labels: ["B44 SBS"],
    status: "installed",
    corridor: "Nostrand Avenue",
    streetMatchers: ["NOSTRAND", "FLATBUSH", "ROGERS", "KNAPP", "SHORE"],
  },
  {
    routeIds: ["B46+"],
    labels: ["B46 SBS"],
    status: "installed",
    corridor: "Utica Avenue",
    streetMatchers: ["UTICA", "MALCOLM X", "KINGS PLAZA"],
  },
  {
    routeIds: ["BX41+"],
    labels: ["BX41 SBS", "Bx41 SBS"],
    status: "installed",
    corridor: "Webster Avenue",
    streetMatchers: ["WEBSTER", "MELROSE", "3 AV", "THIRD", "GUN HILL", "WHITE PLAINS"],
  },
  {
    routeIds: ["M60+"],
    labels: ["M60 SBS", "M60 Select Bus Service"],
    status: "candidate",
    corridor: "125th Street / LaGuardia Airport",
    streetMatchers: ["125 ST", "LAGUARDIA", "HOYT", "ASTORIA"],
  },
  {
    routeIds: ["Q44+"],
    labels: ["Q44 SBS", "Q44 Select Bus Service"],
    status: "candidate",
    corridor: "Flushing to Jamaica",
    streetMatchers: ["MAIN ST", "MERRICK", "PARSONS"],
  },
  {
    routeIds: ["Q25"],
    labels: ["Q25"],
    status: "candidate",
    corridor: "Kissena Boulevard",
    streetMatchers: ["KISSENA"],
  },
  {
    routeIds: ["Q43"],
    labels: ["Q43"],
    status: "candidate",
    corridor: "Hillside Avenue",
    streetMatchers: ["HILLSIDE"],
  },
  {
    routeIds: ["Q5"],
    labels: ["Q5"],
    status: "candidate",
    corridor: "Merrick Boulevard",
    streetMatchers: ["MERRICK"],
  },
  {
    routeIds: ["Q52+", "Q53+"],
    labels: ["Q52/Q53 SBS", "Q52/Q53"],
    status: "candidate",
    corridor: "Woodhaven / Cross Bay Boulevard",
    streetMatchers: ["WOODHAVEN", "CROSS BAY"],
  },
  {
    routeIds: ["B82", "B82+"],
    labels: ["B82"],
    status: "candidate",
    corridor: "Southern Brooklyn",
    streetMatchers: ["FLATLANDS", "KINGS HWY", "ROCKAWAY", "PENNSYLVANIA"],
  },
  {
    routeIds: ["BX12+"],
    labels: ["BX12 SBS", "Bx12 SBS"],
    status: "candidate",
    corridor: "Fordham Road",
    streetMatchers: ["FORDHAM", "PELHAM"],
  },
  {
    routeIds: ["BX6", "BX6+"],
    labels: ["BX6", "Bx6"],
    status: "candidate",
    corridor: "South Bronx",
    streetMatchers: ["163 ST", "HUNTS POINT", "RIVERSIDE"],
  },
  {
    routeIds: ["S62"],
    labels: ["S62"],
    status: "candidate",
    corridor: "Victory Boulevard",
    streetMatchers: ["VICTORY"],
  },
  {
    routeIds: ["S92"],
    labels: ["S92"],
    status: "candidate",
    corridor: "Victory Boulevard",
    streetMatchers: ["VICTORY"],
  },
];

export function unknownTspEvidence(): TspEvidence {
  return {
    tspStatus: "unknown",
    tspSource: "not_in_ingested_tsp_sources",
    tspSourceDate: null,
    tspSourceUrl: null,
    tspCorridor: null,
    tspMatchMethod: "not_matched_in_ingested_sources",
    streetMatchers: [],
  };
}

export function normalizeTspText(value: string): string {
  return value.toUpperCase().replace(/&AMP;/g, "&").replace(/\s+/g, " ");
}

export async function tspEvidenceIndex(sourcePath: string): Promise<Map<string, TspEvidence>> {
  const sourceDir = fromRepoRoot(sourcePath);
  const [metadata, text] = await Promise.all([
    readJsonIfExists<RawTspSourceMetadata>(join(sourceDir, "metadata.json")),
    readTextIfExists(join(sourceDir, "text.txt")),
  ]);
  const output = new Map<string, TspEvidence>();
  if (metadata === null || text === null) {
    return output;
  }

  const normalizedText = normalizeTspText(text);
  const sourceDate = metadata.documentDate ?? null;
  const sourceUrl = metadata.finalUrl ?? metadata.sourceUrl ?? null;

  for (const route of tspSourceRoutes) {
    const mentioned = route.labels.some((label) =>
      normalizedText.includes(normalizeTspText(label)),
    );
    if (!mentioned) continue;
    const evidence: TspEvidence = {
      tspStatus: route.status,
      tspSource: "nyc_dot_tsp_status_2017",
      tspSourceDate: sourceDate,
      tspSourceUrl: sourceUrl,
      tspCorridor: route.corridor,
      tspMatchMethod: "route_label_in_2017_status_snapshot",
      streetMatchers: route.streetMatchers,
    };
    for (const routeId of route.routeIds) {
      output.set(routeId, evidence);
    }
  }

  return output;
}

export function tspStatusForSegment(
  segment: NonNullable<RouteBriefInputArtifact["topSegments"]>[number],
  evidence: TspEvidence,
): TspEvidence["tspStatus"] {
  if (evidence.tspStatus !== "installed") {
    return evidence.tspStatus;
  }

  if (evidence.streetMatchers.length === 0) {
    return "unknown";
  }

  const segmentText = normalizeTspText(`${segment.from ?? ""} ${segment.to ?? ""}`);
  return evidence.streetMatchers.some((matcher) => segmentText.includes(matcher))
    ? "installed"
    : "unknown";
}

export function tspMatchMethodForSegment(
  segment: NonNullable<RouteBriefInputArtifact["topSegments"]>[number],
  evidence: TspEvidence,
): TspEvidence["tspMatchMethod"] {
  if (evidence.tspSource !== "nyc_dot_tsp_status_2017") {
    return "not_matched_in_ingested_sources";
  }
  if (evidence.tspStatus !== "installed" || evidence.streetMatchers.length === 0) {
    return "route_level_status_only";
  }
  const segmentText = normalizeTspText(`${segment.from ?? ""} ${segment.to ?? ""}`);
  return evidence.streetMatchers.some((matcher) => segmentText.includes(matcher))
    ? "segment_endpoint_text_match"
    : "route_level_status_only";
}

export async function routeGeometryIndex(
  routeShapeSnapshotPath: string,
  stopSnapshotPath: string,
  localDbPath: string,
): Promise<Map<string, RouteGeometrySummary>> {
  const local = await openLocalPipelineDb(localDbPath);
  let lanes: LocalBusLane[];
  try {
    lanes = [...(await listBusLanes(local.db))];
  } finally {
    local.sqlite.close();
  }
  const [shapeSnapshot, stopSnapshot] = await Promise.all([
    readJsonIfExists<RawSourceSnapshot>(fromRepoRoot(routeShapeSnapshotPath)),
    readJsonIfExists<RawSourceSnapshot>(fromRepoRoot(stopSnapshotPath)),
  ]);
  const shapeRows = shapeSnapshot?.rows;
  const stopRows = stopSnapshot?.rows;
  if (shapeRows === undefined || stopRows === undefined) {
    return new Map();
  }

  const shapesByRoute = groupByRouteId(
    normalizeRouteShapeRows(shapeRows).filter((shape) => shape.inEffect),
  );
  const stopsByRoute = groupByRouteId(normalizeStopRows(stopRows).filter((stop) => stop.inEffect));
  const lanePaths = busLanePaths(lanes);
  const result = new Map<string, RouteGeometrySummary>();

  for (const [routeId, shapes] of shapesByRoute) {
    const primaryShape = shapes
      .map((shape) => ({
        shape,
        coordinates: coordinatesFromGeometry(shape.geometry),
        lengthMiles: shapeLengthMiles(shape),
      }))
      .filter((shape) => shape.lengthMiles > 0)
      .toSorted(
        (left, right) =>
          right.lengthMiles - left.lengthMiles ||
          right.coordinates.length - left.coordinates.length ||
          left.shape.shapeId.localeCompare(right.shape.shapeId),
      )[0];
    if (primaryShape === undefined) continue;

    const stops = stopsByRoute.get(routeId) ?? [];
    const firstCoordinate = primaryShape.coordinates[0];
    const lastCoordinate = primaryShape.coordinates.at(-1);
    const laneOverlap = laneOverlapForSegment(primaryShape.coordinates, lanePaths);
    const fallback = longNameEndpoints(
      primaryShape.shape.routeLongName ?? null,
      primaryShape.shape.routeShortName,
    );
    result.set(routeId, {
      miles: Number(primaryShape.lengthMiles.toFixed(1)),
      laneCoverage: Math.round(laneOverlap.laneOverlapShare * 100),
      laneCoverageSource: "dot_bus_lanes_geometry",
      laneTypes: laneOverlap.laneTypes,
      laneOperatingHours: laneOverlap.laneOperatingHours,
      laneOperatingDays: laneOverlap.laneOperatingDays,
      endpoints:
        firstCoordinate === undefined || lastCoordinate === undefined
          ? fallback
          : {
              start: nearestStopName(stops, firstCoordinate) ?? fallback.start,
              end: nearestStopName(stops, lastCoordinate) ?? fallback.end,
            },
    });
  }

  return result;
}

export async function segmentLaneOverlapIndex(args: {
  localDbPath: string;
  isoMonth: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  routeInputs: ReadonlyMap<string, RouteBriefInputArtifact | null>;
}): Promise<Map<string, Map<string, SegmentLaneOverlap>>> {
  const routeIds = [...args.routeInputs.keys()].sort();
  const local = await openLocalPipelineDb(args.localDbPath);
  let lanes: LocalBusLane[];
  try {
    lanes = [...(await listBusLanes(local.db))];
  } finally {
    local.sqlite.close();
  }
  const [shapeSnapshot, stopSnapshot, routeSegmentEndpoints] = await Promise.all([
    readJsonIfExists<RawSourceSnapshot>(fromRepoRoot(args.routeShapeSnapshotPath)),
    readJsonIfExists<RawSourceSnapshot>(fromRepoRoot(args.stopSnapshotPath)),
    routeSegmentEndpointIndex({
      localDbPath: args.localDbPath,
      isoMonth: args.isoMonth,
      routeIds,
    }),
  ]);
  const output = new Map<string, Map<string, SegmentLaneOverlap>>();
  const shapeRows = shapeSnapshot?.rows;
  const stopRows = stopSnapshot?.rows;
  if (shapeRows === undefined || stopRows === undefined) {
    for (const [routeId, artifact] of args.routeInputs) {
      output.set(
        routeId,
        new Map(
          (artifact?.segments ?? artifact?.topSegments ?? []).map((segment) => [
            segment.segmentId,
            unavailableLaneOverlap(),
          ]),
        ),
      );
    }
    return output;
  }

  const shapesByRouteDirection = groupShapePathsByRouteDirection(
    routeShapePaths(normalizeRouteShapeRows(shapeRows)),
  );
  const stopsByKey = stopCoordinateIndex(normalizeStopRows(stopRows));
  const lanePaths = busLanePaths(lanes);

  for (const [routeId, artifact] of args.routeInputs) {
    const bySegment = new Map<string, SegmentLaneOverlap>();
    for (const segment of artifact?.segments ?? artifact?.topSegments ?? []) {
      const parsed = parseRouteBriefSegmentId(segment);
      const from =
        parsed === null
          ? undefined
          : (stopsByKey.get(`${routeId}:${parsed.direction}:${parsed.fromStopId}`) ??
            stopsByKey.get(`${routeId}:*:${parsed.fromStopId}`) ??
            routeSegmentEndpoints.get(routeId)?.get(routeBriefSegmentCoreId(segment.segmentId))
              ?.from);
      const to =
        parsed === null
          ? undefined
          : (stopsByKey.get(`${routeId}:${parsed.direction}:${parsed.toStopId}`) ??
            stopsByKey.get(`${routeId}:*:${parsed.toStopId}`) ??
            routeSegmentEndpoints.get(routeId)?.get(routeBriefSegmentCoreId(segment.segmentId))
              ?.to);
      const shapes =
        parsed === null ? [] : (shapesByRouteDirection.get(`${routeId}:${parsed.direction}`) ?? []);
      const segmentCoordinates =
        from === undefined || to === undefined ? null : segmentShapeCoordinates(shapes, from, to);
      bySegment.set(
        segment.segmentId,
        segmentCoordinates === null
          ? unavailableLaneOverlap()
          : laneOverlapForSegment(segmentCoordinates, lanePaths),
      );
    }
    output.set(routeId, bySegment);
  }

  return output;
}

// Re-exports used by other release helpers
export { readdir, readFile };
export type { SocrataRow };

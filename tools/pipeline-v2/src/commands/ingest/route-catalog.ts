import { join } from "node:path";
import { replaceRouteCatalog } from "@bp/db/local";
import { z } from "@bp/pipeline-v2/cli/compat";
import {
  type NormalizedRouteShape,
  type NormalizedStop,
  normalizeRouteShapeRows,
  normalizeStopRows,
} from "@bp/sources/adapters/mta/routes-stops";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { fetchSoda3RowsForSource, type SocrataFetch } from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const schemaVersion = 1;

export type RouteCatalogRunInputs = {
  local: OpenLocalPipelineDb;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  rawDir?: string | undefined;
};

export type RouteCatalogIngestResult = {
  rawDir: string;
  routeCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
  dbPath: string;
};

type Coordinate = { longitude: number; latitude: number };

type RouteCatalogEntry = {
  schemaVersion: typeof schemaVersion;
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
  routeTypes: string[];
  tripTypes: string[];
  bundles: string[];
  directions: string[];
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
  routeMiles: number | null;
  terminalAName: string | null;
  terminalBName: string | null;
  latitudeMin: number | null;
  latitudeMax: number | null;
  longitudeMin: number | null;
  longitudeMax: number | null;
};

function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== undefined))].sort();
}

function routeBounds(stops: NormalizedStop[]) {
  if (stops.length === 0) {
    return { latitudeMin: null, latitudeMax: null, longitudeMin: null, longitudeMax: null };
  }
  return {
    latitudeMin: Math.min(...stops.map((s) => s.latitude)),
    latitudeMax: Math.max(...stops.map((s) => s.latitude)),
    longitudeMin: Math.min(...stops.map((s) => s.longitude)),
    longitudeMax: Math.max(...stops.map((s) => s.longitude)),
  };
}

function finiteNumber(v: number | undefined): number | null {
  return v === undefined || !Number.isFinite(v) ? null : v;
}

function radians(v: number): number {
  return (v * Math.PI) / 180;
}

function metersBetween(left: Coordinate, right: Coordinate): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = radians(right.latitude - left.latitude);
  const dLng = radians(right.longitude - left.longitude);
  const lLat = radians(left.latitude);
  const rLat = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lLat) * Math.cos(rLat) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathLengthMeters(coords: readonly Coordinate[]): number {
  return coords.reduce((sum, c, i) => {
    const prior = coords[i - 1];
    return prior === undefined ? sum : sum + metersBetween(prior, c);
  }, 0);
}

function coordinateFromPair(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

function coordinatesFromGeometry(geometry: unknown): Coordinate[] {
  if (typeof geometry !== "object" || geometry === null) return [];
  const v = geometry as { type?: unknown; coordinates?: unknown };
  if (v.type === "LineString" && Array.isArray(v.coordinates)) {
    return v.coordinates.flatMap((pair) => {
      const c = coordinateFromPair(pair);
      return c === null ? [] : [c];
    });
  }
  if (v.type === "MultiLineString" && Array.isArray(v.coordinates)) {
    return v.coordinates.flatMap((line) =>
      Array.isArray(line)
        ? line.flatMap((pair) => {
            const c = coordinateFromPair(pair);
            return c === null ? [] : [c];
          })
        : [],
    );
  }
  return [];
}

function shapeLengthMiles(shape: NormalizedRouteShape): number {
  const sourceLengthFeet = finiteNumber(shape.shapeLength);
  return sourceLengthFeet === null
    ? pathLengthMeters(coordinatesFromGeometry(shape.geometry)) * 0.000621371
    : sourceLengthFeet / 5280;
}

function nearestStopName(stops: readonly NormalizedStop[], c: Coordinate): string | null {
  const timepointStops = stops.filter((s) => s.timepoint);
  const candidates = timepointStops.length > 0 ? timepointStops : stops;
  let best: { name: string; distanceMeters: number } | null = null;
  for (const stop of candidates) {
    const distanceMeters = metersBetween(c, { latitude: stop.latitude, longitude: stop.longitude });
    if (best === null || distanceMeters < best.distanceMeters) {
      best = { name: stop.stopName, distanceMeters };
    }
  }
  return best?.name ?? null;
}

function routeTerminiFromLongName(routeLongName: string | null) {
  const [first, second] = routeLongName?.split(" - ").map((p) => p.trim()) ?? [];
  return {
    terminalAName: first && first.length > 0 ? first : null,
    terminalBName: second && second.length > 0 ? second : null,
  };
}

function routeGeometrySummary(shapes: NormalizedRouteShape[], stops: NormalizedStop[]) {
  const primaryShape = shapes
    .map((shape) => ({
      shape,
      coordinates: coordinatesFromGeometry(shape.geometry),
      lengthMiles: shapeLengthMiles(shape),
    }))
    .filter((s) => s.lengthMiles > 0)
    .toSorted(
      (l, r) =>
        r.lengthMiles - l.lengthMiles ||
        r.coordinates.length - l.coordinates.length ||
        l.shape.shapeId.localeCompare(r.shape.shapeId),
    )[0];
  const fallback = routeTerminiFromLongName(
    primaryShape?.shape.routeLongName ?? shapes[0]?.routeLongName ?? null,
  );
  if (primaryShape === undefined) {
    return { routeMiles: null, ...fallback };
  }
  const firstCoordinate = primaryShape.coordinates[0];
  const lastCoordinate = primaryShape.coordinates.at(-1);
  return {
    routeMiles: Number(primaryShape.lengthMiles.toFixed(1)),
    terminalAName:
      firstCoordinate === undefined
        ? fallback.terminalAName
        : (nearestStopName(stops, firstCoordinate) ?? fallback.terminalAName),
    terminalBName:
      lastCoordinate === undefined
        ? fallback.terminalBName
        : (nearestStopName(stops, lastCoordinate) ?? fallback.terminalBName),
  };
}

function buildCatalogEntry(
  routeId: string,
  shapes: NormalizedRouteShape[],
  stops: NormalizedStop[],
): RouteCatalogEntry {
  const firstShape = shapes[0];
  const firstStop = stops[0];
  return {
    schemaVersion,
    routeId,
    routeShortName: firstShape?.routeShortName ?? firstStop?.routeShortName ?? routeId,
    routeLongName: firstShape?.routeLongName ?? null,
    routeTypes: uniqueSorted(shapes.map((s) => s.routeType)),
    tripTypes: uniqueSorted(shapes.map((s) => s.tripType)),
    bundles: uniqueSorted(shapes.map((s) => s.bundle)),
    directions: uniqueSorted([...shapes.map((s) => s.direction), ...stops.map((s) => s.direction)]),
    shapeCount: shapes.length,
    stopCount: stops.length,
    timepointStopCount: stops.filter((s) => s.timepoint).length,
    ...routeGeometrySummary(shapes, stops),
    ...routeBounds(stops),
  };
}

function buildCatalog(
  shapes: NormalizedRouteShape[],
  stops: NormalizedStop[],
): RouteCatalogEntry[] {
  const routeIds = new Set([...shapes.map((s) => s.routeId), ...stops.map((s) => s.routeId)]);
  return [...routeIds].sort().map((routeId) =>
    buildCatalogEntry(
      routeId,
      shapes.filter((s) => s.routeId === routeId),
      stops.filter((s) => s.routeId === routeId),
    ),
  );
}

export async function runRouteCatalogIngest(
  inputs: RouteCatalogRunInputs,
): Promise<RouteCatalogIngestResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const routeSource = getSocrataSource(manifest, "current_bus_routes");
  const stopSource = getSocrataSource(manifest, "current_bus_stops");
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawDir = inputs.rawDir ?? fromRepoRoot(join("data/raw/network"));
  const routeQuery = { where: "in_effect='true'", order: "route_id,direction_id,shape_id" };
  const stopQuery = { where: "in_effect='true'", order: "route_id,direction_id,stop_id" };
  const [routeRows, stopRows] = await Promise.all([
    fetchSoda3RowsForSource(routeSource, routeQuery, { fetcher: inputs.fetcher }),
    fetchSoda3RowsForSource(stopSource, stopQuery, { fetcher: inputs.fetcher }),
  ]);
  const routeShapes = normalizeRouteShapeRows([...routeRows]);
  const stops = normalizeStopRows([...stopRows]);
  const catalog = buildCatalog(routeShapes, stops);
  const timepointStopCount = stops.filter((s) => s.timepoint).length;

  await replaceRouteCatalog(inputs.local.db, catalog);

  await Promise.all([
    writeRawSourceSnapshot({
      path: join(rawDir, "current_bus_routes.json"),
      sourceId: "current_bus_routes",
      fetchedAt,
      query: routeQuery,
      rows: [...routeRows],
    }),
    writeRawSourceSnapshot({
      path: join(rawDir, "current_bus_stops.json"),
      sourceId: "current_bus_stops",
      fetchedAt,
      query: stopQuery,
      rows: [...stopRows],
    }),
  ]);

  return {
    rawDir,
    routeCount: catalog.length,
    shapeCount: routeShapes.length,
    stopCount: stops.length,
    timepointStopCount,
    dbPath: inputs.local.path,
  };
}

export default defineIngestCommand({
  path: ["ingest", "route-catalog"],
  summary:
    "Build the route catalog from Socrata routes + stops, with terminus and length summaries.",
  options: dbOptions,
  output: z.object({
    rawDir: z.string(),
    routeCount: z.number(),
    shapeCount: z.number(),
    stopCount: z.number(),
    timepointStopCount: z.number(),
    dbPath: z.string(),
  }),
  operation: "runRouteCatalogIngest",
  runner: (local) => runRouteCatalogIngest({ local }),
});

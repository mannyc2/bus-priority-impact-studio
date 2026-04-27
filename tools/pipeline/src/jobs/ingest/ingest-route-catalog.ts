import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedRouteShape, NormalizedStop, SocrataFetch, SocrataRow } from "@bp/sources";
import {
  getSocrataSource,
  normalizeRouteShapeRows,
  normalizeStopRows,
  SocrataClient,
} from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type RouteCatalogSourceId = "current_bus_routes" | "current_bus_stops";

type RouteCatalogArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  rawDir?: string;
  workingDir?: string;
};

type RouteCatalogResult = {
  rawDir: string;
  workingDir: string;
  catalogPath: string;
  summaryPath: string;
  routeCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
};

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
  latitudeMin: number | null;
  latitudeMax: number | null;
  longitudeMin: number | null;
  longitudeMax: number | null;
};

async function fetchSourceRows(
  source: SocrataManifestSource,
  query: { where: string; order: string },
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))].sort();
}

function routeBounds(stops: NormalizedStop[]) {
  if (stops.length === 0) {
    return {
      latitudeMin: null,
      latitudeMax: null,
      longitudeMin: null,
      longitudeMax: null,
    };
  }

  return {
    latitudeMin: Math.min(...stops.map((stop) => stop.latitude)),
    latitudeMax: Math.max(...stops.map((stop) => stop.latitude)),
    longitudeMin: Math.min(...stops.map((stop) => stop.longitude)),
    longitudeMax: Math.max(...stops.map((stop) => stop.longitude)),
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
    routeTypes: uniqueSorted(shapes.map((shape) => shape.routeType)),
    tripTypes: uniqueSorted(shapes.map((shape) => shape.tripType)),
    bundles: uniqueSorted(shapes.map((shape) => shape.bundle)),
    directions: uniqueSorted([
      ...shapes.map((shape) => shape.direction),
      ...stops.map((stop) => stop.direction),
    ]),
    shapeCount: shapes.length,
    stopCount: stops.length,
    timepointStopCount: stops.filter((stop) => stop.timepoint).length,
    ...routeBounds(stops),
  };
}

function buildCatalog(
  shapes: NormalizedRouteShape[],
  stops: NormalizedStop[],
): RouteCatalogEntry[] {
  const routeIds = new Set([
    ...shapes.map((shape) => shape.routeId),
    ...stops.map((stop) => stop.routeId),
  ]);

  return [...routeIds].sort().map((routeId) =>
    buildCatalogEntry(
      routeId,
      shapes.filter((shape) => shape.routeId === routeId),
      stops.filter((stop) => stop.routeId === routeId),
    ),
  );
}

export async function ingestRouteCatalog(args: RouteCatalogArgs = {}): Promise<RouteCatalogResult> {
  const manifest = await readSourceManifest();
  const routeSource = getSocrataSource(
    manifest,
    "current_bus_routes" satisfies RouteCatalogSourceId,
  );
  const stopSource = getSocrataSource(manifest, "current_bus_stops" satisfies RouteCatalogSourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = args.rawDir ?? fromRepoRoot(join("data/raw/network"));
  const workingDir = args.workingDir ?? fromRepoRoot(join("data/working/network"));
  const catalogPath = join(workingDir, "route-catalog.json");
  const summaryPath = join(workingDir, "route-catalog-summary.json");
  const routeQuery = { where: "in_effect='true'", order: "route_id,direction_id,shape_id" };
  const stopQuery = { where: "in_effect='true'", order: "route_id,direction_id,stop_id" };
  const [routeRows, stopRows] = await Promise.all([
    fetchSourceRows(routeSource, routeQuery, args.fetcher),
    fetchSourceRows(stopSource, stopQuery, args.fetcher),
  ]);
  const routeShapes = normalizeRouteShapeRows(routeRows);
  const stops = normalizeStopRows(stopRows);
  const catalog = buildCatalog(routeShapes, stops);
  const summary = {
    schemaVersion,
    fetchedAt,
    routeCount: catalog.length,
    shapeCount: routeShapes.length,
    stopCount: stops.length,
    timepointStopCount: stops.filter((stop) => stop.timepoint).length,
    routesWithShapes: catalog.filter((route) => route.shapeCount > 0).length,
    routesWithStops: catalog.filter((route) => route.stopCount > 0).length,
  };

  await mkdir(rawDir, { recursive: true });
  await mkdir(workingDir, { recursive: true });
  await Promise.all([
    writeJson(join(rawDir, "current_bus_routes.json"), {
      schemaVersion,
      sourceId: "current_bus_routes",
      fetchedAt,
      query: routeQuery,
      rows: routeRows,
    }),
    writeJson(join(rawDir, "current_bus_stops.json"), {
      schemaVersion,
      sourceId: "current_bus_stops",
      fetchedAt,
      query: stopQuery,
      rows: stopRows,
    }),
    writeJson(catalogPath, {
      schemaVersion,
      fetchedAt,
      rows: catalog,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    rawDir,
    workingDir,
    catalogPath,
    summaryPath,
    routeCount: catalog.length,
    shapeCount: routeShapes.length,
    stopCount: stops.length,
    timepointStopCount: summary.timepointStopCount,
  };
}

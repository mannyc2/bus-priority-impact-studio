import { join } from "node:path";
import { replaceRouteCatalog } from "@bp/db/local";
import type { NormalizedRouteShape, NormalizedStop, SocrataFetch, SocrataRow } from "@bp/sources";
import {
  getSocrataSource,
  normalizeRouteShapeRows,
  normalizeStopRows,
  SocrataClient,
} from "@bp/sources";
import { dbOption, parseCliOptions } from "../../lib/cli-args.js";
import { openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type RouteCatalogSourceId = "current_bus_routes" | "current_bus_stops";

type RouteCatalogArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  rawDir?: string;
  dbPath?: string;
};

type RouteCatalogResult = {
  rawDir: string;
  routeCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
  dbPath: string;
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

function parseCliArgs(args: string[]): RouteCatalogArgs {
  return parseCliOptions(args, {} as RouteCatalogArgs, [dbOption(fromCliPath)]);
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
  const routeQuery = { where: "in_effect='true'", order: "route_id,direction_id,shape_id" };
  const stopQuery = { where: "in_effect='true'", order: "route_id,direction_id,stop_id" };
  const [routeRows, stopRows] = await Promise.all([
    fetchSourceRows(routeSource, routeQuery, args.fetcher),
    fetchSourceRows(stopSource, stopQuery, args.fetcher),
  ]);
  const routeShapes = normalizeRouteShapeRows(routeRows);
  const stops = normalizeStopRows(stopRows);
  const catalog = buildCatalog(routeShapes, stops);
  const timepointStopCount = stops.filter((stop) => stop.timepoint).length;
  const local = await openLocalPipelineDb(args.dbPath);

  try {
    await replaceRouteCatalog(local.db, catalog);
  } finally {
    local.sqlite.close();
  }

  await Promise.all([
    writeRawSourceSnapshot({
      path: join(rawDir, "current_bus_routes.json"),
      sourceId: "current_bus_routes",
      fetchedAt,
      query: routeQuery,
      rows: routeRows,
    }),
    writeRawSourceSnapshot({
      path: join(rawDir, "current_bus_stops.json"),
      sourceId: "current_bus_stops",
      fetchedAt,
      query: stopQuery,
      rows: stopRows,
    }),
  ]);

  return {
    rawDir,
    routeCount: catalog.length,
    shapeCount: routeShapes.length,
    stopCount: stops.length,
    timepointStopCount,
    dbPath: local.path,
  };
}

export async function ingestRouteCatalogFromCli(args: string[]): Promise<RouteCatalogResult> {
  return ingestRouteCatalog(parseCliArgs(args));
}

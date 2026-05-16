import { join } from "node:path";
import { geometryCoordinates, replaceBusLanes } from "@bp/db/local";
import type { NormalizedBusLane, SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeBusLaneRows, SocrataClient } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createDbContext, parseDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "nyc_dot_bus_lanes_local_streets";

type BusLaneIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type BusLaneIngestResult = {
  rawPath: string;
  laneCount: number;
  manhattanLaneCount: number;
};

function mergeOptionalField(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined || left === right) {
    return left;
  }

  return undefined;
}

function mergeBusLaneRows(left: NormalizedBusLane, right: NormalizedBusLane) {
  return {
    ...left,
    street: left.street.length >= right.street.length ? left.street : right.street,
    borough: left.borough.length >= right.borough.length ? left.borough : right.borough,
    facility: left.facility.length >= right.facility.length ? left.facility : right.facility,
    direction: mergeOptionalField(left.direction, right.direction),
    trafficDirection: mergeOptionalField(left.trafficDirection, right.trafficDirection),
    hours: mergeOptionalField(left.hours, right.hours),
    days: mergeOptionalField(left.days, right.days),
    laneType: mergeOptionalField(left.laneType, right.laneType),
    laneSubtype: mergeOptionalField(left.laneSubtype, right.laneSubtype),
    laneWidth: mergeOptionalField(left.laneWidth, right.laneWidth),
    openDate: mergeOptionalField(left.openDate, right.openDate),
    shapeLength: left.shapeLength ?? right.shapeLength,
    geometry: left.geometry ?? right.geometry,
  };
}

function dedupeBusLaneRows(
  rows: ReturnType<typeof normalizeBusLaneRows>,
): ReturnType<typeof normalizeBusLaneRows> {
  const rowsBySegmentId = new Map<string, NormalizedBusLane>();

  for (const row of rows) {
    const existing = rowsBySegmentId.get(row.segmentId);
    rowsBySegmentId.set(
      row.segmentId,
      existing === undefined ? row : mergeBusLaneRows(existing, row),
    );
  }

  return [...rowsBySegmentId.values()];
}

async function fetchBusLaneRows(
  source: SocrataManifestSource,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows({ order: "street, segmentid" });
}

export async function ingestBusLanes(args: BusLaneIngestArgs = {}): Promise<BusLaneIngestResult> {
  const options = createDbContext(args);
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const rawPath = join(rawDir, "bus-lanes-local-streets.json");
  const rawRows = await fetchBusLaneRows(source, args.fetcher);
  const normalizedRows = dedupeBusLaneRows(normalizeBusLaneRows(rawRows));
  const manhattanLaneCount = normalizedRows.filter((row) => row.borough === "MAN").length;
  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceBusLanes(
      local.db,
      normalizedRows.map((row) => ({
        ...row,
        coordinates: geometryCoordinates(row.geometry),
      })),
    ),
  );

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    fetchedAt,
    query: { order: "street, segmentid" },
    rows: rawRows,
  });

  return {
    rawPath,
    laneCount: normalizedRows.length,
    manhattanLaneCount,
  };
}

function parseCliArgs(args: string[]): BusLaneIngestArgs {
  return parseDbCliArgs(args, {} as BusLaneIngestArgs);
}

export async function ingestBusLanesFromCli(args: string[]): Promise<BusLaneIngestResult> {
  return ingestBusLanes(parseCliArgs(args));
}

import { join } from "node:path";
import { geometryCoordinates, replaceBusLanes } from "@bp/db/local";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import {
  type NormalizedBusLane,
  normalizeBusLaneRows,
} from "@bp/sources/adapters/nyc-dot/bus-lanes";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { fetchSoda3RowsForSource, type SocrataFetch, type SocrataRow } from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "nyc_dot_bus_lanes_local_streets";

export type BusLanesRunInputs = {
  local: OpenLocalPipelineDb;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type BusLanesIngestResult = {
  rawPath: string;
  laneCount: number;
  manhattanLaneCount: number;
};

function mergeOptionalField(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (left === undefined) return right;
  if (right === undefined || left === right) return left;
  return undefined;
}

function mergeBusLaneRows(left: NormalizedBusLane, right: NormalizedBusLane): NormalizedBusLane {
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

function dedupeBusLaneRows(rows: readonly NormalizedBusLane[]): NormalizedBusLane[] {
  const bySegmentId = new Map<string, NormalizedBusLane>();
  for (const row of rows) {
    const existing = bySegmentId.get(row.segmentId);
    bySegmentId.set(row.segmentId, existing === undefined ? row : mergeBusLaneRows(existing, row));
  }
  return [...bySegmentId.values()];
}

export async function runBusLanesIngest(inputs: BusLanesRunInputs): Promise<BusLanesIngestResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/interventions/bus-lanes-local-streets.json"));

  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(
      source,
      { order: "street, segmentid" },
      {
        fetcher: inputs.fetcher,
      },
    )),
  ];
  const normalizedRows = dedupeBusLaneRows(normalizeBusLaneRows(rawRows));
  const manhattanLaneCount = normalizedRows.filter((row) => row.borough === "MAN").length;

  await replaceBusLanes(
    inputs.local.db,
    normalizedRows.map((row) => ({ ...row, coordinates: geometryCoordinates(row.geometry) })),
  );
  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    fetchedAt,
    query: { order: "street, segmentid" },
    rows: rawRows,
  });

  return { rawPath, laneCount: normalizedRows.length, manhattanLaneCount };
}

export default defineCommand({
  path: ["ingest", "bus-lanes"],
  summary: "Fetch and dedupe the NYC DOT bus lanes local-streets dataset.",
  input: { options: dbOptions },
  output: z.object({
    rawPath: z.string(),
    laneCount: z.number(),
    manhattanLaneCount: z.number(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.bus-lanes",
      operation: "runBusLanesIngest",
      run: (local) => runBusLanesIngest({ local }),
    });
  },
});

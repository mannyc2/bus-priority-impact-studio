import { geometryCoordinates, replaceBusLanes } from "@bp/db/local";
import { z } from "@bp/pipeline-v2/cli/compat";
import {
  type NormalizedBusLane,
  normalizeBusLaneRows,
} from "@bp/sources/adapters/nyc-dot/bus-lanes";
import { dbOptions } from "../../lib/local-db.ts";
import {
  defineSocrataReplaceIngest,
  type SocrataReplaceIngestInputs,
} from "../../lib/socrata-replace-ingest.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

export type BusLanesRunInputs = SocrataReplaceIngestInputs;

export type BusLanesIngestResult = {
  rawPath: string;
  laneCount: number;
  manhattanLaneCount: number;
};

function mergeOptionalField(left: string | undefined, right: string | undefined) {
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

export const runBusLanesIngest = defineSocrataReplaceIngest({
  sourceId: "nyc_dot_bus_lanes_local_streets",
  rawDir: "data/raw/interventions",
  rawFileName: "bus-lanes-local-streets.json",
  query: { order: "street, segmentid" },
  normalize: (rows) => dedupeBusLaneRows(normalizeBusLaneRows([...rows])),
  replaceRows: ({ local, rows }) =>
    replaceBusLanes(
      local.db,
      rows.map((row) => ({ ...row, coordinates: geometryCoordinates(row.geometry) })),
    ),
  summarize: ({ rows }) => ({
    laneCount: rows.length,
    manhattanLaneCount: rows.filter((row) => row.borough === "MAN").length,
  }),
});

export default defineIngestCommand({
  path: ["ingest", "bus-lanes"],
  summary: "Fetch and dedupe the NYC DOT bus lanes local-streets dataset.",
  options: dbOptions,
  output: z.object({
    rawPath: z.string(),
    laneCount: z.number(),
    manhattanLaneCount: z.number(),
  }),
  operation: "runBusLanesIngest",
  runner: (local) => runBusLanesIngest({ local }),
});

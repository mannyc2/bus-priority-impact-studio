import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { geometryCoordinates, replaceBusLanes } from "@bp/db/local";
import type { SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeBusLaneRows, SocrataClient } from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
const sourceId = "nyc_dot_bus_lanes_local_streets";

type BusLaneIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type BusLaneIngestResult = {
  rawPath: string;
  summaryPath: string;
  laneCount: number;
  manhattanLaneCount: number;
};

async function fetchBusLaneRows(
  source: SocrataManifestSource,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows({ order: "street, segmentid" });
}

export async function ingestBusLanes(args: BusLaneIngestArgs = {}): Promise<BusLaneIngestResult> {
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const dbPath = args.dbPath ?? defaultLocalPipelineDbPath();
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const workingDir = fromRepoRoot(join("data/working/interventions"));
  const rawPath = join(rawDir, "bus-lanes-local-streets.json");
  const summaryPath = join(workingDir, "bus-lanes-local-streets-summary.json");
  const rawRows = await fetchBusLaneRows(source, args.fetcher);
  const normalizedRows = normalizeBusLaneRows(rawRows);
  const manhattanLaneCount = normalizedRows.filter((row) => row.borough === "MAN").length;
  const streetCounts = new Map<string, number>();

  for (const row of normalizedRows) {
    streetCounts.set(row.street, (streetCounts.get(row.street) ?? 0) + 1);
  }

  const topStreets = [...streetCounts.entries()]
    .map(([street, count]) => ({ street, count }))
    .sort((left, right) => right.count - left.count || left.street.localeCompare(right.street))
    .slice(0, 10);
  const summary = {
    schemaVersion,
    sourceId,
    fetchedAt,
    rowCount: rawRows.length,
    laneCount: normalizedRows.length,
    manhattanLaneCount,
    topStreets,
  };
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceBusLanes(
      local.db,
      normalizedRows.map((row) => ({
        ...row,
        coordinates: geometryCoordinates(row.geometry),
      })),
    );
  } finally {
    local.sqlite.close();
  }

  await mkdir(rawDir, { recursive: true });
  await mkdir(workingDir, { recursive: true });
  await Promise.all([
    writeJson(rawPath, {
      schemaVersion,
      sourceId,
      fetchedAt,
      query: { order: "street, segmentid" },
      rows: rawRows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    rawPath,
    summaryPath,
    laneCount: normalizedRows.length,
    manhattanLaneCount,
  };
}

function parseCliArgs(args: string[]): BusLaneIngestArgs {
  const output: BusLaneIngestArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

export async function ingestBusLanesFromCli(args: string[]): Promise<BusLaneIngestResult> {
  return ingestBusLanes(parseCliArgs(args));
}

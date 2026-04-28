import { join } from "node:path";
import { geometryCoordinates, replaceBusLanes } from "@bp/db/local";
import type { SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeBusLaneRows, SocrataClient } from "@bp/sources";
import { dbOption, parseCliOptions } from "../../lib/cli-args.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
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
  const rawPath = join(rawDir, "bus-lanes-local-streets.json");
  const rawRows = await fetchBusLaneRows(source, args.fetcher);
  const normalizedRows = normalizeBusLaneRows(rawRows);
  const manhattanLaneCount = normalizedRows.filter((row) => row.borough === "MAN").length;
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
  return parseCliOptions(args, {} as BusLaneIngestArgs, [dbOption(fromCliPath)]);
}

export async function ingestBusLanesFromCli(args: string[]): Promise<BusLaneIngestResult> {
  return ingestBusLanes(parseCliArgs(args));
}

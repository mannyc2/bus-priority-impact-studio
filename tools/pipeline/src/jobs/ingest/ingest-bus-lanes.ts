import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeBusLaneRows, SocrataClient } from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
const sourceId = "nyc_dot_bus_lanes_local_streets";

type BusLaneIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
};

type BusLaneIngestResult = {
  rawPath: string;
  workingPath: string;
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
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const workingDir = fromRepoRoot(join("data/working/interventions"));
  const rawPath = join(rawDir, "bus-lanes-local-streets.json");
  const workingPath = join(workingDir, "bus-lanes-local-streets.json");
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
    writeJson(workingPath, {
      schemaVersion,
      sourceId,
      fetchedAt,
      rows: normalizedRows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    rawPath,
    workingPath,
    summaryPath,
    laneCount: normalizedRows.length,
    manhattanLaneCount,
  };
}

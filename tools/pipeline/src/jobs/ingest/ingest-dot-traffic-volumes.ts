import { join } from "node:path";
import { insertDotTrafficVolumeCounts } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeDotTrafficVolumeRows, SocrataClient } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "nyc_dot_traffic_volume_counts";

type Args = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type Result = { rawPath: string; isoMonth: string; rowCount: number; segmentCount: number };

function parseCliArgs(args: string[]): Args {
  return parseMonthDbCliArgs(args, {} as Args);
}

async function fetchRows(
  source: SocrataManifestSource,
  year: number,
  month: number,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  const query: SocrataRowsQuery = {
    where: `yr = ${year} AND m = ${month}`,
    order: "segmentid,d,hh,mm",
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestDotTrafficVolumes(args: Args = {}): Promise<Result> {
  const options = createMonthContext(args);
  const monthKey = options.isoMonth;
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/dot-traffic-volumes"));
  const rawPath = join(rawDir, `dot-traffic-volumes-${monthKey}.json`);

  const rawRows = await fetchRows(source, options.year, options.month, args.fetcher);
  const rows = normalizeDotTrafficVolumeRows(rawRows);

  await withLocalPipelineDb(args.dbPath, (local) => insertDotTrafficVolumeCounts(local.db, rows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "segment × 15min", month: monthKey },
    rows: rawRows,
  });

  const segments = new Set(rows.map((r) => r.segmentId));
  return { rawPath, isoMonth: monthKey, rowCount: rows.length, segmentCount: segments.size };
}

export async function ingestDotTrafficVolumesFromCli(args: string[]): Promise<Result> {
  return ingestDotTrafficVolumes(parseCliArgs(args));
}

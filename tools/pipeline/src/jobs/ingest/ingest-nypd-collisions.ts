import { join } from "node:path";
import { upsertNypdCollisions } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeNypdCollisionRows, SocrataClient } from "@bp/sources";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "nypd_motor_vehicle_collisions";

type Args = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type Result = { rawPath: string; isoMonth: string; rowCount: number };

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
    where: [
      `crash_date >= '${isoMonthStart(year, month)}'`,
      `crash_date < '${nextIsoMonthStart(year, month)}'`,
    ].join(" AND "),
    order: "collision_id",
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestNypdCollisions(args: Args = {}): Promise<Result> {
  const options = createMonthContext(args);
  const monthKey = options.isoMonth;
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/nypd-collisions"));
  const rawPath = join(rawDir, `nypd-collisions-${monthKey}.json`);

  const rawRows = await fetchRows(source, options.year, options.month, args.fetcher);
  const rows = normalizeNypdCollisionRows(rawRows);

  await withLocalPipelineDb(args.dbPath, (local) => upsertNypdCollisions(local.db, rows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "collision_id", month: monthKey },
    rows: rawRows,
  });

  return { rawPath, isoMonth: monthKey, rowCount: rows.length };
}

export async function ingestNypdCollisionsFromCli(args: string[]): Promise<Result> {
  return ingestNypdCollisions(parseCliArgs(args));
}

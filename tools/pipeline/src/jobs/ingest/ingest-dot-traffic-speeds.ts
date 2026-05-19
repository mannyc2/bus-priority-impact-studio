import { join } from "node:path";
import { insertDotTrafficSpeedSnapshot } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeDotTrafficSpeedRows, SocrataClient } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "nyc_dot_traffic_speeds";

type DotTrafficSpeedsIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
  sinceHours?: number;
  maxRows?: number;
};

type DotTrafficSpeedsIngestResult = {
  rawPath: string;
  sampledAt: string;
  linkCount: number;
  rowCount: number;
};

function readFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function parseCliArgs(args: string[]): DotTrafficSpeedsIngestArgs {
  const dbPath = readFlag(args, "--db-path");
  const sinceHoursRaw = readFlag(args, "--since-hours");
  const maxRowsRaw = readFlag(args, "--max-rows");
  const result: DotTrafficSpeedsIngestArgs = {};
  if (dbPath !== undefined) result.dbPath = dbPath;
  if (sinceHoursRaw !== undefined) result.sinceHours = Number(sinceHoursRaw);
  if (maxRowsRaw !== undefined) result.maxRows = Number(maxRowsRaw);
  return result;
}

function toSocrataTimestamp(date: Date): string {
  // Socrata floating timestamps expect "YYYY-MM-DDTHH:MM:SS" (no millis, no Z).
  return date.toISOString().slice(0, 19);
}

async function fetchDotTrafficSpeedRows(
  source: SocrataManifestSource,
  fetcher: SocrataFetch | undefined,
  sinceHours: number,
  maxRows: number,
  fetchedAt: Date,
): Promise<SocrataRow[]> {
  const lowerBound = toSocrataTimestamp(
    new Date(fetchedAt.getTime() - sinceHours * 3_600_000),
  );
  const query: SocrataRowsQuery = {
    select:
      "link_id,data_as_of,speed,travel_time,status,owner,borough,link_name,link_points,transcom_id",
    where: `data_as_of > '${lowerBound}' AND link_id IS NOT NULL`,
    order: "data_as_of DESC",
    limit: maxRows,
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestDotTrafficSpeeds(
  args: DotTrafficSpeedsIngestArgs = {},
): Promise<DotTrafficSpeedsIngestResult> {
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/dot-traffic-speeds"));
  const fetchedDayStamp = fetchedAt.slice(0, 19).replace(/[:T]/g, "-");
  const rawPath = join(rawDir, `dot-traffic-speeds-${fetchedDayStamp}.json`);

  const sinceHours = args.sinceHours ?? 1;
  const maxRows = args.maxRows ?? 10_000;
  const rawRows = await fetchDotTrafficSpeedRows(
    source,
    args.fetcher,
    sinceHours,
    maxRows,
    args.fetchedAt ?? new Date(),
  );
  const allRows = normalizeDotTrafficSpeedRows(rawRows);

  // Latest snapshot only: keep the most recent sampledAt per linkId. Drop
  // older revisions in the window to avoid the multi-snapshot accumulation
  // problem on a real-time-archive dataset.
  const latestByLink = new Map<string, (typeof allRows)[number]>();
  for (const row of allRows) {
    const existing = latestByLink.get(row.linkId);
    if (existing === undefined || existing.sampledAt < row.sampledAt) {
      latestByLink.set(row.linkId, row);
    }
  }
  const rows = [...latestByLink.values()].sort((a, b) => a.linkId.localeCompare(b.linkId));

  const sampledAt = rows.length > 0 ? rows.map((r) => r.sampledAt).sort().at(-1)! : fetchedAt;

  await withLocalPipelineDb(args.dbPath, (local) =>
    insertDotTrafficSpeedSnapshot(local.db, rows),
  );

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { sampledAt },
    fetchedAt,
    query: { grain: "link_id @ snapshot" },
    rows: rawRows,
  });

  const linkIds = new Set(rows.map((row) => row.linkId));
  return { rawPath, sampledAt, linkCount: linkIds.size, rowCount: rows.length };
}

export async function ingestDotTrafficSpeedsFromCli(
  args: string[],
): Promise<DotTrafficSpeedsIngestResult> {
  return ingestDotTrafficSpeeds(parseCliArgs(args));
}

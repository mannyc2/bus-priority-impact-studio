import { join } from "node:path";
import { upsertLionSegments } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeLionSegmentRows, SocrataClient } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "nyc_lion_street_centerline";

type Args = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
  borough?: string;
  status?: string;
};

type Result = { rawPath: string; rowCount: number };

function parseCliArgs(args: string[]): Args {
  const dbi = args.indexOf("--db-path");
  const bi = args.indexOf("--borough");
  const si = args.indexOf("--status");
  const out: Args = {};
  const dbPath = dbi !== -1 ? args[dbi + 1] : undefined;
  const borough = bi !== -1 ? args[bi + 1] : undefined;
  const status = si !== -1 ? args[si + 1] : undefined;
  if (dbPath !== undefined) out.dbPath = dbPath;
  if (borough !== undefined) out.borough = borough;
  if (status !== undefined) out.status = status;
  return out;
}

async function fetchRows(
  source: SocrataManifestSource,
  fetcher: SocrataFetch | undefined,
  borough: string | undefined,
  status: string | undefined,
): Promise<SocrataRow[]> {
  const whereClauses: string[] = ["physicalid IS NOT NULL"];
  if (borough !== undefined) whereClauses.push(`borough_indicator = '${borough.replace(/'/g, "''")}'`);
  // Default to currently-active segments only — Centerline retains historical
  // rows.  Status code "2" historically means "in service"; let callers override.
  whereClauses.push(`status = '${(status ?? "2").replace(/'/g, "''")}'`);
  const query: SocrataRowsQuery = {
    where: whereClauses.join(" AND "),
    order: "physicalid",
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestLionCenterline(args: Args = {}): Promise<Result> {
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/lion-centerline"));
  const stamp = fetchedAt.slice(0, 10);
  const rawPath = join(rawDir, `lion-centerline-${stamp}.json`);

  const rawRows = await fetchRows(source, args.fetcher, args.borough, args.status);
  const normalized = normalizeLionSegmentRows(rawRows);
  const rows = normalized.map((n) => ({
    physicalId: n.physicalId,
    streetCodeMaster: n.streetCodeMaster,
    streetName: n.streetName,
    borough: n.borough,
    boroughCode: n.boroughCode,
    leftLowHouseNumber: n.leftLowHouseNumber,
    leftHighHouseNumber: n.leftHighHouseNumber,
    rightLowHouseNumber: n.rightLowHouseNumber,
    rightHighHouseNumber: n.rightHighHouseNumber,
    l_zip: n.l_zip,
    r_zip: n.r_zip,
    segmentTypeCode: null,
    segmentTypeDesc: null,
    rwTypeCode: n.rwTypeCode,
    rwTypeDesc: n.rwTypeDesc,
    fromNodeId: null,
    toNodeId: null,
    trafficDir: n.trafficDir,
    fromLevelCode: null,
    toLevelCode: null,
    shapeLength: n.shapeLength,
    wktGeom: n.wktGeom,
  }));

  await withLocalPipelineDb(args.dbPath, (local) => upsertLionSegments(local.db, rows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { borough: args.borough ?? null, status: args.status ?? "2" },
    fetchedAt,
    query: { grain: "physicalid" },
    rows: rawRows,
  });

  return { rawPath, rowCount: rows.length };
}

export async function ingestLionCenterlineFromCli(args: string[]): Promise<Result> {
  return ingestLionCenterline(parseCliArgs(args));
}

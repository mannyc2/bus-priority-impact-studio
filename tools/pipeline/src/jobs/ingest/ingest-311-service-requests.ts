import { join } from "node:path";
import { upsert311ServiceRequests } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import {
  BUS_RELEVANT_311_COMPLAINTS,
  getSocrataSource,
  normalize311ServiceRequestRows,
  type ServiceRequestEra,
  SocrataClient,
} from "@bp/sources";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

type Args = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
  era?: ServiceRequestEra;
  complaintTypes?: readonly string[];
};

type Result = { rawPath: string; isoMonth: string; rowCount: number; era: ServiceRequestEra };

const sourceIdForEra: Record<ServiceRequestEra, string> = {
  current: "nyc_311_service_requests_current",
  historical: "nyc_311_service_requests_historical",
};

function stripFlag(args: string[], flag: string): { rest: string[]; value: string | undefined } {
  const i = args.indexOf(flag);
  if (i === -1) return { rest: args, value: undefined };
  const value = args[i + 1];
  return { rest: [...args.slice(0, i), ...args.slice(i + 2)], value };
}

function parseCliArgs(args: string[]): Args {
  const { rest, value } = stripFlag(args, "--era");
  const base = parseMonthDbCliArgs(rest, {} as Args);
  const era =
    value === "current" || value === "historical" ? (value as ServiceRequestEra) : undefined;
  return era === undefined ? base : { ...base, era };
}

function complaintTypesClause(types: readonly string[]): string {
  // Socrata wants single-quoted strings inside the IN list.
  const list = types.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
  return `complaint_type IN (${list})`;
}

async function fetchRows(
  source: SocrataManifestSource,
  year: number,
  month: number,
  fetcher: SocrataFetch | undefined,
  complaintTypes: readonly string[],
): Promise<SocrataRow[]> {
  const query: SocrataRowsQuery = {
    where: [
      `created_date >= '${isoMonthStart(year, month)}'`,
      `created_date < '${nextIsoMonthStart(year, month)}'`,
      complaintTypesClause(complaintTypes),
    ].join(" AND "),
    order: "unique_key",
  };
  return SocrataClient.fromSource(source, { fetcher, pageSize: 50_000 }).rows(query);
}

export async function ingest311ServiceRequests(args: Args = {}): Promise<Result> {
  const era = args.era ?? "current";
  const complaintTypes = args.complaintTypes ?? BUS_RELEVANT_311_COMPLAINTS;
  const sourceId = sourceIdForEra[era];
  const options = createMonthContext(args);
  const monthKey = options.isoMonth;
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/311"));
  const rawPath = join(rawDir, `311-${era}-${monthKey}.json`);

  const rawRows = await fetchRows(source, options.year, options.month, args.fetcher, complaintTypes);
  const rows = normalize311ServiceRequestRows(rawRows, era).map((r) => ({
    ...r,
    // Geocode columns are populated by the geocode job and preserved on
    // re-ingest via ON CONFLICT.
    physicalId: null,
    geocodeConfidence: null,
  }));

  await withLocalPipelineDb(args.dbPath, (local) => upsert311ServiceRequests(local.db, rows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey, era, complaintTypes: [...complaintTypes] },
    fetchedAt,
    query: { grain: "unique_key", month: monthKey, complaintFilter: complaintTypes.length },
    rows: rawRows,
  });

  return { rawPath, isoMonth: monthKey, rowCount: rows.length, era };
}

export async function ingest311ServiceRequestsFromCli(args: string[]): Promise<Result> {
  return ingest311ServiceRequests(parseCliArgs(args));
}

import { join } from "node:path";
import { upsertDotStreetPermits } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import {
  getSocrataSource,
  normalizeDotStreetPermitRows,
  type PermitKind,
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
  kind?: PermitKind;
};

type Result = { rawPath: string; isoMonth: string; rowCount: number; kind: PermitKind };

const sourceIdForKind: Record<PermitKind, string> = {
  construction: "nyc_dot_street_construction_permits",
  opening: "nyc_dot_street_opening_permits",
};

function stripFlag(args: string[], flag: string): { rest: string[]; value: string | undefined } {
  const i = args.indexOf(flag);
  if (i === -1) return { rest: args, value: undefined };
  const value = args[i + 1];
  return { rest: [...args.slice(0, i), ...args.slice(i + 2)], value };
}

function parseCliArgs(args: string[]): Args {
  const { rest, value } = stripFlag(args, "--kind");
  const base = parseMonthDbCliArgs(rest, {} as Args);
  const kind = value === "construction" || value === "opening" ? (value as PermitKind) : undefined;
  return kind === undefined ? base : { ...base, kind };
}

async function fetchRows(
  source: SocrataManifestSource,
  year: number,
  month: number,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  const query: SocrataRowsQuery = {
    where: [
      `permitissuedate >= '${isoMonthStart(year, month)}'`,
      `permitissuedate < '${nextIsoMonthStart(year, month)}'`,
    ].join(" AND "),
    order: "permitnumber",
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestDotStreetPermits(args: Args = {}): Promise<Result> {
  const kind = args.kind ?? "construction";
  const sourceId = sourceIdForKind[kind];
  const options = createMonthContext(args);
  const monthKey = options.isoMonth;
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/dot-permits"));
  const rawPath = join(rawDir, `dot-${kind}-permits-${monthKey}.json`);

  const rawRows = await fetchRows(source, options.year, options.month, args.fetcher);
  const rows = normalizeDotStreetPermitRows(rawRows, kind);

  await withLocalPipelineDb(args.dbPath, (local) => upsertDotStreetPermits(local.db, rows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey, kind },
    fetchedAt,
    query: { grain: "permit_number", month: monthKey },
    rows: rawRows,
  });

  return { rawPath, isoMonth: monthKey, rowCount: rows.length, kind };
}

export async function ingestDotStreetPermitsFromCli(args: string[]): Promise<Result> {
  return ingestDotStreetPermits(parseCliArgs(args));
}

import { join } from "node:path";
import { upsertParkingViolations } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import {
  BUS_RELEVANT_PARKING_CODES,
  getSocrataSource,
  normalizeParkingViolationRows,
  SocrataClient,
} from "@bp/sources";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { parkingLocationKey } from "../../lib/parking-location.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const parkingFiscalYearSources = [
  { start: "2022-07", end: "2023-06", sourceId: "nyc_parking_violations_fy2023" },
  { start: "2023-07", end: "2024-06", sourceId: "nyc_parking_violations_fy2024" },
  { start: "2024-07", end: "2025-06", sourceId: "nyc_parking_violations_fy2025" },
  { start: "2025-07", end: "2026-06", sourceId: "nyc_parking_violations_current" },
] as const;

type Args = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
  codes?: readonly number[];
};

type Result = {
  rawPath: string;
  isoMonth: string;
  sourceId: string;
  rowCount: number;
  codeBreakdown: { code: number; count: number }[];
};

function stripFlag(args: string[], flag: string): { rest: string[]; value: string | undefined } {
  const i = args.indexOf(flag);
  if (i === -1) return { rest: args, value: undefined };
  const value = args[i + 1];
  return { rest: [...args.slice(0, i), ...args.slice(i + 2)], value };
}

function parseCliArgs(args: string[]): Args {
  const { rest, value } = stripFlag(args, "--codes");
  const base = parseMonthDbCliArgs(rest, {} as Args);
  if (value === undefined) return base;
  const codes = value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return { ...base, codes };
}

function parkingSourceIdForMonth(year: number, month: number): string {
  const isoMonth = `${year}-${String(month).padStart(2, "0")}`;
  const source = parkingFiscalYearSources.find(
    (candidate) => isoMonth >= candidate.start && isoMonth <= candidate.end,
  );
  if (source === undefined) {
    throw new Error(`No parking violations fiscal-year source configured for ${isoMonth}.`);
  }
  return source.sourceId;
}

async function fetchRows(
  source: SocrataManifestSource,
  year: number,
  month: number,
  fetcher: SocrataFetch | undefined,
  codes: readonly number[],
): Promise<SocrataRow[]> {
  const codeList = codes.join(",");
  const query: SocrataRowsQuery = {
    where: [
      `issue_date >= '${isoMonthStart(year, month)}'`,
      `issue_date < '${nextIsoMonthStart(year, month)}'`,
      `violation_code IN (${codeList})`,
    ].join(" AND "),
  };
  return SocrataClient.fromSource(source, { fetcher, pageSize: 50_000 }).rows(query);
}

export async function ingestParkingViolations(args: Args = {}): Promise<Result> {
  const codes = args.codes ?? BUS_RELEVANT_PARKING_CODES;
  const options = createMonthContext(args);
  const monthKey = options.isoMonth;
  const manifest = await readSourceManifest();
  const sourceId = parkingSourceIdForMonth(options.year, options.month);
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/parking-violations"));
  const rawPath = join(rawDir, `parking-violations-${monthKey}.json`);

  const rawRows = await fetchRows(source, options.year, options.month, args.fetcher, codes);
  const rows = normalizeParkingViolationRows(rawRows).map((r) => ({
    ...r,
    // Geocode columns are populated by the geocode job and preserved on
    // re-ingest via ON CONFLICT.
    physicalId: null,
    geocodeConfidence: null,
    matchLocationKey: parkingLocationKey({
      violationCode: r.violationCode,
      violationCounty: r.violationCounty,
      streetCode1: r.streetCode1,
      houseNumber: r.houseNumber,
      streetName: r.streetName,
      intersectingStreet: r.intersectingStreet,
    }),
  }));

  await withLocalPipelineDb(args.dbPath, (local) => upsertParkingViolations(local.db, rows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey, codes: [...codes] },
    fetchedAt,
    query: { grain: "summons_number", month: monthKey, codeFilter: codes.length },
    rows: rawRows,
  });

  const codeBreakdown = [...codes].map((code) => ({
    code,
    count: rows.filter((r) => r.violationCode === code).length,
  }));
  return { rawPath, isoMonth: monthKey, sourceId, rowCount: rows.length, codeBreakdown };
}

export async function ingestParkingViolationsFromCli(args: string[]): Promise<Result> {
  return ingestParkingViolations(parseCliArgs(args));
}

import { join } from "node:path";
import { upsertWeatherObservations } from "@bp/db/local";
import { NOAA_NYC_STATIONS, parseGhcnDailyCsv } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromRepoRoot } from "../../source-manifest.js";

type Args = {
  dbPath?: string;
  sinceDate?: string;
  untilDate?: string;
  stations?: readonly string[];
};

type Result = {
  rowCount: number;
  stations: { id: string; rows: number }[];
  sinceDate: string;
  untilDate: string;
};

const DEFAULT_SINCE = "2023-01-01";

function stripFlag(args: string[], flag: string): { rest: string[]; value: string | undefined } {
  const i = args.indexOf(flag);
  if (i === -1) return { rest: args, value: undefined };
  const value = args[i + 1];
  return { rest: [...args.slice(0, i), ...args.slice(i + 2)], value };
}

function parseCliArgs(args: string[]): Args {
  const out: Args = {};
  let rest = args;
  const since = stripFlag(rest, "--since");
  rest = since.rest;
  if (since.value !== undefined) out.sinceDate = since.value;
  const until = stripFlag(rest, "--until");
  rest = until.rest;
  if (until.value !== undefined) out.untilDate = until.value;
  const db = stripFlag(rest, "--db-path");
  rest = db.rest;
  if (db.value !== undefined) out.dbPath = db.value;
  const stations = stripFlag(rest, "--stations");
  if (stations.value !== undefined) {
    out.stations = stations.value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return out;
}

const GHCN_BASE_URL =
  "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access";

async function fetchStationCsv(stationId: string): Promise<string> {
  const url = `${GHCN_BASE_URL}/${stationId}.csv`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NOAA GHCN fetch ${url} → HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Ingest NOAA GHCN-Daily weather observations for the three NYC stations
 * (Central Park, LaGuardia, JFK) from `sinceDate` (default 2023-01-01) to
 * `untilDate` (default today).
 *
 * No API key required. The full archive per station is ~17 MB; we filter to
 * the window in memory before upsert to keep the DB small.
 */
export async function ingestNoaaWeather(args: Args = {}): Promise<Result> {
  const sinceDate = args.sinceDate ?? DEFAULT_SINCE;
  const untilDate = args.untilDate ?? new Date().toISOString().slice(0, 10);
  const stationIds =
    args.stations && args.stations.length > 0
      ? args.stations
      : NOAA_NYC_STATIONS.map((s) => s.id);

  // Persist the raw CSVs so reruns don't re-download.
  const rawDir = fromRepoRoot(join("data/raw/noaa-weather"));
  const ingestedAt = new Date().toISOString();

  const perStation: { id: string; rows: number }[] = [];
  let totalRows = 0;

  await withLocalPipelineDb(args.dbPath, async (local) => {
    for (const stationId of stationIds) {
      const csvPath = join(rawDir, `${stationId}.csv`);
      let csv: string;
      const cached = Bun.file(csvPath);
      if (await cached.exists()) {
        csv = await cached.text();
      } else {
        csv = await fetchStationCsv(stationId);
        await Bun.write(csvPath, csv);
      }
      const observations = parseGhcnDailyCsv(csv, { sinceDate, untilDate }).map((o) => ({
        ...o,
        ingestedAt,
      }));
      await upsertWeatherObservations(local.db, observations);
      perStation.push({ id: stationId, rows: observations.length });
      totalRows += observations.length;
    }
  });

  return { rowCount: totalRows, stations: perStation, sinceDate, untilDate };
}

export async function ingestNoaaWeatherFromCli(args: string[]): Promise<Result> {
  const result = await ingestNoaaWeather(parseCliArgs(args));
  const breakdown = result.stations.map((s) => `${s.id}=${s.rows}`).join(" ");
  console.log(
    `noaa-weather: total=${result.rowCount} ${breakdown} window=${result.sinceDate}..${result.untilDate}`,
  );
  return result;
}

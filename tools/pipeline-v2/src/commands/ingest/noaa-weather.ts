import { join } from "node:path";
import { upsertWeatherObservations } from "@bp/db/local";
import { NOAA_NYC_STATIONS, parseGhcnDailyCsv } from "@bp/sources/adapters/noaa/ghcn-daily";
import { defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";

const DEFAULT_SINCE = "2023-01-01";
const GHCN_BASE_URL =
  "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access";

export type NoaaWeatherRunInputs = {
  local: OpenLocalPipelineDb;
  sinceDate?: string | undefined;
  untilDate?: string | undefined;
  stations?: readonly string[] | undefined;
};

export type NoaaWeatherIngestResult = {
  rowCount: number;
  stations: { id: string; rows: number }[];
  sinceDate: string;
  untilDate: string;
};

async function fetchStationCsv(stationId: string): Promise<string> {
  const url = `${GHCN_BASE_URL}/${stationId}.csv`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NOAA GHCN fetch ${url} → HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export async function runNoaaWeatherIngest(
  inputs: NoaaWeatherRunInputs,
): Promise<NoaaWeatherIngestResult> {
  const sinceDate = inputs.sinceDate ?? DEFAULT_SINCE;
  const untilDate = inputs.untilDate ?? new Date().toISOString().slice(0, 10);
  const stationIds =
    inputs.stations && inputs.stations.length > 0
      ? inputs.stations
      : NOAA_NYC_STATIONS.map((s) => s.id);

  const rawDir = fromRepoRoot(join("data/raw/noaa-weather"));
  const ingestedAt = new Date().toISOString();

  const perStation: { id: string; rows: number }[] = [];
  let totalRows = 0;

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
    await upsertWeatherObservations(inputs.local.db, observations);
    perStation.push({ id: stationId, rows: observations.length });
    totalRows += observations.length;
  }

  return { rowCount: totalRows, stations: perStation, sinceDate, untilDate };
}

export default defineCommand({
  path: ["ingest", "noaa-weather"],
  summary: "Fetch NOAA GHCN-Daily observations for NYC stations.",
  input: {
    options: dbOptions.extend({
      since: z.string().optional().describe("Window start date, YYYY-MM-DD"),
      until: z.string().optional().describe("Window end date, YYYY-MM-DD"),
      stations: z
        .array(z.string())
        .default([])
        .describe("Override station IDs (default: NOAA_NYC_STATIONS)"),
    }),
  },
  output: z.object({
    rowCount: z.number(),
    stations: z.array(z.object({ id: z.string(), rows: z.number() })),
    sinceDate: z.string(),
    untilDate: z.string(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.noaa-weather",
      operation: "runNoaaWeatherIngest",
      spanAttributes: {
        sinceDate: input.options.since ?? null,
        untilDate: input.options.until ?? null,
        stationCount: input.options.stations.length,
      },
      run: (local) =>
        runNoaaWeatherIngest({
          local,
          sinceDate: input.options.since,
          untilDate: input.options.until,
          stations: input.options.stations.length > 0 ? input.options.stations : undefined,
        }),
    });
  },
});

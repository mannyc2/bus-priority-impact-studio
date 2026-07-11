import { Effect } from "effect";
import { join } from "node:path";
import { upsertWeatherObservations } from "@bp/db/local";
import { Schema } from "@bp/pipeline-v2/cli/compat";
import { NOAA_NYC_STATIONS, parseGhcnDailyCsv } from "@bp/sources/adapters/noaa/ghcn-daily";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

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

export default defineIngestCommand({
  path: ["ingest", "noaa-weather"],
  summary: "Fetch NOAA GHCN-Daily observations for NYC stations.",
  options: Schema.Struct({
    ...dbOptions.fields,
    ...{
      since: Schema.optionalKey(Schema.String).annotate({
        description: "Window start date, YYYY-MM-DD",
      }),
      until: Schema.optionalKey(Schema.String).annotate({
        description: "Window end date, YYYY-MM-DD",
      }),
      stations: Schema.Array(Schema.String)
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
        .annotate({ description: "Override station IDs (default: NOAA_NYC_STATIONS)" }),
    },
  }),
  output: Schema.Struct({
    rowCount: Schema.Number,
    stations: Schema.Array(Schema.Struct({ id: Schema.String, rows: Schema.Number })),
    sinceDate: Schema.String,
    untilDate: Schema.String,
  }),
  operation: "runNoaaWeatherIngest",
  spanAttributes: ({ since, until, stations }) => ({
    sinceDate: since ?? null,
    untilDate: until ?? null,
    stationCount: stations.length,
  }),
  runner: (local, { since, until, stations }) =>
    runNoaaWeatherIngest({
      local,
      sinceDate: since,
      untilDate: until,
      stations: stations.length > 0 ? stations : undefined,
    }),
});

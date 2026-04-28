import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceCensusTractEquityContext } from "@bp/db/local";
import type { CensusAcsFetch, NormalizedCensusTractEquityContext } from "@bp/sources";
import { censusAcsProfileVariables, fetchCensusTractEquityContext } from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

type EquityContextArgs = {
  year?: number;
  fetchedAt?: Date;
  fetcher?: CensusAcsFetch;
  rawDir?: string;
  dbPath?: string;
};

type EquityContextResult = {
  acsYear: number;
  dbPath: string;
  rawPath: string;
  tractCount: number;
  totalPopulation: number;
  noVehicleHouseholds: number;
};

function parseArgs(args: EquityContextArgs = {}): Required<EquityContextArgs> {
  return {
    year: args.year ?? 2024,
    fetchedAt: args.fetchedAt ?? new Date(),
    fetcher: args.fetcher ?? fetch,
    rawDir: args.rawDir ?? fromRepoRoot(join("data/raw/equity")),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): EquityContextArgs {
  const output: EquityContextArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function sumDefined(
  rows: NormalizedCensusTractEquityContext[],
  readValue: (row: NormalizedCensusTractEquityContext) => number | null,
): number {
  return rows.reduce((sum, row) => sum + (readValue(row) ?? 0), 0);
}

export async function ingestEquityContext(
  args: EquityContextArgs = {},
): Promise<EquityContextResult> {
  const options = parseArgs(args);
  const rawPath = join(options.rawDir, `acs5-profile-nyc-tracts-${options.year}.json`);
  const fetched = await fetchCensusTractEquityContext({
    year: options.year,
    fetcher: options.fetcher,
  });
  const local = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceCensusTractEquityContext(local.db, options.year, fetched.rows);
  } finally {
    local.sqlite.close();
  }
  const totalPopulation = sumDefined(fetched.rows, (row) => row.totalPopulation);
  const noVehicleHouseholds = sumDefined(fetched.rows, (row) => row.noVehicleHouseholds);

  await mkdir(options.rawDir, { recursive: true });
  await writeJson(rawPath, {
    schemaVersion,
    acsYear: options.year,
    fetchedAt: options.fetchedAt.toISOString(),
    source: {
      sourceId: "census_acs5_profile_tracts",
      url: fetched.url,
      variables: censusAcsProfileVariables,
    },
    rawTable: fetched.rawTable,
  });

  return {
    acsYear: options.year,
    dbPath: options.dbPath,
    rawPath,
    tractCount: fetched.rows.length,
    totalPopulation,
    noVehicleHouseholds,
  };
}

export function ingestEquityContextFromCli(args: string[]): Promise<EquityContextResult> {
  return ingestEquityContext(parseCliArgs(args));
}

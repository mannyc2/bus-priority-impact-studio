import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceCensusTractEquityContext } from "@bp/db/local";
import type { CensusAcsFetch, NormalizedCensusTractEquityContext } from "@bp/sources";
import { censusAcsProfileVariables, fetchCensusTractEquityContext } from "@bp/sources";
import { yearOption } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createDbContext, parseDbCliArgs } from "../../lib/route-job.js";
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
  const db = createDbContext(args);
  return {
    year: args.year ?? 2024,
    fetchedAt: args.fetchedAt ?? new Date(),
    fetcher: args.fetcher ?? fetch,
    rawDir: args.rawDir ?? fromRepoRoot(join("data/raw/equity")),
    dbPath: db.dbPath,
  };
}

function parseCliArgs(args: string[]): EquityContextArgs {
  return parseDbCliArgs(args, {} as EquityContextArgs, [yearOption()]);
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
  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceCensusTractEquityContext(local.db, options.year, fetched.rows),
  );
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

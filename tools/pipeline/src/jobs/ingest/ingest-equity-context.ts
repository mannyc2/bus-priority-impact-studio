import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CensusAcsFetch, NormalizedCensusTractEquityContext } from "@bp/sources";
import { censusAcsProfileVariables, fetchCensusTractEquityContext } from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

type EquityContextArgs = {
  year?: number;
  fetchedAt?: Date;
  fetcher?: CensusAcsFetch;
  rawDir?: string;
  workingDir?: string;
};

type EquityContextResult = {
  acsYear: number;
  rawPath: string;
  workingPath: string;
  summaryPath: string;
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
    workingDir: args.workingDir ?? fromRepoRoot(join("data/working/equity")),
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

function medianDefined(
  rows: NormalizedCensusTractEquityContext[],
  readValue: (row: NormalizedCensusTractEquityContext) => number | null,
): number | null {
  const values = rows
    .map(readValue)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return null;
  }

  const midpoint = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[midpoint] ?? null;
  }

  return ((values[midpoint - 1] ?? 0) + (values[midpoint] ?? 0)) / 2;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function countyCounts(rows: NormalizedCensusTractEquityContext[]): Record<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.countyName, (counts.get(row.countyName) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function ingestEquityContext(
  args: EquityContextArgs = {},
): Promise<EquityContextResult> {
  const options = parseArgs(args);
  const rawPath = join(options.rawDir, `acs5-profile-nyc-tracts-${options.year}.json`);
  const workingPath = join(options.workingDir, `nyc-tract-equity-context-${options.year}.json`);
  const summaryPath = join(
    options.workingDir,
    `nyc-tract-equity-context-${options.year}-summary.json`,
  );
  const fetched = await fetchCensusTractEquityContext({
    year: options.year,
    fetcher: options.fetcher,
  });
  const totalPopulation = sumDefined(fetched.rows, (row) => row.totalPopulation);
  const occupiedHousingUnits = sumDefined(fetched.rows, (row) => row.occupiedHousingUnits);
  const noVehicleHouseholds = sumDefined(fetched.rows, (row) => row.noVehicleHouseholds);
  const summary = {
    schemaVersion,
    acsYear: options.year,
    fetchedAt: options.fetchedAt.toISOString(),
    source: {
      sourceId: "census_acs5_profile_tracts",
      url: fetched.url,
      variables: censusAcsProfileVariables,
    },
    tractCount: fetched.rows.length,
    countyCounts: countyCounts(fetched.rows),
    totalPopulation,
    occupiedHousingUnits,
    noVehicleHouseholds,
    noVehicleHouseholdShare:
      occupiedHousingUnits === 0 ? null : round(noVehicleHouseholds / occupiedHousingUnits),
    medianTractMedianHouseholdIncome: medianDefined(
      fetched.rows,
      (row) => row.medianHouseholdIncome,
    ),
    medianTractPovertyRate: medianDefined(fetched.rows, (row) => row.povertyRate),
    medianTractNoVehicleHouseholdShare: medianDefined(
      fetched.rows,
      (row) => row.noVehicleHouseholdShare,
    ),
    medianTractPublicTransitCommuterShare: medianDefined(
      fetched.rows,
      (row) => row.publicTransitCommuterShare,
    ),
    sourceReadiness: {
      demographics: "available",
      lowCarHouseholds: "available",
      publicTransitCommuteShare: "available",
      jobAccess: "not_ingested_lehd_lodes_or_travel_time_model",
      routeSpatialJoin: "pending_tract_geometry_join",
    },
    caveats: [
      "ACS 5-year tract estimates are context indicators, not real-time measures.",
      "This artifact is not yet joined to routes; route-level equity context requires tract geometry or stop catchments.",
      "Job access is not represented by these ACS profile fields and needs a separate LEHD/LODES or travel-time model.",
    ],
  };

  await Promise.all([
    mkdir(options.rawDir, { recursive: true }),
    mkdir(options.workingDir, { recursive: true }),
  ]);
  await Promise.all([
    writeJson(rawPath, {
      schemaVersion,
      acsYear: options.year,
      fetchedAt: summary.fetchedAt,
      source: summary.source,
      rawTable: fetched.rawTable,
    }),
    writeJson(workingPath, {
      schemaVersion,
      acsYear: options.year,
      fetchedAt: summary.fetchedAt,
      source: summary.source,
      rows: fetched.rows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    acsYear: options.year,
    rawPath,
    workingPath,
    summaryPath,
    tractCount: fetched.rows.length,
    totalPopulation,
    noVehicleHouseholds,
  };
}

export function ingestEquityContextFromCli(args: string[]): Promise<EquityContextResult> {
  return ingestEquityContext(parseCliArgs(args));
}

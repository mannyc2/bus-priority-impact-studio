import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceCensusTractEquityContext } from "@bp/db/local";
import { arg, z } from "@bp/pipeline-v2/cli/compat";
import {
  censusAcsProfileVariables,
  type NormalizedCensusTractEquityContext,
} from "@bp/sources/adapters/census/acs-equity";
import { type CensusAcsFetch, fetchCensusTractEquityContext } from "@bp/sources/clients/census";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const schemaVersion = 1;

export type EquityContextRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  fetchedAt?: Date | undefined;
  fetcher?: CensusAcsFetch | undefined;
  rawDir?: string | undefined;
};

export type EquityContextIngestResult = {
  acsYear: number;
  rawPath: string;
  tractCount: number;
  totalPopulation: number;
  noVehicleHouseholds: number;
};

function sumDefined(
  rows: NormalizedCensusTractEquityContext[],
  readValue: (row: NormalizedCensusTractEquityContext) => number | null,
): number {
  return rows.reduce((sum, row) => sum + (readValue(row) ?? 0), 0);
}

export async function runEquityContextIngest(
  inputs: EquityContextRunInputs,
): Promise<EquityContextIngestResult> {
  const fetchedAt = inputs.fetchedAt ?? new Date();
  const fetcher: CensusAcsFetch = inputs.fetcher ?? fetch;
  const rawDir = inputs.rawDir ?? fromRepoRoot(join("data/raw/equity"));
  const rawPath = join(rawDir, `acs5-profile-nyc-tracts-${inputs.year}.json`);

  const censusApiKeyEnv = "CENSUS_API_KEY";
  const censusApiKey = process.env[censusApiKeyEnv]?.trim();
  const fetched = await fetchCensusTractEquityContext({
    year: inputs.year,
    fetcher,
    ...(censusApiKey === undefined || censusApiKey.length === 0 ? {} : { apiKey: censusApiKey }),
  });
  await replaceCensusTractEquityContext(inputs.local.db, inputs.year, fetched.rows);

  const totalPopulation = sumDefined(fetched.rows, (row) => row.totalPopulation);
  const noVehicleHouseholds = sumDefined(fetched.rows, (row) => row.noVehicleHouseholds);

  await mkdir(rawDir, { recursive: true });
  await writeJson(rawPath, {
    schemaVersion,
    acsYear: inputs.year,
    fetchedAt: fetchedAt.toISOString(),
    source: {
      sourceId: "census_acs5_profile_tracts",
      url: fetched.url,
      variables: censusAcsProfileVariables,
    },
    rawTable: fetched.rawTable,
  });

  return {
    acsYear: inputs.year,
    rawPath,
    tractCount: fetched.rows.length,
    totalPopulation,
    noVehicleHouseholds,
  };
}

export default defineIngestCommand({
  path: ["ingest", "equity-context"],
  summary: "Fetch Census ACS-5 tract-level equity context for NYC.",
  options: dbOptions.extend({
    year: arg.positiveInt().default(2024).describe("ACS-5 vintage year"),
  }),
  output: z.object({
    acsYear: z.number(),
    rawPath: z.string(),
    tractCount: z.number(),
    totalPopulation: z.number(),
    noVehicleHouseholds: z.number(),
  }),
  operation: "runEquityContextIngest",
  spanAttributes: ({ year }) => ({ year }),
  runner: (local, { year }) => runEquityContextIngest({ local, year }),
});

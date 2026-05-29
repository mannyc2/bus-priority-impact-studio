import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { replaceCensusTractEquityContext } from "@bp/db/local";
import {
  type CensusAcsFetch,
  censusAcsProfileVariables,
  fetchCensusTractEquityContext,
  type NormalizedCensusTractEquityContext,
} from "@bp/sources";
import { writeJson } from "../../lib/json.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";

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

  const fetched = await fetchCensusTractEquityContext({ year: inputs.year, fetcher });
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

export default defineCommand({
  path: ["ingest", "equity-context"],
  summary: "Fetch Census ACS-5 tract-level equity context for NYC.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2024).describe("ACS-5 vintage year"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    acsYear: z.number(),
    rawPath: z.string(),
    tractCount: z.number(),
    totalPopulation: z.number(),
    noVehicleHouseholds: z.number(),
  }),
  async run({ ctx, input }) {
    return runEquityContextIngest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
    });
  },
});

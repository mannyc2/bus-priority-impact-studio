import type { NormalizedCensusTractEquityContext } from "./acs-equity.js";
import { censusAcsProfileVariables, normalizeCensusTractEquityRows } from "./acs-equity.js";

export const nycCountyCodes = ["005", "047", "061", "081", "085"] as const;

export type CensusAcsFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type CensusAcsProfileUrlArgs = {
  year: number;
  variables?: readonly string[];
  stateFips?: string;
  countyFips?: readonly string[];
};

export function buildCensusAcsProfileUrl(args: CensusAcsProfileUrlArgs): URL {
  const variables = args.variables ?? Object.values(censusAcsProfileVariables);
  const url = new URL(`https://api.census.gov/data/${args.year}/acs/acs5/profile`);

  url.searchParams.set("get", [...new Set(variables)].join(","));
  url.searchParams.set("for", "tract:*");
  url.searchParams.append("in", `state:${args.stateFips ?? "36"}`);
  url.searchParams.append("in", `county:${(args.countyFips ?? nycCountyCodes).join(",")}`);

  return url;
}

export async function fetchCensusTractEquityContext(args: {
  year: number;
  fetcher?: CensusAcsFetch;
}): Promise<{ url: string; rawTable: unknown; rows: NormalizedCensusTractEquityContext[] }> {
  const url = buildCensusAcsProfileUrl({ year: args.year });
  const response = await (args.fetcher ?? fetch)(url);
  if (!response.ok) {
    throw new Error(`Census ACS request failed with HTTP ${response.status}: ${url.toString()}`);
  }

  const rawTable = await response.json();
  return {
    url: url.toString(),
    rawTable,
    rows: normalizeCensusTractEquityRows(rawTable, args.year),
  };
}

import type { NormalizedCensusTractEquityContext } from "../../adapters/census/acs-equity.js";
import {
  censusAcsProfileVariables,
  normalizeCensusTractEquityRows,
} from "../../adapters/census/acs-equity.js";

export const nycCountyCodes = ["005", "047", "061", "081", "085"] as const;

export type CensusAcsFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type CensusAcsProfileUrlArgs = {
  year: number;
  variables?: readonly string[];
  stateFips?: string;
  countyFips?: readonly string[];
  apiKey?: string;
};

export function buildCensusAcsProfileUrl(args: CensusAcsProfileUrlArgs): URL {
  const variables = args.variables ?? Object.values(censusAcsProfileVariables);
  const url = new URL(`https://api.census.gov/data/${args.year}/acs/acs5/profile`);

  url.searchParams.set("get", [...new Set(variables)].join(","));
  url.searchParams.set("for", "tract:*");
  url.searchParams.append("in", `state:${args.stateFips ?? "36"}`);
  url.searchParams.append("in", `county:${(args.countyFips ?? nycCountyCodes).join(",")}`);
  const apiKey = args.apiKey?.trim();
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url;
}

export async function fetchCensusTractEquityContext(args: {
  year: number;
  fetcher?: CensusAcsFetch;
  apiKey?: string | undefined;
}): Promise<{ url: string; rawTable: unknown; rows: NormalizedCensusTractEquityContext[] }> {
  const apiKey = args.apiKey?.trim();
  const url = buildCensusAcsProfileUrl({
    year: args.year,
    ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey }),
  });
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

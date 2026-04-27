import * as z from "zod";
import type { SocrataDatasetId } from "./socrata.js";

const defaultPageSize = 5_000;

export const SocrataRowSchema = z.record(z.string(), z.unknown());
export const SocrataRowsSchema = z.array(SocrataRowSchema);

export type SocrataRow = z.output<typeof SocrataRowSchema>;

export type SocrataRowsQuery = {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
  offset?: number;
};

export type SocrataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type FetchSocrataRowsOptions = {
  domain: string;
  datasetId: SocrataDatasetId;
  query?: SocrataRowsQuery;
  fetcher?: SocrataFetch;
  pageSize?: number;
};

function setOptionalSearchParam(url: URL, name: string, value: string | number | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value));
  }
}

export function buildSocrataRowsUrl(
  domain: string,
  datasetId: SocrataDatasetId,
  query: SocrataRowsQuery = {},
): URL {
  const url = new URL(`/resource/${datasetId}.json`, `https://${domain}`);

  setOptionalSearchParam(url, "$select", query.select);
  setOptionalSearchParam(url, "$where", query.where);
  setOptionalSearchParam(url, "$group", query.group);
  setOptionalSearchParam(url, "$order", query.order);
  setOptionalSearchParam(url, "$limit", query.limit);
  setOptionalSearchParam(url, "$offset", query.offset);

  return url;
}

export async function fetchSocrataRowsPage(
  options: FetchSocrataRowsOptions,
): Promise<SocrataRow[]> {
  const url = buildSocrataRowsUrl(options.domain, options.datasetId, options.query);
  const response = await (options.fetcher ?? fetch)(url);

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Socrata request failed with HTTP ${response.status}: ${url.toString()}`);
  }

  return SocrataRowsSchema.parse(await response.json());
}

export async function fetchAllSocrataRows(options: FetchSocrataRowsOptions): Promise<SocrataRow[]> {
  const pageSize = options.pageSize ?? defaultPageSize;
  const requestedLimit = options.query?.limit;
  const output: SocrataRow[] = [];

  while (requestedLimit === undefined || output.length < requestedLimit) {
    const remaining = requestedLimit === undefined ? pageSize : requestedLimit - output.length;
    const limit = Math.min(pageSize, remaining);
    const offset = (options.query?.offset ?? 0) + output.length;
    const rows = await fetchSocrataRowsPage({
      ...options,
      query: {
        ...options.query,
        limit,
        offset,
      },
    });

    output.push(...rows);

    if (rows.length < limit) {
      break;
    }
  }

  return output;
}

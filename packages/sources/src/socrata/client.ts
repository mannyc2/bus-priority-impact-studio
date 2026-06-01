import * as z from "zod";
import type { SocrataManifestSource } from "../registry/manifest.js";

const defaultPageSize = 5_000;

export const SocrataDatasetIdSchema = z
  .string()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
  .brand<"SocrataDatasetId">();

export type SocrataDatasetId = z.output<typeof SocrataDatasetIdSchema>;

export const SocrataColumnSchema = z
  .object({
    id: z.number().int().nonnegative().optional(),
    name: z.string().min(1),
    dataTypeName: z.string().min(1).optional(),
    fieldName: z.string().min(1).optional(),
  })
  .passthrough();

export const SocrataMetadataSchema = z
  .object({
    id: SocrataDatasetIdSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    attribution: z.string().optional(),
    rowsUpdatedAt: z.number().int().nonnegative().optional(),
    columns: z.array(SocrataColumnSchema).default([]),
  })
  .passthrough();

export type SocrataMetadata = z.output<typeof SocrataMetadataSchema>;

export function buildSocrataMetadataUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}`, `https://${domain}`);
}

export function buildSocrataColumnsUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}/columns.json`, `https://${domain}`);
}

export function parseSocrataMetadata(input: unknown): SocrataMetadata {
  return SocrataMetadataSchema.parse(input);
}

export function summarizeSocrataMetadata(metadata: SocrataMetadata): string {
  const columnCount = metadata.columns.length;
  const updated = metadata.rowsUpdatedAt === undefined ? "unknown" : String(metadata.rowsUpdatedAt);

  return `${metadata.id} | ${metadata.name} | columns=${columnCount} | rowsUpdatedAt=${updated}`;
}

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

export type SocrataEndpoint = {
  domain: string;
  datasetId: SocrataDatasetId;
};

export type FetchSocrataRowsOptions = {
  domain: string;
  datasetId: SocrataDatasetId;
  query?: SocrataRowsQuery | undefined;
  fetcher?: SocrataFetch | undefined;
  pageSize?: number | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
};

export type SocrataClientOptions = {
  fetcher?: SocrataFetch | undefined;
  pageSize?: number | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(options: FetchSocrataRowsOptions, attempt: number): number {
  const baseDelay = options.retryDelayMs ?? 250;
  return baseDelay * 2 ** attempt;
}

function fetchInitWithTimeout(timeoutMs: number | undefined): RequestInit | undefined {
  if (timeoutMs === undefined) return undefined;
  return { signal: AbortSignal.timeout(timeoutMs) };
}

async function fetchJson(url: URL, fetcher: SocrataFetch | undefined): Promise<unknown> {
  const response = await (fetcher ?? fetch)(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Socrata request failed with HTTP ${response.status}: ${url.toString()}`);
  }

  return response.json();
}

export async function fetchSocrataRowsPage(
  options: FetchSocrataRowsOptions,
  attempt = 0,
): Promise<SocrataRow[]> {
  const url = buildSocrataRowsUrl(options.domain, options.datasetId, options.query);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, fetchInitWithTimeout(options.timeoutMs));
  } catch (error) {
    if (attempt < (options.retryCount ?? 2)) {
      await sleep(retryDelay(options, attempt));
      return fetchSocrataRowsPage(options, attempt + 1);
    }
    throw error;
  }

  if (!response.ok) {
    await response.body?.cancel();
    if (isRetryableStatus(response.status) && attempt < (options.retryCount ?? 2)) {
      await sleep(retryDelay(options, attempt));
      return fetchSocrataRowsPage(options, attempt + 1);
    }

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

export class SocrataClient {
  readonly domain: string;
  readonly datasetId: SocrataDatasetId;
  readonly options: SocrataClientOptions;

  constructor(endpoint: SocrataEndpoint, options: SocrataClientOptions = {}) {
    this.domain = endpoint.domain;
    this.datasetId = endpoint.datasetId;
    this.options = options;
  }

  static fromSource(
    source: SocrataManifestSource,
    options: SocrataClientOptions = {},
  ): SocrataClient {
    return new SocrataClient({ domain: source.domain, datasetId: source.dataset_id }, options);
  }

  rows(query: SocrataRowsQuery = {}): Promise<SocrataRow[]> {
    return fetchAllSocrataRows({
      domain: this.domain,
      datasetId: this.datasetId,
      query,
      ...this.options,
    });
  }

  async metadata(): Promise<SocrataMetadata> {
    return parseSocrataMetadata(
      await fetchJson(buildSocrataMetadataUrl(this.domain, this.datasetId), this.options.fetcher),
    );
  }

  async columns(): Promise<Array<z.output<typeof SocrataColumnSchema>>> {
    return z
      .array(SocrataColumnSchema)
      .parse(
        await fetchJson(buildSocrataColumnsUrl(this.domain, this.datasetId), this.options.fetcher),
      );
  }

  async rowCount(): Promise<number> {
    const rows = z
      .array(
        z.object({
          count: z.union([z.string(), z.number()]),
        }),
      )
      .parse(await this.rows({ select: "count(*)" }));
    const first = rows[0];
    if (first === undefined) {
      throw new Error("Socrata count response did not include a count row.");
    }

    const rowCount = Number(first.count);
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new Error(`Socrata count response was not a nonnegative integer: ${first.count}`);
    }

    return rowCount;
  }
}

import type { SocrataManifestSource } from "@bp/sources/registry";
import { querySoda3Rows } from "@nyc-transit-kit/compat/soda3";
import { runPipelineHttpPromise } from "../effect/http.ts";
import { fetchWithSocrataAppToken, type SocrataFetch } from "./socrata-token.ts";

const defaultPageSize = 5_000;

export type { SocrataFetch } from "./socrata-token.ts";

export type SocrataRow = Readonly<Record<string, unknown>>;
export type Soda3ExportFormat = "csv" | "json" | "geojson";

export type Soda3SoqlQuery = {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
  offset?: number;
};

export type ByteRange = {
  start: number;
  endInclusive?: number;
};

export type PipelineSoda3Client = {
  rows(query: Soda3SoqlQuery): Promise<readonly SocrataRow[]>;
};

export type PipelineSoda3ClientOptions = {
  fetcher?: SocrataFetch | undefined;
  pageSize?: number | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
};

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function normalizeRequestBody(
  body: RequestInit["body"] | null | undefined,
): RequestInit["body"] | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  return body;
}

async function requestInitFromRequest(request: Request, init: FetchInit): Promise<RequestInit> {
  const body = normalizeRequestBody(
    init?.body ?? (request.body === null ? undefined : await request.clone().text()),
  );
  const baseInit: RequestInit = {
    method: init?.method ?? request.method,
    headers: init?.headers ?? request.headers,
    signal: init?.signal ?? request.signal,
  };

  return body === undefined ? baseInit : { ...baseInit, body };
}

function requestInitWithNormalizedBody(init: FetchInit): RequestInit | undefined {
  if (init === undefined) {
    return undefined;
  }
  const body = normalizeRequestBody(init.body);
  return body === undefined ? init : { ...init, body };
}

function fetchWithTimeout(fetcher: SocrataFetch, timeoutMs: number | undefined): SocrataFetch {
  if (timeoutMs === undefined) {
    return fetcher;
  }

  return (input, init) =>
    fetcher(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
}

function fetchInputUrl(input: Parameters<SocrataFetch>[0]): string {
  return typeof input === "string" ? input : input.toString();
}

function fetchWithPipelineHttpRetry(
  source: SocrataManifestSource,
  fetcher: SocrataFetch,
  options: PipelineSoda3ClientOptions,
): SocrataFetch {
  const maxAttempts = Math.max(1, Math.floor((options.retryCount ?? 0) + 1));
  return (input, init) => {
    const url = fetchInputUrl(input);
    return runPipelineHttpPromise({
      command: "soda3",
      operation: source.id,
      url,
      maxAttempts,
      retryDelayMs: options.retryDelayMs,
      run: async () => {
        const response = await fetcher(input, init);
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}`);
        }
        return response;
      },
    });
  };
}

export function adaptSocrataFetch(fetcher: SocrataFetch): typeof fetch {
  const compatFetch = async (input: FetchInput, init?: FetchInit) =>
    input instanceof Request
      ? fetcher(input.url, await requestInitFromRequest(input, init))
      : fetcher(input, requestInitWithNormalizedBody(init));

  return Object.assign(compatFetch, {
    preconnect: fetch.preconnect,
  });
}

export function soda3ExportUrl(domain: string, datasetId: string, format: Soda3ExportFormat): URL {
  return new URL(`/api/v3/views/${datasetId}/export.${format}`, `https://${domain}`);
}

export function soda3RangeHeader(range: ByteRange): string {
  const end = range.endInclusive === undefined ? "" : String(range.endInclusive);
  return `bytes=${range.start}-${end}`;
}

export function soda3SoqlQueryText(query: Soda3SoqlQuery): string {
  const select = query.select?.trim() || "*";
  const parts = [`SELECT ${select}`];
  if (query.where !== undefined && query.where.trim().length > 0) {
    parts.push(`WHERE ${query.where.trim()}`);
  }
  if (query.group !== undefined && query.group.trim().length > 0) {
    parts.push(`GROUP BY ${query.group.trim()}`);
  }
  if (query.order !== undefined && query.order.trim().length > 0) {
    parts.push(`ORDER BY ${query.order.trim()}`);
  }
  if (query.limit !== undefined) {
    parts.push(`LIMIT ${query.limit}`);
  }
  if (query.offset !== undefined) {
    parts.push(`OFFSET ${query.offset}`);
  }
  return parts.join(" ");
}

/** Single-quote a string value for use in a SoQL WHERE clause. */
export function soqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Build a SoQL IN clause: `field in('a','b','c')`. */
export function soqlIn(field: string, values: readonly string[]): string {
  return `${field} in(${values.map(soqlQuote).join(",")})`;
}

export function soqlYearMonthRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): string {
  return [
    `(year > ${startYear} OR (year = ${startYear} AND month >= ${startMonth}))`,
    `(year < ${endYear} OR (year = ${endYear} AND month <= ${endMonth}))`,
  ].join(" AND ");
}

async function fetchRowsPage(
  source: SocrataManifestSource,
  query: Soda3SoqlQuery,
  options: PipelineSoda3ClientOptions,
  pageNumber: number,
): Promise<readonly SocrataRow[]> {
  const compatFetch = adaptSocrataFetch(
    fetchWithPipelineHttpRetry(
      source,
      fetchWithTimeout(fetchWithSocrataAppToken(options.fetcher), options.timeoutMs),
      options,
    ),
  );
  const response = await querySoda3Rows(
    {
      domain: source.domain,
      datasetId: source.dataset_id,
      query: soda3SoqlQueryText(query),
      page: {
        pageNumber,
        pageSize: options.pageSize ?? defaultPageSize,
      },
      includeSynthetic: false,
    },
    {
      fetch: compatFetch,
      retryTimes: 0,
    },
  );

  return response.rows;
}

export function createSoda3SourceClient(
  source: SocrataManifestSource,
  options: PipelineSoda3ClientOptions = {},
): PipelineSoda3Client {
  return {
    async rows(query) {
      if (query.limit !== undefined || query.offset !== undefined) {
        return fetchRowsPage(source, query, options, 1);
      }

      const rows: SocrataRow[] = [];
      const pageSize = options.pageSize ?? defaultPageSize;
      let pageNumber = 1;
      while (true) {
        const page = await fetchRowsPage(source, query, options, pageNumber);
        rows.push(...page);
        if (page.length < pageSize) {
          return rows;
        }
        pageNumber += 1;
      }
    },
  };
}

export function fetchSoda3RowsForSource(
  source: SocrataManifestSource,
  query: Soda3SoqlQuery,
  options: PipelineSoda3ClientOptions = {},
): Promise<readonly SocrataRow[]> {
  return createSoda3SourceClient(source, options).rows(query);
}

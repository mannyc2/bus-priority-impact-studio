import type { SocrataManifestSource } from "@bp/sources/registry";
import {
  type FetchImplementation,
  queryAllRows,
  queryRows,
  type Soda3ClientConfig,
  soda3ConfigLayer,
  soda3FetchLayer,
} from "@nyc-transit-kit/soda3/client";
import type { Soda3ClientError } from "@nyc-transit-kit/soda3/errors";
import { Effect, Layer, Schedule } from "effect";
import { HttpClient } from "effect/unstable/http";
import { HttpRequestError, RateLimitError } from "../effect/errors.ts";
import { runPipelineEffect } from "../effect/runtime.ts";

const defaultPageSize = 5_000;

export type SocrataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
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
  appToken?: string | null | undefined;
  pageSize?: number | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
};

type PipelineSoda3Requirements = Soda3ClientConfig | HttpClient.HttpClient;
type PipelineSoda3Error = HttpRequestError | RateLimitError;

export function socrataAppTokenFromEnv(): string | null {
  const token = process.env["SOCRATA_APP_TOKEN"]?.trim();
  return token === undefined || token.length === 0 ? null : token;
}

function maxAttempts(options: PipelineSoda3ClientOptions): number {
  return Math.max(1, Math.floor((options.retryCount ?? 0) + 1));
}

function retryingHttpClient(
  baseClient: HttpClient.HttpClient,
  options: PipelineSoda3ClientOptions,
) {
  const retries = Math.max(0, Math.floor(options.retryCount ?? 0));
  if (retries === 0) {
    return baseClient;
  }

  const baseDelayMs = Math.max(0, options.retryDelayMs ?? 1_000);
  if (baseDelayMs === 0) {
    return baseClient.pipe(
      HttpClient.retryTransient({
        retryOn: "errors-and-responses",
        times: retries,
      }),
    );
  }

  const schedule = Schedule.exponential(baseDelayMs, 1.5).pipe(
    Schedule.jittered,
    Schedule.both(Schedule.recurs(retries)),
    Schedule.map(() => undefined),
  );
  return baseClient.pipe(
    HttpClient.retryTransient({
      retryOn: "errors-and-responses",
      schedule,
    }),
  );
}

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

function requestInitWithNormalizedBody(init: RequestInit | undefined): RequestInit | undefined {
  if (init === undefined) {
    return undefined;
  }
  const body = normalizeRequestBody(init.body);
  return body === undefined ? init : { ...init, body };
}

function adaptFetchImplementation(
  fetcher: SocrataFetch | undefined,
): FetchImplementation | undefined {
  if (fetcher === undefined) {
    return undefined;
  }

  return (input, init) =>
    input instanceof Request
      ? fetcher(input.url, requestInitWithNormalizedBody(init))
      : fetcher(input, requestInitWithNormalizedBody(init));
}

function pipelineSoda3HttpLayer(
  options: PipelineSoda3ClientOptions,
): Layer.Layer<HttpClient.HttpClient> {
  return Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const baseClient = yield* HttpClient.HttpClient;
      return retryingHttpClient(baseClient, options);
    }),
  ).pipe(Layer.provide(soda3FetchLayer(adaptFetchImplementation(options.fetcher))));
}

export function pipelineSoda3Layer(
  options: PipelineSoda3ClientOptions = {},
): Layer.Layer<PipelineSoda3Requirements> {
  const appToken = options.appToken === undefined ? socrataAppTokenFromEnv() : options.appToken;
  return Layer.mergeAll(
    soda3ConfigLayer({
      retryTimes: 0,
      ...(appToken === null ? {} : { appToken }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    }),
    pipelineSoda3HttpLayer(options),
  );
}

function soda3ClientStatus(error: Soda3ClientError): number {
  return error._tag === "ProviderHttpError" ? error.status : 0;
}

function mapPipelineSoda3Error(
  source: SocrataManifestSource,
  url: string,
  options: PipelineSoda3ClientOptions,
  error: Soda3ClientError,
): PipelineSoda3Error {
  const attempts = maxAttempts(options);
  const status = soda3ClientStatus(error);
  if (status === 429) {
    return RateLimitError.make({
      command: "soda3",
      operation: source.id,
      url,
      attempt: attempts,
      maxAttempts: attempts,
      status,
      retryAfterMs: 0,
      cause: error,
    });
  }

  return HttpRequestError.make({
    command: "soda3",
    operation: source.id,
    url,
    attempt: attempts,
    maxAttempts: attempts,
    status,
    cause: error,
  });
}

export function runPipelineSoda3Effect<A>(
  source: SocrataManifestSource,
  url: string,
  effect: Effect.Effect<A, Soda3ClientError, PipelineSoda3Requirements>,
  options: PipelineSoda3ClientOptions = {},
): Promise<A> {
  return runPipelineEffect(
    effect.pipe(Effect.mapError((error) => mapPipelineSoda3Error(source, url, options, error))),
    pipelineSoda3Layer(options),
  );
}

export function soda3QueryUrl(domain: string, datasetId: string): URL {
  return new URL(`/api/v3/views/${datasetId}/query.json`, `https://${domain}`);
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
  const response = await runPipelineSoda3Effect(
    source,
    soda3QueryUrl(source.domain, source.dataset_id).href,
    queryRows({
      domain: source.domain,
      datasetId: source.dataset_id,
      query: soda3SoqlQueryText(query),
      page: {
        pageNumber,
        pageSize: options.pageSize ?? defaultPageSize,
      },
      includeSynthetic: false,
    }),
    options,
  );

  return response.rows;
}

function fetchAllRows(
  source: SocrataManifestSource,
  query: Soda3SoqlQuery,
  options: PipelineSoda3ClientOptions,
): Promise<readonly SocrataRow[]> {
  return runPipelineSoda3Effect(
    source,
    soda3QueryUrl(source.domain, source.dataset_id).href,
    queryAllRows({
      domain: source.domain,
      datasetId: source.dataset_id,
      query: soda3SoqlQueryText(query),
      pageSize: options.pageSize ?? defaultPageSize,
      includeSynthetic: false,
    }),
    options,
  );
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

      return fetchAllRows(source, query, options);
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

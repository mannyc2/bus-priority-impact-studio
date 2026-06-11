import * as z from "zod";

const defaultPageSize = 5_000;
const defaultRetryCount = 2;
const defaultRetryDelayMs = 250;

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

export const SocrataRowSchema = z.record(z.string(), z.unknown());
export const SocrataRowsSchema = z.array(SocrataRowSchema);

const SocrataCountResponseSchema = z.array(
  z.object({
    count: z.union([z.string(), z.number()]),
  }),
);

export type SocrataMetadata = z.output<typeof SocrataMetadataSchema>;
export type SocrataRow = z.output<typeof SocrataRowSchema>;
export type SocrataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type Soda3Page = {
  pageNumber: number;
  pageSize: number;
};

export type Soda3QueryRequest = {
  query: string;
  page?: Soda3Page;
  parameters?: Record<string, unknown>;
  timeout?: number;
  includeSystem?: boolean;
  includeSynthetic?: boolean;
  orderingSpecifier?: "total" | "discard";
};

export type Soda3ExportFormat = "csv" | "json" | "geojson";

export type ByteRange = {
  start: number;
  endInclusive?: number;
};

export type Soda3ExportRequest = {
  datasetId: SocrataDatasetId;
  format: Soda3ExportFormat;
  body?: {
    query?: string;
    parameters?: Record<string, unknown>;
    timeout?: number;
    orderingSpecifier?: "total" | "discard";
    serializationOptions?: Record<string, unknown>;
  };
  byteRange?: ByteRange;
};

export type Soda3SoqlQuery = {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
  offset?: number;
};

export type Soda3ClientOptions = {
  domain: string;
  appToken?: string | undefined;
  fetcher?: SocrataFetch | undefined;
  pageSize?: number | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
};

export type Soda3Client = {
  queryRows(request: {
    datasetId: SocrataDatasetId;
    body: Soda3QueryRequest;
  }): Promise<readonly SocrataRow[]>;
  queryPages(request: {
    datasetId: SocrataDatasetId;
    body: Omit<Soda3QueryRequest, "page">;
    pageSize?: number;
    startPage?: number;
  }): AsyncIterable<readonly SocrataRow[]>;
  queryAllRows(request: {
    datasetId: SocrataDatasetId;
    body: Omit<Soda3QueryRequest, "page">;
    pageSize?: number;
  }): Promise<readonly SocrataRow[]>;
  export(request: Soda3ExportRequest): Promise<Response>;
  metadata(datasetId: SocrataDatasetId): Promise<SocrataMetadata>;
  columns(datasetId: SocrataDatasetId): Promise<readonly z.output<typeof SocrataColumnSchema>[]>;
  rowCount(datasetId: SocrataDatasetId, where?: string): Promise<number>;
};

export function buildSocrataMetadataUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}`, `https://${domain}`);
}

export function buildSocrataColumnsUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}/columns.json`, `https://${domain}`);
}

export function buildSoda3QueryUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/v3/views/${datasetId}/query.json`, `https://${domain}`);
}

export function buildSoda3ExportUrl(
  domain: string,
  datasetId: SocrataDatasetId,
  format: Soda3ExportFormat,
): URL {
  return new URL(`/api/v3/views/${datasetId}/export.${format}`, `https://${domain}`);
}

export function soda3RangeHeader(range: ByteRange): string {
  const end = range.endInclusive === undefined ? "" : String(range.endInclusive);
  return `bytes=${range.start}-${end}`;
}

export function buildSoda3SoqlQuery(query: Soda3SoqlQuery): string {
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

export function parseSocrataMetadata(input: unknown): SocrataMetadata {
  return SocrataMetadataSchema.parse(input);
}

export function summarizeSocrataMetadata(metadata: SocrataMetadata): string {
  const columnCount = metadata.columns.length;
  const updated = metadata.rowsUpdatedAt === undefined ? "unknown" : String(metadata.rowsUpdatedAt);

  return `${metadata.id} | ${metadata.name} | columns=${columnCount} | rowsUpdatedAt=${updated}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(options: Soda3ClientOptions, attempt: number): number {
  return (options.retryDelayMs ?? defaultRetryDelayMs) * 2 ** attempt;
}

function fetchInitWithTimeout(timeoutMs: number | undefined): RequestInit | undefined {
  if (timeoutMs === undefined) return undefined;
  return { signal: AbortSignal.timeout(timeoutMs) };
}

function headersWithAppToken(
  headers: ConstructorParameters<typeof Headers>[0],
  appToken: string | undefined,
): Headers {
  const nextHeaders = new Headers(headers);
  if (appToken !== undefined && appToken.length > 0 && !nextHeaders.has("X-App-Token")) {
    nextHeaders.set("X-App-Token", appToken);
  }
  return nextHeaders;
}

function jsonRequestInit(options: Soda3ClientOptions, body: unknown): RequestInit {
  return {
    ...fetchInitWithTimeout(options.timeoutMs),
    method: "POST",
    headers: headersWithAppToken(
      {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      options.appToken,
    ),
    body: JSON.stringify(body),
  };
}

function exportRequestInit(options: Soda3ClientOptions, request: Soda3ExportRequest): RequestInit {
  const headers = headersWithAppToken(
    {
      Accept:
        request.format === "csv"
          ? "text/csv"
          : request.format === "geojson"
            ? "application/geo+json, application/json"
            : "application/json",
      "Content-Type": "application/json",
    },
    options.appToken,
  );
  if (request.byteRange !== undefined) {
    headers.set("Range", soda3RangeHeader(request.byteRange));
  }

  return {
    ...fetchInitWithTimeout(options.timeoutMs),
    method: "POST",
    headers,
    body: JSON.stringify(request.body ?? {}),
  };
}

async function fetchWithRetry(
  url: URL,
  init: RequestInit | undefined,
  options: Soda3ClientOptions,
  attempt = 0,
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(url, init);
    if (
      !response.ok &&
      isRetryableStatus(response.status) &&
      attempt < (options.retryCount ?? defaultRetryCount)
    ) {
      await response.body?.cancel();
      await sleep(retryDelay(options, attempt));
      return fetchWithRetry(url, init, options, attempt + 1);
    }
    return response;
  } catch (error) {
    if (attempt < (options.retryCount ?? defaultRetryCount)) {
      await sleep(retryDelay(options, attempt));
      return fetchWithRetry(url, init, options, attempt + 1);
    }
    throw error;
  }
}

async function fetchJson(
  url: URL,
  init: RequestInit | undefined,
  options: Soda3ClientOptions,
): Promise<unknown> {
  const response = await fetchWithRetry(url, init, options);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Socrata request failed with HTTP ${response.status}: ${url.toString()}`);
  }
  return response.json();
}

function parseRowCount(rows: unknown): number {
  const parsedRows = SocrataCountResponseSchema.parse(rows);
  const first = parsedRows[0];
  if (first === undefined) {
    throw new Error("Socrata count response did not include a count row.");
  }

  const rowCount = Number(first.count);
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
    throw new Error(`Socrata count response was not a nonnegative integer: ${first.count}`);
  }

  return rowCount;
}

export function createSoda3Client(options: Soda3ClientOptions): Soda3Client {
  return {
    async queryRows(request) {
      const body =
        request.body.includeSynthetic === undefined
          ? { ...request.body, includeSynthetic: false }
          : request.body;
      return SocrataRowsSchema.parse(
        await fetchJson(
          buildSoda3QueryUrl(options.domain, request.datasetId),
          jsonRequestInit(options, body),
          options,
        ),
      );
    },

    async *queryPages(request) {
      const pageSize = request.pageSize ?? options.pageSize ?? defaultPageSize;
      let pageNumber = request.startPage ?? 1;

      while (true) {
        const rows = await this.queryRows({
          datasetId: request.datasetId,
          body: {
            ...request.body,
            page: { pageNumber, pageSize },
          },
        });
        yield rows;

        if (rows.length < pageSize) {
          break;
        }
        pageNumber += 1;
      }
    },

    async queryAllRows(request) {
      const rows: SocrataRow[] = [];
      for await (const page of this.queryPages(request)) {
        rows.push(...page);
      }
      return rows;
    },

    export(request) {
      return fetchWithRetry(
        buildSoda3ExportUrl(options.domain, request.datasetId, request.format),
        exportRequestInit(options, request),
        options,
      );
    },

    async metadata(datasetId) {
      return parseSocrataMetadata(
        await fetchJson(buildSocrataMetadataUrl(options.domain, datasetId), undefined, options),
      );
    },

    async columns(datasetId) {
      return z
        .array(SocrataColumnSchema)
        .parse(
          await fetchJson(buildSocrataColumnsUrl(options.domain, datasetId), undefined, options),
        );
    },

    async rowCount(datasetId, where) {
      const query = buildSoda3SoqlQuery({
        select: "count(*)",
        ...(where === undefined ? {} : { where }),
      });
      return parseRowCount(
        await this.queryRows({
          datasetId,
          body: { query, includeSynthetic: false },
        }),
      );
    },
  };
}

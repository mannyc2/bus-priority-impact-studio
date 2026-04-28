import * as z from "zod";
import type { ManifestSource, SocrataManifestSource } from "../registry/manifest.js";
import {
  buildSocrataMetadataUrl,
  buildSocrataRowsUrl,
  parseSocrataMetadata,
  SocrataColumnSchema,
  type SocrataMetadata,
} from "../socrata/client.js";

const probeSchemaVersion = 1;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ProbeStatus = "active" | "blocked" | "skipped";
type HttpMethod = "GET" | "HEAD";
type HttpTransport = "curl" | "fetch";

type HttpProbe = {
  method: HttpMethod;
  transport: HttpTransport;
  status: number;
  ok: boolean;
  finalUrl: string;
  contentType?: string;
  contentLengthBytes?: number;
  lastModified?: string;
  etag?: string;
  responseDate?: string;
};

type SourceProbeBase = {
  schemaVersion: typeof probeSchemaVersion;
  sourceId: string;
  sourceType: ManifestSource["type"];
  sourcePriority: ManifestSource["priority"];
  manifestStatus: string;
  checkedAt: string;
  probeStatus: ProbeStatus;
  statusRecommendation: ProbeStatus;
  url?: string;
  redactedUrl?: string;
  http?: HttpProbe;
  error?: string;
};

export type SourceProbeOutput = SourceProbeBase & {
  socrata?: {
    datasetId: string;
    domain: string;
    metadataUrl: string;
    columnsUrl: string;
    rowsCsvUrl: string;
    rowCountUrl: string;
    name: string;
    columnCount: number;
    rowCount?: number;
    rowCountError?: string;
    rowsUpdatedAt?: number;
    rowsUpdatedAtIso?: string;
  };
  socrataDataset?: {
    metadata: SocrataMetadata;
    columns: Array<z.output<typeof SocrataColumnSchema>>;
  };
};

type ProbeOptions = {
  fetcher?: FetchLike;
  now?: () => Date;
  busTimeApiKey?: string;
};

const SocrataColumnsSchema = z.array(SocrataColumnSchema);
const SocrataCountResponseSchema = z.array(
  z.object({
    count: z.union([z.string(), z.number()]),
  }),
);
const sourceProbeUserAgent =
  "Mozilla/5.0 (compatible; BusPriorityImpactStudio/0.1; +https://www.mta.info/open-data)";
const sourceProbeHeaders = {
  accept: "*/*",
  "user-agent": sourceProbeUserAgent,
};

function checkedAt(options: ProbeOptions): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function createBaseProbe(
  source: ManifestSource,
  options: ProbeOptions,
  probeStatus: ProbeStatus,
): SourceProbeBase {
  return {
    schemaVersion: probeSchemaVersion,
    sourceId: source.id,
    sourceType: source.type,
    sourcePriority: source.priority,
    manifestStatus: source.status,
    checkedAt: checkedAt(options),
    probeStatus,
    statusRecommendation: probeStatus,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function addHeaderIfPresent<T extends Record<string, unknown>>(
  output: T,
  key: keyof T,
  value: string | number | undefined,
): void {
  if (value !== undefined) {
    output[key] = value as T[keyof T];
  }
}

async function closeBody(response: Response): Promise<void> {
  await response.body?.cancel();
}

function buildHttpProbeFromHeaders(
  headers: Headers,
  status: number,
  method: HttpMethod,
  finalUrl: string,
  transport: HttpTransport,
): HttpProbe {
  const output: HttpProbe = {
    method,
    transport,
    status,
    ok: status >= 200 && status < 400,
    finalUrl,
  };

  addHeaderIfPresent(output, "contentType", headers.get("content-type") ?? undefined);
  addHeaderIfPresent(
    output,
    "contentLengthBytes",
    parseContentLength(headers.get("content-length")),
  );
  addHeaderIfPresent(output, "lastModified", headers.get("last-modified") ?? undefined);
  addHeaderIfPresent(output, "etag", headers.get("etag") ?? undefined);
  addHeaderIfPresent(output, "responseDate", headers.get("date") ?? undefined);

  return output;
}

function buildFetchHttpProbe(response: Response, method: HttpMethod, finalUrl: string): HttpProbe {
  return buildHttpProbeFromHeaders(response.headers, response.status, method, finalUrl, "fetch");
}

export function parseCurlHeadOutput(output: string, fallbackUrl: string): HttpProbe {
  const marker = "__CURL_EFFECTIVE_URL__:";
  const [headersText = "", finalUrlText] = output.split(marker);
  const finalUrl = finalUrlText?.trim() || fallbackUrl;
  const headerBlocks = headersText
    .trim()
    .split(/\r?\n\r?\n/)
    .filter((block) => block.startsWith("HTTP/"));
  const finalBlock = headerBlocks.at(-1);

  if (finalBlock === undefined) {
    throw new Error("curl did not return an HTTP header block.");
  }

  const [statusLine, ...headerLines] = finalBlock.split(/\r?\n/);
  const statusMatch = statusLine?.match(/^HTTP\/\S+\s+(\d{3})/);
  if (statusMatch?.[1] === undefined) {
    throw new Error(`curl returned an unparseable HTTP status line: ${statusLine ?? ""}`);
  }

  const headers = new Headers();
  for (const line of headerLines) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  return buildHttpProbeFromHeaders(
    headers,
    Number.parseInt(statusMatch[1], 10),
    "HEAD",
    finalUrl,
    "curl",
  );
}

async function fetchCurlHeadMetadata(url: string): Promise<HttpProbe> {
  const proc = Bun.spawn(
    [
      "curl",
      "--head",
      "--location",
      "--silent",
      "--show-error",
      "--max-time",
      "20",
      "--user-agent",
      sourceProbeUserAgent,
      "--dump-header",
      "-",
      "--output",
      "/dev/null",
      "--write-out",
      `\n__CURL_EFFECTIVE_URL__:%{url_effective}\n`,
      url,
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `curl exited with code ${exitCode}`);
  }

  return parseCurlHeadOutput(stdout, url);
}

async function fetchHttpMetadata(url: string, fetcher: FetchLike): Promise<HttpProbe> {
  const headResponse = await fetcher(url, {
    method: "HEAD",
    headers: sourceProbeHeaders,
    redirect: "follow",
  });
  await closeBody(headResponse);

  if (headResponse.ok) {
    return buildFetchHttpProbe(headResponse, "HEAD", headResponse.url || url);
  }

  const getResponse = await fetcher(url, {
    method: "GET",
    headers: { ...sourceProbeHeaders, range: "bytes=0-0" },
    redirect: "follow",
  });
  await closeBody(getResponse);

  if (getResponse.ok) {
    return buildFetchHttpProbe(getResponse, "GET", getResponse.url || url);
  }

  try {
    return await fetchCurlHeadMetadata(url);
  } catch {
    return buildFetchHttpProbe(getResponse, "GET", getResponse.url || url);
  }
}

async function fetchRealtimeMetadata(url: string, fetcher: FetchLike): Promise<HttpProbe> {
  const response = await fetcher(url, {
    method: "GET",
    headers: sourceProbeHeaders,
    redirect: "follow",
  });
  await closeBody(response);

  return buildFetchHttpProbe(response, "GET", response.url || url);
}

function redactSecret(value: string, secret: string): string {
  return value.split(secret).join("<redacted>");
}

function redactBusTimeUrl(value: string, secret: string): string {
  return redactSecret(value.replace("<YOUR_KEY>", "<redacted>"), secret);
}

function buildRealtimeUrl(template: string, apiKey: string): string {
  return template.replace("<YOUR_KEY>", encodeURIComponent(apiKey));
}

function withHttpProbe(
  source: ManifestSource & { url: string },
  options: ProbeOptions,
  http: HttpProbe,
): SourceProbeOutput {
  return {
    ...createBaseProbe(source, options, http.ok ? "active" : "blocked"),
    url: source.url,
    http,
  };
}

async function probeHttpSource(
  source: ManifestSource,
  options: ProbeOptions,
): Promise<SourceProbeOutput> {
  if (!("url" in source)) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      error: "Source does not include a URL.",
    };
  }

  try {
    return withHttpProbe(
      source,
      options,
      await fetchHttpMetadata(source.url, options.fetcher ?? fetch),
    );
  } catch (error) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      url: source.url,
      error: errorMessage(error),
    };
  }
}

async function probeRealtimeSource(
  source: ManifestSource,
  options: ProbeOptions,
): Promise<SourceProbeOutput> {
  if (!("url" in source)) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      error: "Realtime source does not include a URL template.",
    };
  }

  const apiKey = options.busTimeApiKey?.trim();
  if (!apiKey) {
    return {
      ...createBaseProbe(source, options, "skipped"),
      redactedUrl: source.url.replace("<YOUR_KEY>", "<redacted>"),
      error: "Set MTA_BUS_TIME_API_KEY to probe Bus Time GTFS-RT feeds.",
    };
  }

  const url = buildRealtimeUrl(source.url, apiKey);
  try {
    const http = await fetchRealtimeMetadata(url, options.fetcher ?? fetch);
    const redactedHttp: HttpProbe = {
      ...http,
      finalUrl: redactBusTimeUrl(http.finalUrl, apiKey),
    };

    const output: SourceProbeOutput = {
      ...createBaseProbe(source, options, http.ok ? "active" : "blocked"),
      redactedUrl: redactBusTimeUrl(source.url, apiKey),
      http: redactedHttp,
    };

    if (!http.ok) {
      output.error = `HTTP ${http.status}`;
    }

    return output;
  } catch (error) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      redactedUrl: redactBusTimeUrl(source.url, apiKey),
      error: redactSecret(errorMessage(error), apiKey),
    };
  }
}

function rowsUpdatedAtIso(rowsUpdatedAt: number | undefined): string | undefined {
  if (rowsUpdatedAt === undefined) {
    return undefined;
  }

  return new Date(rowsUpdatedAt * 1000).toISOString();
}

async function fetchJson(url: string, fetcher: FetchLike): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    headers: sourceProbeHeaders,
    redirect: "follow",
  });
  if (!response.ok) {
    await closeBody(response);
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function buildSocrataRowCountUrl(source: SocrataManifestSource): string {
  return buildSocrataRowsUrl(source.domain, source.dataset_id, { select: "count(*)" }).toString();
}

async function fetchSocrataRowCount(url: string, fetcher: FetchLike): Promise<number> {
  const rows = SocrataCountResponseSchema.parse(await fetchJson(url, fetcher));
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

export async function probeSocrataSource(
  source: SocrataManifestSource,
  options: ProbeOptions = {},
): Promise<SourceProbeOutput> {
  const metadataUrl = buildSocrataMetadataUrl(source.domain, source.dataset_id).toString();
  const rowCountUrl = buildSocrataRowCountUrl(source);
  const fetcher = options.fetcher ?? fetch;

  try {
    const metadata = parseSocrataMetadata(await fetchJson(metadataUrl, fetcher));
    const columns = SocrataColumnsSchema.parse(await fetchJson(source.columns_json, fetcher));
    const rowsUpdatedAt = metadata.rowsUpdatedAt;
    const updatedIso = rowsUpdatedAtIso(rowsUpdatedAt);

    if (metadata.id !== source.dataset_id) {
      return {
        ...createBaseProbe(source, options, "blocked"),
        url: source.url,
        error: `Metadata id ${metadata.id} did not match manifest dataset id ${source.dataset_id}.`,
      };
    }

    const output: SourceProbeOutput = {
      ...createBaseProbe(source, options, "active"),
      url: source.url,
      socrata: {
        datasetId: source.dataset_id,
        domain: source.domain,
        metadataUrl,
        columnsUrl: source.columns_json,
        rowsCsvUrl: source.rows_csv,
        rowCountUrl,
        name: metadata.name,
        columnCount: columns.length,
      },
      socrataDataset: {
        metadata,
        columns,
      },
    };

    if (rowsUpdatedAt !== undefined) {
      const socrata = output.socrata;
      if (socrata === undefined) {
        throw new Error("Internal error: missing Socrata probe summary.");
      }
      output.socrata = {
        ...socrata,
        rowsUpdatedAt,
      };
    }

    if (updatedIso !== undefined) {
      const socrata = output.socrata;
      if (socrata === undefined) {
        throw new Error("Internal error: missing Socrata probe summary.");
      }
      output.socrata = {
        ...socrata,
        rowsUpdatedAtIso: updatedIso,
      };
    }

    try {
      const rowCount = await fetchSocrataRowCount(rowCountUrl, fetcher);
      const socrata = output.socrata;
      if (socrata === undefined) {
        throw new Error("Internal error: missing Socrata probe summary.");
      }
      output.socrata = {
        ...socrata,
        rowCount,
      };
    } catch (error) {
      const socrata = output.socrata;
      if (socrata === undefined) {
        throw new Error("Internal error: missing Socrata probe summary.");
      }
      output.socrata = {
        ...socrata,
        rowCountError: errorMessage(error),
      };
    }

    return output;
  } catch (error) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      url: source.url,
      error: errorMessage(error),
    };
  }
}

export async function probeSource(
  source: ManifestSource,
  options: ProbeOptions = {},
): Promise<SourceProbeOutput> {
  if (source.type === "socrata_dataset") {
    return probeSocrataSource(source, options);
  }

  if (source.type === "gtfs_realtime_api") {
    return probeRealtimeSource(source, options);
  }

  return probeHttpSource(source, options);
}

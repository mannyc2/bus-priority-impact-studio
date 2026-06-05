import type { FetchLike, HttpMethod, HttpProbe, HttpTransport } from "../contracts.js";

const sourceProbeUserAgent =
  "Mozilla/5.0 (compatible; BusPriorityImpactStudio/0.1; +https://www.mta.info/open-data)";

export const sourceProbeHeaders = {
  accept: "*/*",
  "user-agent": sourceProbeUserAgent,
};

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

export async function closeBody(response: Response): Promise<void> {
  await response.body?.cancel();
}

export function buildHttpProbeFromHeaders(
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

export async function fetchHttpMetadata(
  url: string,
  fetcher: FetchLike,
  headFallback: ((url: string) => Promise<HttpProbe>) | undefined,
): Promise<HttpProbe> {
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

  if (headFallback !== undefined) {
    try {
      return await headFallback(url);
    } catch {
      return buildFetchHttpProbe(getResponse, "GET", getResponse.url || url);
    }
  }

  return buildFetchHttpProbe(getResponse, "GET", getResponse.url || url);
}

export async function fetchRealtimeMetadata(url: string, fetcher: FetchLike): Promise<HttpProbe> {
  const response = await fetcher(url, {
    method: "GET",
    headers: sourceProbeHeaders,
    redirect: "follow",
  });
  await closeBody(response);

  return buildFetchHttpProbe(response, "GET", response.url || url);
}

export async function fetchJson(url: string, fetcher: FetchLike): Promise<unknown> {
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

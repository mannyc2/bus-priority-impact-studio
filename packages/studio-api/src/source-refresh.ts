import { isSoda3ClientError } from "@nyc-transit-kit/compat/errors";
import { querySoda3Rows } from "@nyc-transit-kit/compat/soda3";
import type { StudioApiEnv } from "./env.js";

type SourceRefreshEnv = Pick<
  StudioApiEnv,
  | "ARTIFACTS"
  | "GTFS_RT_RAW"
  | "GTFS_RT_SAMPLES_PER_CRON"
  | "GTFS_RT_SAMPLE_SECONDS"
  | "LAST_BUILT_SPEED_MONTH"
  | "MTA_BUS_TIME_API_KEY"
  | "SOCRATA_APP_TOKEN"
>;

export const ROUTE_SPEED_WATCHER_CRON = "17 10 * * *";

type SourceRefreshFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Delay = (milliseconds: number) => Promise<void>;
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type RouteSpeedRowsQueryResult = Awaited<ReturnType<typeof querySoda3Rows>>;
type RouteSpeedRowsResult =
  | { ok: true; response: RouteSpeedRowsQueryResult }
  | { ok: false; error: unknown };

export type SourceRefreshResult = {
  status: "skipped" | "captured" | "failed";
  reason: string;
  feedType: "vehicle_positions";
  objectKey: string | null;
  manifestKey: string | null;
  byteLength: number;
  sha256: string | null;
  fetchedAt: string;
};

type SpeedMonth = {
  isoMonth: string;
  year: number;
  month: number;
  routeCount: number;
  rowCount: number;
  busTripCount: number;
  status: "complete" | "insufficient_speed_routes";
};

export type RouteSpeedWatcherResult = {
  status: "skipped" | "checked" | "failed";
  reason: string;
  latestCompleteMonth: string | null;
  lastBuiltMonth: string | null;
  shouldRebuild: boolean;
  artifactKey: string | null;
  checkedAt: string;
};

export type ScheduledProductionRefreshResult = {
  gtfsRt: SourceRefreshResult[];
  routeSpeed: RouteSpeedWatcherResult;
  statusArtifactKey: string | null;
};

type RawSpeedRow = Readonly<Record<string, unknown>>;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stamp(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "");
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function redactedVehiclePositionsUrl(): string {
  return "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=REDACTED";
}

function parseInteger(input: unknown): number {
  if (typeof input === "number") {
    return input;
  }

  if (typeof input === "string" && input.length > 0) {
    return Number.parseInt(input, 10);
  }

  return 0;
}

function parseBuiltMonth(input: string | undefined): string | null {
  return input?.match(/^\d{4}-\d{2}$/) ? input : null;
}

function parsePositiveInteger(input: string | undefined, fallback: number): number {
  if (input === undefined || input.length === 0) {
    return fallback;
  }

  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function adaptSourceRefreshFetch(fetcher: SourceRefreshFetch): typeof fetch {
  const compatFetch = async (input: FetchInput, init?: FetchInit) =>
    input instanceof Request
      ? fetcher(input.url, await requestInitFromRequest(input, init))
      : fetcher(input, requestInitWithNormalizedBody(init));
  const nativeFetch = fetch as typeof fetch & { preconnect?: unknown };

  return Object.assign(compatFetch, {
    preconnect: nativeFetch.preconnect,
  });
}

function summarizeSpeedRows(rows: readonly RawSpeedRow[], minSpeedRoutes: number): SpeedMonth[] {
  const months = new Map<
    string,
    { year: number; month: number; routes: Set<string>; rowCount: number; busTripCount: number }
  >();

  for (const row of rows) {
    const year = parseInteger(row["year"]);
    const month = parseInteger(row["month"]);
    const routeId = typeof row["route_id"] === "string" ? row["route_id"] : undefined;
    if (year <= 0 || month <= 0 || routeId === undefined) {
      continue;
    }

    const key = `${year}-${String(month).padStart(2, "0")}`;
    const existing = months.get(key) ?? {
      year,
      month,
      routes: new Set<string>(),
      rowCount: 0,
      busTripCount: 0,
    };
    existing.routes.add(routeId);
    existing.rowCount += parseInteger(row["row_count"]);
    existing.busTripCount += parseInteger(row["bus_trip_count"]);
    months.set(key, existing);
  }

  return [...months.entries()]
    .map(([isoMonth, value]) => {
      const status: SpeedMonth["status"] =
        value.routes.size >= minSpeedRoutes ? "complete" : "insufficient_speed_routes";

      return {
        isoMonth,
        year: value.year,
        month: value.month,
        routeCount: value.routes.size,
        rowCount: value.rowCount,
        busTripCount: value.busTripCount,
        status,
      };
    })
    .sort((left, right) => right.isoMonth.localeCompare(left.isoMonth));
}

export async function runScheduledSourceRefresh(
  env: SourceRefreshEnv,
  options: {
    now?: Date;
    fetcher?: SourceRefreshFetch;
  } = {},
): Promise<SourceRefreshResult> {
  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();
  const bucket = env.GTFS_RT_RAW;
  const apiKey = env.MTA_BUS_TIME_API_KEY;

  if (bucket === undefined) {
    return {
      status: "skipped",
      reason: "GTFS_RT_RAW R2 binding is not configured.",
      feedType: "vehicle_positions",
      objectKey: null,
      manifestKey: null,
      byteLength: 0,
      sha256: null,
      fetchedAt,
    };
  }

  if (apiKey === undefined || apiKey.length === 0) {
    return {
      status: "skipped",
      reason: "MTA_BUS_TIME_API_KEY secret is not configured.",
      feedType: "vehicle_positions",
      objectKey: null,
      manifestKey: null,
      byteLength: 0,
      sha256: null,
      fetchedAt,
    };
  }

  const fetcher = options.fetcher ?? fetch;
  const url = new URL("https://gtfsrt.prod.obanyc.com/vehiclePositions");
  url.searchParams.set("key", apiKey);
  const response = await fetcher(url);

  if (!response.ok) {
    return {
      status: "failed",
      reason: `Vehicle positions fetch failed with HTTP ${response.status}.`,
      feedType: "vehicle_positions",
      objectKey: null,
      manifestKey: null,
      byteLength: 0,
      sha256: null,
      fetchedAt,
    };
  }

  const bytes = await response.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const objectKey = `gtfs-rt/vehicle_positions/${ymd(now)}/${stamp(now)}.pb`;
  const manifestKey = `gtfs-rt/vehicle_positions/${ymd(now)}/${stamp(now)}.json`;
  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType: "application/x-protobuf" },
    customMetadata: {
      feedType: "vehicle_positions",
      fetchedAt,
      sha256: hash,
    },
  });
  await bucket.put(
    manifestKey,
    JSON.stringify(
      {
        feedType: "vehicle_positions",
        fetchedAt,
        objectKey,
        byteLength: bytes.byteLength,
        sha256: hash,
        sourceUrl: redactedVehiclePositionsUrl(),
      },
      null,
      2,
    ),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } },
  );

  return {
    status: "captured",
    reason: "Vehicle positions snapshot captured.",
    feedType: "vehicle_positions",
    objectKey,
    manifestKey,
    byteLength: bytes.byteLength,
    sha256: hash,
    fetchedAt,
  };
}

export async function runScheduledGtfsRtCaptureBatch(
  env: SourceRefreshEnv,
  options: {
    now?: Date;
    fetcher?: SourceRefreshFetch;
    delay?: Delay;
  } = {},
): Promise<SourceRefreshResult[]> {
  const samplesPerCron = parsePositiveInteger(env.GTFS_RT_SAMPLES_PER_CRON, 1);
  const sampleSeconds = parsePositiveInteger(env.GTFS_RT_SAMPLE_SECONDS, 30);
  const results: SourceRefreshResult[] = [];
  const delay = options.delay ?? defaultDelay;

  for (let sampleIndex = 0; sampleIndex < samplesPerCron; sampleIndex += 1) {
    if (sampleIndex > 0) {
      await delay(sampleSeconds * 1_000);
    }

    const sampleNow =
      options.now === undefined
        ? new Date()
        : new Date(options.now.getTime() + sampleIndex * sampleSeconds * 1_000);

    const captureOptions: { now: Date; fetcher?: SourceRefreshFetch } = { now: sampleNow };
    if (options.fetcher !== undefined) {
      captureOptions.fetcher = options.fetcher;
    }

    results.push(await runScheduledSourceRefresh(env, captureOptions));
  }

  return results;
}

export async function runRouteSpeedMonthlyWatcher(
  env: SourceRefreshEnv,
  options: {
    now?: Date;
    fetcher?: SourceRefreshFetch;
    minSpeedRoutes?: number;
  } = {},
): Promise<RouteSpeedWatcherResult> {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const bucket = env.ARTIFACTS;
  if (bucket === undefined) {
    return {
      status: "skipped",
      reason: "ARTIFACTS R2 binding is not configured.",
      latestCompleteMonth: null,
      lastBuiltMonth: parseBuiltMonth(env.LAST_BUILT_SPEED_MONTH),
      shouldRebuild: false,
      artifactKey: null,
      checkedAt,
    };
  }

  const appToken = env.SOCRATA_APP_TOKEN?.trim();
  if (appToken === undefined || appToken.length === 0) {
    return {
      status: "skipped",
      reason: "SOCRATA_APP_TOKEN secret is not configured.",
      latestCompleteMonth: null,
      lastBuiltMonth: parseBuiltMonth(env.LAST_BUILT_SPEED_MONTH),
      shouldRebuild: false,
      artifactKey: null,
      checkedAt,
    };
  }

  const fetcher = options.fetcher ?? fetch;
  const year = now.getUTCFullYear();
  const query = [
    "SELECT year,month,route_id,count(*) as row_count,sum(bus_trip_count) as bus_trip_count",
    `WHERE year between ${year - 1} and ${year}`,
    "GROUP BY year,month,route_id",
    "ORDER BY year DESC,month DESC,route_id",
    "LIMIT 50000",
  ].join(" ");
  const rowsResult: RouteSpeedRowsResult = await querySoda3Rows(
    {
      domain: "data.ny.gov",
      datasetId: "kufs-yh3x",
      query,
      includeSynthetic: false,
    },
    { appToken, fetch: adaptSourceRefreshFetch(fetcher) },
  ).then(
    (response): RouteSpeedRowsResult => ({ ok: true, response }),
    (error: unknown): RouteSpeedRowsResult => ({ ok: false, error }),
  );
  if (!rowsResult.ok) {
    const rowsError = rowsResult.error;
    const status =
      isSoda3ClientError(rowsError) && "status" in rowsError && typeof rowsError.status === "number"
        ? rowsError.status
        : null;
    return {
      status: "failed",
      reason:
        status === null
          ? "Route speed availability fetch failed."
          : `Route speed availability fetch failed with HTTP ${status}.`,
      latestCompleteMonth: null,
      lastBuiltMonth: parseBuiltMonth(env.LAST_BUILT_SPEED_MONTH),
      shouldRebuild: false,
      artifactKey: null,
      checkedAt,
    };
  }

  const months = summarizeSpeedRows(rowsResult.response.rows, options.minSpeedRoutes ?? 300);
  const latestCompleteMonth = months.find((month) => month.status === "complete")?.isoMonth ?? null;
  const lastBuiltMonth = parseBuiltMonth(env.LAST_BUILT_SPEED_MONTH);
  const shouldRebuild =
    latestCompleteMonth !== null &&
    (lastBuiltMonth === null || latestCompleteMonth > lastBuiltMonth);
  const artifactKey = "source-availability/route-speed-availability-worker.json";
  await bucket.put(
    artifactKey,
    JSON.stringify(
      {
        checkedAt,
        sourceId: "bus_segment_speeds_2025",
        latestCompleteMonth,
        lastBuiltMonth,
        shouldRebuild,
        months,
      },
      null,
      2,
    ),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } },
  );

  return {
    status: "checked",
    reason: shouldRebuild
      ? `New complete speed month ${latestCompleteMonth} is available.`
      : "No new complete speed month is available.",
    latestCompleteMonth,
    lastBuiltMonth,
    shouldRebuild,
    artifactKey,
    checkedAt,
  };
}

export async function runScheduledProductionRefresh(
  env: SourceRefreshEnv,
  options: { cron?: string } = {},
): Promise<ScheduledProductionRefreshResult> {
  const shouldRunRouteSpeedWatcher =
    options.cron === undefined || options.cron === ROUTE_SPEED_WATCHER_CRON;
  const [gtfsRt, routeSpeed] = await Promise.all([
    runScheduledGtfsRtCaptureBatch(env),
    shouldRunRouteSpeedWatcher
      ? runRouteSpeedMonthlyWatcher(env)
      : Promise.resolve({
          status: "skipped" as const,
          reason: `Route speed watcher runs on cron ${ROUTE_SPEED_WATCHER_CRON}.`,
          latestCompleteMonth: null,
          lastBuiltMonth: parseBuiltMonth(env.LAST_BUILT_SPEED_MONTH),
          shouldRebuild: false,
          artifactKey: null,
          checkedAt: new Date().toISOString(),
        }),
  ]);
  const statusArtifactKey = "source-refresh/latest.json";
  if (env.ARTIFACTS !== undefined) {
    await env.ARTIFACTS.put(
      statusArtifactKey,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          cron: options.cron ?? null,
          gtfsRt: {
            sampleCount: gtfsRt.length,
            capturedCount: gtfsRt.filter((result) => result.status === "captured").length,
            latestFetchedAt: gtfsRt.at(-1)?.fetchedAt ?? null,
            latestStatus: gtfsRt.at(-1)?.status ?? null,
            latestObjectKey: gtfsRt.at(-1)?.objectKey ?? null,
            latestManifestKey: gtfsRt.at(-1)?.manifestKey ?? null,
          },
          routeSpeed: {
            status: routeSpeed.status,
            latestCompleteMonth: routeSpeed.latestCompleteMonth,
            lastBuiltMonth: routeSpeed.lastBuiltMonth,
            shouldRebuild: routeSpeed.shouldRebuild,
            artifactKey: routeSpeed.artifactKey,
            reason: routeSpeed.reason,
          },
        },
        null,
        2,
      ),
      { httpMetadata: { contentType: "application/json; charset=utf-8" } },
    );
  }

  return {
    gtfsRt,
    routeSpeed,
    statusArtifactKey: env.ARTIFACTS === undefined ? null : statusArtifactKey,
  };
}

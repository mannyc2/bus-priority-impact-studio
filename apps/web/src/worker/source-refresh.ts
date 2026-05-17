type SourceRefreshEnv = {
  MTA_BUS_TIME_API_KEY?: string;
  GTFS_RT_RAW?: R2Bucket;
  ARTIFACTS?: R2Bucket;
  LAST_BUILT_SPEED_MONTH?: string;
};

type SourceRefreshFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
  gtfsRt: SourceRefreshResult;
  routeSpeed: RouteSpeedWatcherResult;
};

type RawSpeedRow = {
  year?: string | number;
  month?: string | number;
  route_id?: string;
  row_count?: string | number;
  bus_trip_count?: string | number | null;
};

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

function parseInteger(input: string | number | null | undefined): number {
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

function summarizeSpeedRows(rows: RawSpeedRow[], minSpeedRoutes: number): SpeedMonth[] {
  const months = new Map<
    string,
    { year: number; month: number; routes: Set<string>; rowCount: number; busTripCount: number }
  >();

  for (const row of rows) {
    const year = parseInteger(row.year);
    const month = parseInteger(row.month);
    const routeId = row.route_id;
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
    existing.rowCount += parseInteger(row.row_count);
    existing.busTripCount += parseInteger(row.bus_trip_count);
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

  const fetcher = options.fetcher ?? fetch;
  const year = now.getUTCFullYear();
  const url = new URL("https://data.ny.gov/resource/kufs-yh3x.json");
  url.searchParams.set(
    "$select",
    "year,month,route_id,count(*) as row_count,sum(bus_trip_count) as bus_trip_count",
  );
  url.searchParams.set("$where", `year between ${year - 1} and ${year}`);
  url.searchParams.set("$group", "year,month,route_id");
  url.searchParams.set("$order", "year DESC,month DESC,route_id");

  const response = await fetcher(url);
  if (!response.ok) {
    return {
      status: "failed",
      reason: `Route speed availability fetch failed with HTTP ${response.status}.`,
      latestCompleteMonth: null,
      lastBuiltMonth: parseBuiltMonth(env.LAST_BUILT_SPEED_MONTH),
      shouldRebuild: false,
      artifactKey: null,
      checkedAt,
    };
  }

  const months = summarizeSpeedRows(
    (await response.json()) as RawSpeedRow[],
    options.minSpeedRoutes ?? 300,
  );
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
): Promise<ScheduledProductionRefreshResult> {
  const [gtfsRt, routeSpeed] = await Promise.all([
    runScheduledSourceRefresh(env),
    runRouteSpeedMonthlyWatcher(env),
  ]);

  return { gtfsRt, routeSpeed };
}

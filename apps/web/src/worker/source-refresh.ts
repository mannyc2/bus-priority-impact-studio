type SourceRefreshEnv = {
  MTA_BUS_TIME_API_KEY?: string;
  GTFS_RT_RAW?: R2Bucket;
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

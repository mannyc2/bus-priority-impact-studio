import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  finishGtfsRtCollectionRun,
  type GtfsRtFeedType,
  insertGtfsRtCollectionRun,
  insertGtfsRtFeedSnapshot,
} from "@bp/db/local";
import { type CliOption, stringListOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { createDbContext, type DbArgs, parseDbCliArgs } from "../../lib/route-job.js";
import type { ManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const defaultFeedTypes: readonly GtfsRtFeedType[] = ["vehicle_positions", "trip_updates", "alerts"];

const feedSources = {
  vehicle_positions: "bus_time_gtfsrt_vehicle_positions",
  trip_updates: "bus_time_gtfsrt_trip_updates",
  alerts: "bus_time_gtfsrt_alerts",
} satisfies Record<GtfsRtFeedType, string>;

const env = Bun.env as { MTA_BUS_TIME_API_KEY?: string };

type GtfsRtFetch = (url: string) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export type CollectGtfsRtArgs = DbArgs & {
  apiKey?: string;
  durationSeconds?: number;
  durationHours?: number;
  sampleSeconds?: number;
  sampleCount?: number;
  feedTypes?: GtfsRtFeedType[];
  rawDir?: string;
  runId?: string;
  startedAt?: Date;
  fetcher?: GtfsRtFetch;
  sleep?: Sleep;
  now?: () => Date;
};

export type CollectGtfsRtResult = {
  runId: string;
  status: "completed" | "completed_with_errors" | "failed";
  requestedFeedTypes: GtfsRtFeedType[];
  sampleCount: number;
  snapshotCount: number;
  successCount: number;
  failureCount: number;
  rawDirectory: string;
};

type SourceByFeed = Record<GtfsRtFeedType, ManifestSource>;

function normalizeFeedTypes(values: readonly string[] | undefined): GtfsRtFeedType[] {
  if (values === undefined || values.length === 0) {
    return [...defaultFeedTypes];
  }

  return values.map((value) => {
    if (value === "vehicle_positions" || value === "trip_updates" || value === "alerts") {
      return value;
    }

    throw new Error(`Unsupported GTFS-RT feed type: ${value}`);
  });
}

function requestedDurationSeconds(args: CollectGtfsRtArgs): number {
  if (args.durationHours !== undefined) {
    return Math.max(1, Math.round(args.durationHours * 60 * 60));
  }

  return Math.max(1, Math.round(args.durationSeconds ?? 60));
}

function requestedSampleSeconds(args: CollectGtfsRtArgs): number {
  return Math.max(1, Math.round(args.sampleSeconds ?? 30));
}

function plannedSampleCount(args: CollectGtfsRtArgs): number {
  if (args.sampleCount !== undefined) {
    return Math.max(1, Math.round(args.sampleCount));
  }

  return Math.max(1, Math.ceil(requestedDurationSeconds(args) / requestedSampleSeconds(args)));
}

function defaultRawDir(startedAt: Date, runId: string): string {
  return fromRepoRoot(join("data/raw/gtfs-rt", startedAt.toISOString().slice(0, 10), runId));
}

function findFeedSources(sources: readonly ManifestSource[]): SourceByFeed {
  const byId = new Map(sources.map((source) => [source.id, source]));

  return {
    vehicle_positions: requireGtfsRtSource(byId, "vehicle_positions"),
    trip_updates: requireGtfsRtSource(byId, "trip_updates"),
    alerts: requireGtfsRtSource(byId, "alerts"),
  };
}

function requireGtfsRtSource(
  byId: ReadonlyMap<string, ManifestSource>,
  feedType: GtfsRtFeedType,
): ManifestSource {
  const source = byId.get(feedSources[feedType]);
  if (source === undefined || source.type !== "gtfs_realtime_api") {
    throw new Error(`Missing GTFS-RT source in manifest: ${feedSources[feedType]}`);
  }

  return source;
}

function urlWithKey(source: ManifestSource, apiKey: string): string {
  if (source.type !== "gtfs_realtime_api") {
    throw new Error(`Source is not a GTFS-RT API: ${source.id}`);
  }

  return source.url.replace("<YOUR_KEY>", encodeURIComponent(apiKey));
}

function redactedUrl(source: ManifestSource): string {
  if (source.type !== "gtfs_realtime_api") {
    throw new Error(`Source is not a GTFS-RT API: ${source.id}`);
  }

  return source.url.replace("<YOUR_KEY>", "<redacted>");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateError(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497)}...`;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await Bun.sleep(milliseconds);
}

async function writeRawSnapshot(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, bytes);
}

export async function collectGtfsRtSnapshots(
  args: CollectGtfsRtArgs = {},
): Promise<CollectGtfsRtResult> {
  const options = createDbContext(args);
  const apiKey = args.apiKey ?? env.MTA_BUS_TIME_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("Missing required environment variable: MTA_BUS_TIME_API_KEY");
  }

  const startedAt = args.startedAt ?? new Date();
  const runId = args.runId ?? randomUUID();
  const feedTypes = normalizeFeedTypes(args.feedTypes);
  const durationSeconds = requestedDurationSeconds(args);
  const sampleSeconds = requestedSampleSeconds(args);
  const sampleCount = plannedSampleCount(args);
  const rawDirectory = args.rawDir ?? defaultRawDir(startedAt, runId);
  const fetcher = args.fetcher ?? fetch;
  const sleep = args.sleep ?? defaultSleep;
  const now = args.now ?? (() => new Date());
  const manifest = await readSourceManifest();
  const sources = findFeedSources(manifest.sources);
  const snapshots: Awaited<ReturnType<typeof captureSnapshot>>[] = [];

  return withLocalPipelineDb(options.dbPath, async (local) => {
    await insertGtfsRtCollectionRun(local.db, {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      status: "running",
      requestedDurationSeconds: durationSeconds,
      sampleSeconds,
      requestedFeedTypes: feedTypes.join(","),
      snapshotCount: 0,
      successCount: 0,
      failureCount: 0,
      rawDirectory,
      error: null,
    });

    try {
      for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
        for (const feedType of feedTypes) {
          const snapshot = await captureSnapshot({
            apiKey,
            feedType,
            fetcher,
            now,
            rawDirectory,
            runId,
            sampleIndex,
            source: sources[feedType],
          });
          snapshots.push(snapshot);
          await insertGtfsRtFeedSnapshot(local.db, snapshot);
        }

        if (sampleIndex < sampleCount) {
          await sleep(sampleSeconds * 1000);
        }
      }

      const successCount = snapshots.filter((snapshot) => snapshot.status === "ok").length;
      const failureCount = snapshots.length - successCount;
      const status = failureCount === 0 ? "completed" : "completed_with_errors";
      await finishGtfsRtCollectionRun(local.db, runId, {
        endedAt: now().toISOString(),
        status,
        snapshotCount: snapshots.length,
        successCount,
        failureCount,
        error: null,
      });

      return {
        runId,
        status,
        requestedFeedTypes: feedTypes,
        sampleCount,
        snapshotCount: snapshots.length,
        successCount,
        failureCount,
        rawDirectory,
      };
    } catch (error) {
      const successCount = snapshots.filter((snapshot) => snapshot.status === "ok").length;
      const failureCount = snapshots.length - successCount;
      await finishGtfsRtCollectionRun(local.db, runId, {
        endedAt: now().toISOString(),
        status: "failed",
        snapshotCount: snapshots.length,
        successCount,
        failureCount,
        error: truncateError(errorText(error)),
      });
      throw error;
    }
  });
}

async function captureSnapshot(input: {
  apiKey: string;
  feedType: GtfsRtFeedType;
  fetcher: GtfsRtFetch;
  now: () => Date;
  rawDirectory: string;
  runId: string;
  sampleIndex: number;
  source: ManifestSource;
}) {
  const fetchedAt = input.now().toISOString();
  const sourceUrl = urlWithKey(input.source, input.apiKey);
  const redacted = redactedUrl(input.source);

  try {
    const response = await input.fetcher(sourceUrl);
    if (!response.ok) {
      return {
        runId: input.runId,
        feedType: input.feedType,
        sampleIndex: input.sampleIndex,
        sourceId: input.source.id,
        fetchedAt,
        status: "http_error" as const,
        httpStatus: response.status,
        byteLength: null,
        sha256: null,
        rawPath: null,
        redactedUrl: redacted,
        error: truncateError(await response.text()),
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const rawPath = join(
      input.rawDirectory,
      `${String(input.sampleIndex).padStart(4, "0")}-${input.feedType}.pb`,
    );
    try {
      await writeRawSnapshot(rawPath, bytes);
    } catch (error) {
      return {
        runId: input.runId,
        feedType: input.feedType,
        sampleIndex: input.sampleIndex,
        sourceId: input.source.id,
        fetchedAt,
        status: "write_error" as const,
        httpStatus: response.status,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        rawPath,
        redactedUrl: redacted,
        error: truncateError(errorText(error)),
      };
    }

    return {
      runId: input.runId,
      feedType: input.feedType,
      sampleIndex: input.sampleIndex,
      sourceId: input.source.id,
      fetchedAt,
      status: "ok" as const,
      httpStatus: response.status,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      rawPath,
      redactedUrl: redacted,
      error: null,
    };
  } catch (error) {
    return {
      runId: input.runId,
      feedType: input.feedType,
      sampleIndex: input.sampleIndex,
      sourceId: input.source.id,
      fetchedAt,
      status: "network_error" as const,
      httpStatus: null,
      byteLength: null,
      sha256: null,
      rawPath: null,
      redactedUrl: redacted,
      error: truncateError(errorText(error)),
    };
  }
}

function parseFeedTypes(values: string[]): GtfsRtFeedType[] {
  return normalizeFeedTypes(values);
}

export function parseCollectGtfsRtCliArgs(args: string[]): CollectGtfsRtArgs {
  type CliArgs = CollectGtfsRtArgs & { rawDir?: string };
  const extraOptions: CliOption<CliArgs>[] = [
    {
      flags: ["--duration-seconds"],
      apply: (output, value) => {
        output.durationSeconds = Number(value);
      },
    },
    {
      flags: ["--duration-hours"],
      apply: (output, value) => {
        output.durationHours = Number(value);
      },
    },
    {
      flags: ["--sample-seconds"],
      apply: (output, value) => {
        output.sampleSeconds = Number(value);
      },
    },
    {
      flags: ["--sample-count"],
      apply: (output, value) => {
        output.sampleCount = Number(value);
      },
    },
    stringListOption(["--feed-types"], (output, value) => {
      output.feedTypes = parseFeedTypes(value);
    }),
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--raw-dir"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.rawDir = fromCliPath(value);
        }
      },
    },
  ];

  return parseDbCliArgs(args, {} as CliArgs, extraOptions);
}

export async function collectGtfsRtSnapshotsFromCli(args: string[]): Promise<CollectGtfsRtResult> {
  return collectGtfsRtSnapshots(parseCollectGtfsRtCliArgs(args));
}

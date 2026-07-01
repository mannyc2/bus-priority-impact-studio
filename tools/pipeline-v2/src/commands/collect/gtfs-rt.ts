import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  finishGtfsRtCollectionRun,
  type GtfsRtFeedType,
  insertGtfsRtCollectionRun,
  insertGtfsRtFeedSnapshot,
} from "@bp/db/local";
import type { ManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const defaultFeedTypes: readonly GtfsRtFeedType[] = ["vehicle_positions", "trip_updates", "alerts"];

const feedSources = {
  vehicle_positions: "bus_time_gtfsrt_vehicle_positions",
  trip_updates: "bus_time_gtfsrt_trip_updates",
  alerts: "bus_time_gtfsrt_alerts",
} satisfies Record<GtfsRtFeedType, string>;

type GtfsRtFetch = (url: string) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export type CollectGtfsRtRunInputs = {
  local: OpenLocalPipelineDb;
  apiKey?: string | undefined;
  durationSeconds?: number | undefined;
  durationHours?: number | undefined;
  sampleSeconds?: number | undefined;
  sampleCount?: number | undefined;
  feedTypes?: GtfsRtFeedType[] | undefined;
  rawDir?: string | undefined;
  runId?: string | undefined;
  startedAt?: Date | undefined;
  fetcher?: GtfsRtFetch | undefined;
  sleep?: Sleep | undefined;
  now?: (() => Date) | undefined;
  manifestText?: string | undefined;
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
  if (values === undefined || values.length === 0) return [...defaultFeedTypes];
  return values.map((value) => {
    if (value === "vehicle_positions" || value === "trip_updates" || value === "alerts") {
      return value;
    }
    throw new Error(`Unsupported GTFS-RT feed type: ${value}`);
  });
}

function requestedDurationSeconds(inputs: CollectGtfsRtRunInputs): number {
  if (inputs.durationHours !== undefined) {
    return Math.max(1, Math.round(inputs.durationHours * 60 * 60));
  }
  return Math.max(1, Math.round(inputs.durationSeconds ?? 60));
}

function requestedSampleSeconds(inputs: CollectGtfsRtRunInputs): number {
  return Math.max(1, Math.round(inputs.sampleSeconds ?? 30));
}

function plannedSampleCount(inputs: CollectGtfsRtRunInputs): number {
  if (inputs.sampleCount !== undefined) return Math.max(1, Math.round(inputs.sampleCount));
  return Math.max(1, Math.ceil(requestedDurationSeconds(inputs) / requestedSampleSeconds(inputs)));
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

export async function runCollectGtfsRt(
  inputs: CollectGtfsRtRunInputs,
): Promise<CollectGtfsRtResult> {
  const mtaBusTimeApiKeyEnv = "MTA_BUS_TIME_API_KEY";
  const apiKey = inputs.apiKey ?? Bun.env[mtaBusTimeApiKeyEnv];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("Missing required environment variable: MTA_BUS_TIME_API_KEY");
  }

  const startedAt = inputs.startedAt ?? new Date();
  const runId = inputs.runId ?? randomUUID();
  const feedTypes = normalizeFeedTypes(inputs.feedTypes);
  const durationSeconds = requestedDurationSeconds(inputs);
  const sampleSeconds = requestedSampleSeconds(inputs);
  const sampleCount = plannedSampleCount(inputs);
  const rawDirectory = inputs.rawDir ?? defaultRawDir(startedAt, runId);
  const fetcher = inputs.fetcher ?? fetch;
  const sleep = inputs.sleep ?? defaultSleep;
  const now = inputs.now ?? (() => new Date());
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const sources = findFeedSources(manifest.sources);
  const snapshots: Awaited<ReturnType<typeof captureSnapshot>>[] = [];

  await insertGtfsRtCollectionRun(inputs.local.db, {
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
        await insertGtfsRtFeedSnapshot(inputs.local.db, snapshot);
      }
      if (sampleIndex < sampleCount) {
        await sleep(sampleSeconds * 1000);
      }
    }
    const successCount = snapshots.filter((snapshot) => snapshot.status === "ok").length;
    const failureCount = snapshots.length - successCount;
    const status = failureCount === 0 ? "completed" : "completed_with_errors";
    await finishGtfsRtCollectionRun(inputs.local.db, runId, {
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
    await finishGtfsRtCollectionRun(inputs.local.db, runId, {
      endedAt: now().toISOString(),
      status: "failed",
      snapshotCount: snapshots.length,
      successCount,
      failureCount,
      error: truncateError(errorText(error)),
    });
    throw error;
  }
}

export default defineCommand({
  path: ["collect", "gtfs-rt"],
  summary: "Collect GTFS-RT snapshots from the MTA Bus Time feed into the local pipeline DB.",
  input: {
    options: dbOptions.extend({
      durationSeconds: arg.positiveInt().optional().describe("Collection duration in seconds"),
      durationHours: z.coerce
        .number()
        .positive()
        .optional()
        .describe("Collection duration in hours"),
      sampleSeconds: arg.positiveInt().default(30).describe("Sample period in seconds"),
      sampleCount: arg.positiveInt().optional().describe("Override sample count"),
      feedTypes: z
        .array(z.string())
        .default([])
        .describe("Feed types (vehicle_positions, trip_updates, alerts)"),
      runId: z.string().optional().describe("Stable run identifier"),
      rawDir: z.string().optional().describe("Directory for raw protobuf snapshots"),
    }),
  },
  output: z.object({
    runId: z.string(),
    status: z.string(),
    requestedFeedTypes: z.array(z.string()),
    sampleCount: z.number(),
    snapshotCount: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    rawDirectory: z.string(),
  }),
  async run({ input }) {
    const feedTypes =
      input.options.feedTypes.length === 0
        ? undefined
        : normalizeFeedTypes(input.options.feedTypes);
    const rawDir =
      input.options.rawDir === undefined ? undefined : fromCliPath(input.options.rawDir);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "collect.gtfs-rt",
      operation: "runCollectGtfsRt",
      spanAttributes: {
        runId: input.options.runId ?? null,
        durationSeconds: input.options.durationSeconds ?? null,
        durationHours: input.options.durationHours ?? null,
        sampleSeconds: input.options.sampleSeconds,
        sampleCount: input.options.sampleCount ?? null,
        feedTypeCount: feedTypes?.length ?? 0,
      },
      run: (local) =>
        runCollectGtfsRt({
          local,
          durationSeconds: input.options.durationSeconds,
          durationHours: input.options.durationHours,
          sampleSeconds: input.options.sampleSeconds,
          sampleCount: input.options.sampleCount,
          feedTypes,
          runId: input.options.runId,
          rawDir,
        }),
    });
  },
});

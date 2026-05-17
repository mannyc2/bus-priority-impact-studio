import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type GtfsRtFeedType,
  replaceGtfsRtCollectionRun,
  replaceGtfsRtFeedSnapshots,
} from "@bp/db/local";
import { type CliOption, parseCliOptions } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { createDbContext, type DbArgs } from "../../lib/route-job.js";

type ImportGtfsRtR2ManifestsArgs = DbArgs & {
  runId?: string;
  manifestRoot?: string;
  rawRoot?: string;
  sampleSeconds?: number;
};

type WorkerGtfsRtManifest = {
  feedType?: string;
  fetchedAt?: string;
  objectKey?: string;
  byteLength?: number;
  sha256?: string;
  sourceUrl?: string;
};

type ParsedWorkerGtfsRtManifest = {
  feedType: GtfsRtFeedType;
  fetchedAt: string;
  objectKey: string;
  byteLength: number;
  sha256: string;
  sourceUrl: string;
};

export type ImportGtfsRtR2ManifestsResult = {
  runId: string;
  manifestCount: number;
  snapshotCount: number;
  rawDirectory: string;
  startedAt: string;
  endedAt: string;
};

const feedSources = {
  vehicle_positions: "bus_time_gtfsrt_vehicle_positions",
  trip_updates: "bus_time_gtfsrt_trip_updates",
  alerts: "bus_time_gtfsrt_alerts",
} satisfies Record<GtfsRtFeedType, string>;

function requireString(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function normalizeFeedType(value: string | undefined): GtfsRtFeedType {
  if (value === "vehicle_positions" || value === "trip_updates" || value === "alerts") {
    return value;
  }

  throw new Error(`Unsupported GTFS-RT feed type in Worker manifest: ${value ?? "missing"}`);
}

function isJsonFile(path: string): boolean {
  return path.endsWith(".json");
}

async function listJsonFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(isJsonFile)
    .sort();
}

async function readWorkerManifest(path: string): Promise<ParsedWorkerGtfsRtManifest> {
  const parsed = JSON.parse(await Bun.file(path).text()) as WorkerGtfsRtManifest;
  if (parsed.objectKey === undefined || parsed.objectKey.length === 0) {
    throw new Error(`Worker GTFS-RT manifest is missing objectKey: ${path}`);
  }
  if (parsed.fetchedAt === undefined || Number.isNaN(Date.parse(parsed.fetchedAt))) {
    throw new Error(`Worker GTFS-RT manifest has invalid fetchedAt: ${path}`);
  }
  if (parsed.byteLength === undefined || parsed.byteLength < 0) {
    throw new Error(`Worker GTFS-RT manifest has invalid byteLength: ${path}`);
  }
  if (parsed.sha256 === undefined || parsed.sha256.length === 0) {
    throw new Error(`Worker GTFS-RT manifest is missing sha256: ${path}`);
  }

  return {
    feedType: normalizeFeedType(parsed.feedType),
    fetchedAt: parsed.fetchedAt,
    objectKey: parsed.objectKey,
    byteLength: parsed.byteLength,
    sha256: parsed.sha256,
    sourceUrl: parsed.sourceUrl ?? "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=REDACTED",
  };
}

export async function importGtfsRtR2Manifests(
  args: ImportGtfsRtR2ManifestsArgs,
): Promise<ImportGtfsRtR2ManifestsResult> {
  const options = createDbContext(args);
  const runId = requireString(args.runId, "--run-id");
  const manifestRoot = requireString(args.manifestRoot, "--manifest-root");
  const rawRoot = requireString(args.rawRoot, "--raw-root");
  const sampleSeconds = Math.max(1, Math.round(args.sampleSeconds ?? 30));
  const manifestPaths = await listJsonFiles(manifestRoot);
  const manifests = (await Promise.all(manifestPaths.map((path) => readWorkerManifest(path)))).sort(
    (left, right) => left.fetchedAt.localeCompare(right.fetchedAt),
  );

  if (manifests.length === 0) {
    throw new Error(`No Worker GTFS-RT manifest JSON files found under ${manifestRoot}.`);
  }

  const startedAt = manifests[0]?.fetchedAt ?? new Date(0).toISOString();
  const endedAt = manifests.at(-1)?.fetchedAt ?? startedAt;
  const rawDirectory = rawRoot;
  const snapshots = manifests.map((manifest, index) => ({
    runId,
    feedType: manifest.feedType,
    sampleIndex: index + 1,
    sourceId: feedSources[manifest.feedType],
    fetchedAt: manifest.fetchedAt,
    status: "ok" as const,
    httpStatus: 200,
    byteLength: manifest.byteLength,
    sha256: manifest.sha256,
    rawPath: join(rawRoot, manifest.objectKey),
    redactedUrl: manifest.sourceUrl,
    error: null,
  }));

  await withLocalPipelineDb(options.dbPath, async (local) => {
    await replaceGtfsRtCollectionRun(local.db, {
      runId,
      startedAt,
      endedAt,
      status: "completed",
      requestedDurationSeconds: Math.max(
        sampleSeconds,
        Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000) + sampleSeconds,
      ),
      sampleSeconds,
      requestedFeedTypes: [...new Set(snapshots.map((snapshot) => snapshot.feedType))].join(","),
      snapshotCount: snapshots.length,
      successCount: snapshots.length,
      failureCount: 0,
      rawDirectory,
      error: null,
    });
    await replaceGtfsRtFeedSnapshots(local.db, runId, snapshots);
  });

  return {
    runId,
    manifestCount: manifestPaths.length,
    snapshotCount: snapshots.length,
    rawDirectory,
    startedAt,
    endedAt,
  };
}

function parseCliArgs(args: string[]): ImportGtfsRtR2ManifestsArgs {
  return parseCliOptions(args, {} as ImportGtfsRtR2ManifestsArgs, [
    {
      flags: ["--run-id"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.runId = value;
        }
      },
    },
    {
      flags: ["--manifest-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.manifestRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--raw-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.rawRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--sample-seconds"],
      apply: (target, value) => {
        target.sampleSeconds = Number(value);
      },
    },
    {
      flags: ["--db"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.dbPath = fromCliPath(value);
        }
      },
    } satisfies CliOption<ImportGtfsRtR2ManifestsArgs>,
  ]);
}

export async function importGtfsRtR2ManifestsFromCli(
  args: string[],
): Promise<ImportGtfsRtR2ManifestsResult> {
  return importGtfsRtR2Manifests(parseCliArgs(args));
}

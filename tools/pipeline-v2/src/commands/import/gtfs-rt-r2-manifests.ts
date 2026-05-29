import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import {
  type GtfsRtFeedType,
  replaceGtfsRtCollectionRun,
  replaceGtfsRtFeedSnapshots,
} from "@bp/db/local";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

export type ImportGtfsRtR2ManifestsRunInputs = {
  local: OpenLocalPipelineDb;
  runId: string;
  manifestRoot: string;
  rawRoot: string;
  sampleSeconds?: number | undefined;
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

export async function runImportGtfsRtR2Manifests(
  inputs: ImportGtfsRtR2ManifestsRunInputs,
): Promise<ImportGtfsRtR2ManifestsResult> {
  const sampleSeconds = Math.max(1, Math.round(inputs.sampleSeconds ?? 30));
  const manifestPaths = await listJsonFiles(inputs.manifestRoot);
  const manifests = (
    await Promise.all(manifestPaths.map((path) => readWorkerManifest(path)))
  ).sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt));

  if (manifests.length === 0) {
    throw new Error(`No Worker GTFS-RT manifest JSON files found under ${inputs.manifestRoot}.`);
  }

  const startedAt = manifests[0]?.fetchedAt ?? new Date(0).toISOString();
  const endedAt = manifests.at(-1)?.fetchedAt ?? startedAt;
  const rawDirectory = inputs.rawRoot;
  const snapshots = manifests.map((manifest, index) => ({
    runId: inputs.runId,
    feedType: manifest.feedType,
    sampleIndex: index + 1,
    sourceId: feedSources[manifest.feedType],
    fetchedAt: manifest.fetchedAt,
    status: "ok" as const,
    httpStatus: 200,
    byteLength: manifest.byteLength,
    sha256: manifest.sha256,
    rawPath: join(inputs.rawRoot, manifest.objectKey),
    redactedUrl: manifest.sourceUrl,
    error: null,
  }));

  await replaceGtfsRtCollectionRun(inputs.local.db, {
    runId: inputs.runId,
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
  await replaceGtfsRtFeedSnapshots(inputs.local.db, inputs.runId, snapshots);

  return {
    runId: inputs.runId,
    manifestCount: manifestPaths.length,
    snapshotCount: snapshots.length,
    rawDirectory,
    startedAt,
    endedAt,
  };
}

export default defineCommand({
  path: ["import", "gtfs-rt-r2-manifests"],
  summary: "Import GTFS-RT collection state from Worker R2 manifest JSON files.",
  input: {
    options: dbOptions.extend({
      runId: z.string().min(1).describe("Collection run identifier"),
      manifestRoot: z.string().min(1).describe("Directory containing Worker manifest JSON"),
      rawRoot: z.string().min(1).describe("Directory containing mirrored raw protobufs"),
      sampleSeconds: arg.positiveInt().default(30).describe("Sample period in seconds"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    runId: z.string(),
    manifestCount: z.number(),
    snapshotCount: z.number(),
    rawDirectory: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
  }),
  async run({ ctx, input }) {
    return runImportGtfsRtR2Manifests({
      local: localDbFromCtx(ctx),
      runId: input.options.runId,
      manifestRoot: fromCliPath(input.options.manifestRoot),
      rawRoot: fromCliPath(input.options.rawRoot),
      sampleSeconds: input.options.sampleSeconds,
    });
  },
});

import {
  type GtfsRtFeedType,
  listGtfsRtFeedSnapshots,
  replaceGtfsRtParsedSnapshot,
} from "@bp/db/local";
import { z } from "@bp/pipeline-v2/cli/compat";
import { parseGtfsRealtimeFeed } from "@bp/sources/gtfs-realtime";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

export type IngestGtfsRtSnapshotsRunInputs = {
  local: OpenLocalPipelineDb;
  runId: string;
  parsedAt?: Date | undefined;
};

export type IngestGtfsRtSnapshotsResult = {
  runId: string;
  snapshotCount: number;
  parsedSnapshotCount: number;
  parseErrorCount: number;
  skippedSnapshotCount: number;
  vehiclePositionCount: number;
  tripUpdateCount: number;
  stopTimeUpdateCount: number;
  alertCount: number;
};

function truncateError(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497)}...`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runIngestGtfsRtSnapshots(
  inputs: IngestGtfsRtSnapshotsRunInputs,
): Promise<IngestGtfsRtSnapshotsResult> {
  const runId = inputs.runId;
  if (runId.length === 0) {
    throw new Error("Missing required argument: --run-id");
  }
  const parsedAt = (inputs.parsedAt ?? new Date()).toISOString();
  const snapshots = await listGtfsRtFeedSnapshots(inputs.local.db, runId);
  const result: IngestGtfsRtSnapshotsResult = {
    runId,
    snapshotCount: snapshots.length,
    parsedSnapshotCount: 0,
    parseErrorCount: 0,
    skippedSnapshotCount: 0,
    vehiclePositionCount: 0,
    tripUpdateCount: 0,
    stopTimeUpdateCount: 0,
    alertCount: 0,
  };

  for (const snapshot of snapshots) {
    if (snapshot.status !== "ok" || snapshot.rawPath === null) {
      result.skippedSnapshotCount += 1;
      continue;
    }
    try {
      const bytes = new Uint8Array(await Bun.file(snapshot.rawPath).arrayBuffer());
      const feed = parseGtfsRealtimeFeed(bytes);
      const feedType = snapshot.feedType as GtfsRtFeedType;
      await replaceGtfsRtParsedSnapshot(inputs.local.db, {
        parsedSnapshot: {
          runId,
          feedType,
          sampleIndex: snapshot.sampleIndex,
          parsedAt,
          status: "parsed",
          gtfsRealtimeVersion: feed.gtfsRealtimeVersion,
          feedTimestamp: feed.feedTimestamp,
          entityCount: feed.entityCount,
          vehiclePositionCount: feed.vehiclePositions.length,
          tripUpdateCount: feed.tripUpdates.length,
          stopTimeUpdateCount: feed.stopTimeUpdates.length,
          alertCount: feed.alerts.length,
          error: null,
        },
        vehiclePositions: feed.vehiclePositions.map((row) => ({
          ...row,
          runId,
          feedType,
          sampleIndex: snapshot.sampleIndex,
        })),
        tripUpdates: feed.tripUpdates.map((row) => ({
          ...row,
          runId,
          feedType,
          sampleIndex: snapshot.sampleIndex,
        })),
        stopTimeUpdates: feed.stopTimeUpdates.map((row) => ({
          ...row,
          runId,
          feedType,
          sampleIndex: snapshot.sampleIndex,
        })),
        alerts: feed.alerts.map((row) => ({
          ...row,
          runId,
          feedType,
          sampleIndex: snapshot.sampleIndex,
        })),
      });
      result.parsedSnapshotCount += 1;
      result.vehiclePositionCount += feed.vehiclePositions.length;
      result.tripUpdateCount += feed.tripUpdates.length;
      result.stopTimeUpdateCount += feed.stopTimeUpdates.length;
      result.alertCount += feed.alerts.length;
    } catch (error) {
      result.parseErrorCount += 1;
      await replaceGtfsRtParsedSnapshot(inputs.local.db, {
        parsedSnapshot: {
          runId,
          feedType: snapshot.feedType as GtfsRtFeedType,
          sampleIndex: snapshot.sampleIndex,
          parsedAt,
          status: "parse_error",
          gtfsRealtimeVersion: null,
          feedTimestamp: null,
          entityCount: 0,
          vehiclePositionCount: 0,
          tripUpdateCount: 0,
          stopTimeUpdateCount: 0,
          alertCount: 0,
          error: truncateError(errorText(error)),
        },
        vehiclePositions: [],
        tripUpdates: [],
        stopTimeUpdates: [],
        alerts: [],
      });
    }
  }
  return result;
}

export default defineIngestCommand({
  path: ["ingest", "gtfs-rt-snapshots"],
  summary: "Parse stored GTFS-RT raw snapshots into structured local pipeline rows.",
  options: dbOptions.extend({
    runId: z.string().min(1).describe("Collection run identifier to parse"),
    parsedAt: z.string().optional().describe("Override parsed-at timestamp (ISO)"),
  }),
  output: z.object({
    runId: z.string(),
    snapshotCount: z.number(),
    parsedSnapshotCount: z.number(),
    parseErrorCount: z.number(),
    skippedSnapshotCount: z.number(),
    vehiclePositionCount: z.number(),
    tripUpdateCount: z.number(),
    stopTimeUpdateCount: z.number(),
    alertCount: z.number(),
  }),
  operation: "runIngestGtfsRtSnapshots",
  spanAttributes: ({ runId, parsedAt }) => ({ runId, parsedAt: parsedAt ?? null }),
  runner: (local, { runId, parsedAt }) =>
    runIngestGtfsRtSnapshots({
      local,
      runId,
      parsedAt: parsedAt === undefined ? undefined : new Date(parsedAt),
    }),
});

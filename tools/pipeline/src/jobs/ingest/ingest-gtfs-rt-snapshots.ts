import {
  type GtfsRtFeedType,
  listGtfsRtFeedSnapshots,
  replaceGtfsRtParsedSnapshot,
} from "@bp/db/local";
import { parseGtfsRtFeed } from "@bp/sources";
import { type CliOption, parseCliOptions } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { createDbContext, type DbArgs } from "../../lib/route-job.js";

type IngestGtfsRtSnapshotsArgs = DbArgs & {
  runId?: string;
  parsedAt?: Date;
};

type IngestGtfsRtSnapshotsResult = {
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

function requireRunId(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error("Missing required argument: --run-id");
  }

  return value;
}

export async function ingestGtfsRtSnapshots(
  args: IngestGtfsRtSnapshotsArgs,
): Promise<IngestGtfsRtSnapshotsResult> {
  const options = createDbContext(args);
  const runId = requireRunId(args.runId);
  const parsedAt = (args.parsedAt ?? new Date()).toISOString();

  return withLocalPipelineDb(options.dbPath, async (local) => {
    const snapshots = await listGtfsRtFeedSnapshots(local.db, runId);
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
        const feed = parseGtfsRtFeed(bytes);
        const feedType = snapshot.feedType as GtfsRtFeedType;
        await replaceGtfsRtParsedSnapshot(local.db, {
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
        await replaceGtfsRtParsedSnapshot(local.db, {
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
  });
}

function parseCliArgs(args: string[]): IngestGtfsRtSnapshotsArgs {
  const output = parseCliOptions(args, {} as IngestGtfsRtSnapshotsArgs, [
    {
      flags: ["--run-id"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.runId = value;
        }
      },
    },
    {
      flags: ["--parsed-at"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.parsedAt = new Date(value);
        }
      },
    },
    {
      flags: ["--db"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.dbPath = fromCliPath(value);
        }
      },
    } satisfies CliOption<IngestGtfsRtSnapshotsArgs>,
  ]);

  return output;
}

export async function ingestGtfsRtSnapshotsFromCli(
  args: string[],
): Promise<IngestGtfsRtSnapshotsResult> {
  return ingestGtfsRtSnapshots(parseCliArgs(args));
}

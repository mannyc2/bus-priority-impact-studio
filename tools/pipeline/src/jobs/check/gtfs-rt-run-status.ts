import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type GtfsRtFeedType,
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listGtfsRtParsedSnapshots,
} from "@bp/db/local";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { parseDbCliArgs } from "../../lib/route-job.js";

type GtfsRtRunStatusArgs = {
  dbPath?: string;
  runId?: string;
  now?: Date;
};

type RawDirectoryStatus = {
  path: string;
  fileCount: number;
  protobufFileCount: number;
  totalByteLength: number;
  readable: boolean;
  error: string | null;
};

type GtfsRtRunStatusResult = {
  status: "found" | "missing";
  runId: string | null;
  collection: {
    status: string | null;
    startedAt: string | null;
    endedAt: string | null;
    requestedDurationSeconds: number;
    sampleSeconds: number;
    requestedFeedTypes: GtfsRtFeedType[];
    elapsedSeconds: number;
    expectedSnapshotRows: number;
    snapshotRows: number;
    successfulSnapshotRows: number;
    failedSnapshotRows: number;
    completionShare: number;
    rawDirectory: RawDirectoryStatus | null;
  };
  parsed: {
    parsedSnapshotRows: number;
    parsedVehiclePositionSnapshotRows: number;
    parseErrorRows: number;
  };
  readiness: {
    collectionComplete: boolean;
    snapshotsComplete: boolean;
    parsedComplete: boolean;
  };
  nextCommands: string[];
};

function parseRunId(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

function parseCliArgs(args: string[]): GtfsRtRunStatusArgs {
  return parseDbCliArgs(args, {} as GtfsRtRunStatusArgs, [
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        const runId = parseRunId(value);
        if (runId !== undefined) {
          output.runId = runId;
        }
      },
    },
  ]);
}

function requestedFeedTypes(value: string): GtfsRtFeedType[] {
  return value
    .split(",")
    .map((feedType) => feedType.trim())
    .filter((feedType): feedType is GtfsRtFeedType =>
      ["vehicle_positions", "trip_updates", "alerts"].includes(feedType),
    );
}

function secondsBetween(start: string | null, end: Date): number {
  if (start === null) {
    return 0;
  }

  const startedAt = Date.parse(start);
  if (Number.isNaN(startedAt)) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - startedAt) / 1000));
}

function elapsedSeconds(input: { startedAt: string | null; endedAt: string | null; now: Date }) {
  if (input.endedAt === null) {
    return secondsBetween(input.startedAt, input.now);
  }

  const startedAt = Date.parse(input.startedAt ?? "");
  const endedAt = Date.parse(input.endedAt);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) {
    return 0;
  }

  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}

function plannedSnapshotRows(input: {
  requestedDurationSeconds: number;
  sampleSeconds: number;
  feedTypeCount: number;
}): number {
  const sampleCount = Math.max(
    1,
    Math.ceil(input.requestedDurationSeconds / Math.max(1, input.sampleSeconds)),
  );

  return sampleCount * Math.max(1, input.feedTypeCount);
}

function roundShare(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}

async function rawDirectoryStatus(path: string | null): Promise<RawDirectoryStatus | null> {
  if (path === null || path.length === 0) {
    return null;
  }

  try {
    const entries = await readdir(path, { withFileTypes: true });
    let totalByteLength = 0;
    let fileCount = 0;
    let protobufFileCount = 0;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      fileCount += 1;
      if (entry.name.endsWith(".pb")) {
        protobufFileCount += 1;
      }
      totalByteLength += (await stat(join(path, entry.name))).size;
    }

    return {
      path,
      fileCount,
      protobufFileCount,
      totalByteLength,
      readable: true,
      error: null,
    };
  } catch (error) {
    return {
      path,
      fileCount: 0,
      protobufFileCount: 0,
      totalByteLength: 0,
      readable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function nextCommands(input: {
  runId: string;
  status: string;
  collectionComplete: boolean;
  snapshotsComplete: boolean;
  parsedComplete: boolean;
  successfulSnapshotRows: number;
  parsedSnapshotRows: number;
  startedAt: string | null;
}): string[] {
  const commands: string[] = [];
  const month = input.startedAt?.slice(0, 7);
  const [year, monthNumber] = month?.split("-") ?? [];

  if (!input.collectionComplete) {
    commands.push("Wait for collection status to become completed or completed_with_errors.");
    commands.push(`bun run gtfs-rt:run-status -- --run-id ${input.runId}`);
    return commands;
  }

  if (input.successfulSnapshotRows > 0 && input.parsedSnapshotRows < input.successfulSnapshotRows) {
    commands.push(`bun run ingest:gtfs-rt-snapshots -- --run-id ${input.runId}`);
    commands.push(`bun run build:observed-headways -- --run-id ${input.runId}`);
  } else if (input.parsedComplete) {
    commands.push(`bun run build:observed-headways -- --run-id ${input.runId}`);
  }

  if (year !== undefined && monthNumber !== undefined) {
    commands.push(
      `bun run route-observed-reliability -- --year ${Number(year)} --month ${Number(
        monthNumber,
      )} --run-id ${input.runId}`,
    );
    commands.push(
      `bun run gtfs-rt:preflight -- --year ${Number(year)} --month ${Number(
        monthNumber,
      )} --run-id ${input.runId}`,
    );
  }

  if (!input.snapshotsComplete && input.status === "completed") {
    commands.push(
      "Inspect collection snapshot counts; completed run has fewer snapshot rows than planned.",
    );
  }

  return commands;
}

export async function getGtfsRtRunStatus(
  args: GtfsRtRunStatusArgs = {},
): Promise<GtfsRtRunStatusResult> {
  const now = args.now ?? new Date();

  return withLocalPipelineDb(args.dbPath, async (local) => {
    const runs = await listGtfsRtCollectionRuns(local.db);
    const run =
      args.runId === undefined ? runs.at(-1) : runs.find((row) => row.runId === args.runId);

    if (run === undefined) {
      return {
        status: "missing",
        runId: args.runId ?? null,
        collection: {
          status: null,
          startedAt: null,
          endedAt: null,
          requestedDurationSeconds: 0,
          sampleSeconds: 0,
          requestedFeedTypes: [],
          elapsedSeconds: 0,
          expectedSnapshotRows: 0,
          snapshotRows: 0,
          successfulSnapshotRows: 0,
          failedSnapshotRows: 0,
          completionShare: 0,
          rawDirectory: null,
        },
        parsed: {
          parsedSnapshotRows: 0,
          parsedVehiclePositionSnapshotRows: 0,
          parseErrorRows: 0,
        },
        readiness: {
          collectionComplete: false,
          snapshotsComplete: false,
          parsedComplete: false,
        },
        nextCommands:
          args.runId === undefined
            ? ["Run collect:gtfs-rt with a stable --run-id."]
            : [`No collection run found for ${args.runId}.`],
      };
    }

    const feedTypes = requestedFeedTypes(run.requestedFeedTypes);
    const [snapshots, parsedSnapshots, rawDirectory] = await Promise.all([
      listGtfsRtFeedSnapshots(local.db, run.runId),
      listGtfsRtParsedSnapshots(local.db, run.runId),
      rawDirectoryStatus(run.rawDirectory),
    ]);
    const expectedSnapshotRows = plannedSnapshotRows({
      requestedDurationSeconds: run.requestedDurationSeconds,
      sampleSeconds: run.sampleSeconds,
      feedTypeCount: feedTypes.length,
    });
    const successfulSnapshotRows = snapshots.filter((row) => row.status === "ok").length;
    const failedSnapshotRows = snapshots.length - successfulSnapshotRows;
    const parsedSnapshotRows = parsedSnapshots.filter((row) => row.status === "parsed").length;
    const collectionComplete = ["completed", "completed_with_errors"].includes(run.status);
    const snapshotsComplete = snapshots.length >= expectedSnapshotRows;
    const parsedComplete =
      successfulSnapshotRows > 0 && parsedSnapshotRows >= successfulSnapshotRows;

    return {
      status: "found",
      runId: run.runId,
      collection: {
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        requestedDurationSeconds: run.requestedDurationSeconds,
        sampleSeconds: run.sampleSeconds,
        requestedFeedTypes: feedTypes,
        elapsedSeconds: elapsedSeconds({ startedAt: run.startedAt, endedAt: run.endedAt, now }),
        expectedSnapshotRows,
        snapshotRows: snapshots.length,
        successfulSnapshotRows,
        failedSnapshotRows,
        completionShare: roundShare(snapshots.length / expectedSnapshotRows),
        rawDirectory,
      },
      parsed: {
        parsedSnapshotRows,
        parsedVehiclePositionSnapshotRows: parsedSnapshots.filter(
          (row) => row.status === "parsed" && row.feedType === "vehicle_positions",
        ).length,
        parseErrorRows: parsedSnapshots.filter((row) => row.status === "parse_error").length,
      },
      readiness: {
        collectionComplete,
        snapshotsComplete,
        parsedComplete,
      },
      nextCommands: nextCommands({
        runId: run.runId,
        status: run.status,
        collectionComplete,
        snapshotsComplete,
        parsedComplete,
        successfulSnapshotRows,
        parsedSnapshotRows,
        startedAt: run.startedAt,
      }),
    };
  });
}

export async function getGtfsRtRunStatusFromCli(args: string[]): Promise<GtfsRtRunStatusResult> {
  return getGtfsRtRunStatus(parseCliArgs(args));
}

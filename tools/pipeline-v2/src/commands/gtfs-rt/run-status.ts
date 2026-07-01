import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand, z } from "@liche/core";
import {
  type GtfsRtFeedType,
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listGtfsRtParsedSnapshots,
} from "@bp/db/local";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

type RawDirectoryStatus = {
  path: string;
  fileCount: number;
  protobufFileCount: number;
  totalByteLength: number;
  readable: boolean;
  error: string | null;
};

export type GtfsRtRunStatusResult = {
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
  artifactPath?: string;
};

export type GtfsRtRunStatusInputs = {
  local: OpenLocalPipelineDb;
  runId?: string | undefined;
  now?: Date | undefined;
  artifactRoot?: string | undefined;
  outputPath?: string | undefined;
  dbPath?: string | undefined;
};

export function gtfsRtRunStatusArtifactPath(artifactRoot: string, runId: string): string {
  return join(artifactRoot, "gtfs-rt", "run-status", `${runId}.json`);
}

function requestedFeedTypes(value: string): GtfsRtFeedType[] {
  return value
    .split(",")
    .map((f) => f.trim())
    .filter((f): f is GtfsRtFeedType =>
      ["vehicle_positions", "trip_updates", "alerts"].includes(f),
    );
}

function secondsBetween(start: string | null, end: Date): number {
  if (start === null) return 0;
  const startedAt = Date.parse(start);
  if (Number.isNaN(startedAt)) return 0;
  return Math.max(0, Math.round((end.getTime() - startedAt) / 1000));
}

function elapsedSeconds(input: { startedAt: string | null; endedAt: string | null; now: Date }) {
  if (input.endedAt === null) return secondsBetween(input.startedAt, input.now);
  const startedAt = Date.parse(input.startedAt ?? "");
  const endedAt = Date.parse(input.endedAt);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) return 0;
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
  if (path === null || path.length === 0) return null;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    let totalByteLength = 0;
    let fileCount = 0;
    let protobufFileCount = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      fileCount += 1;
      if (entry.name.endsWith(".pb")) protobufFileCount += 1;
      totalByteLength += (await stat(join(path, entry.name))).size;
    }
    return { path, fileCount, protobufFileCount, totalByteLength, readable: true, error: null };
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
  dbPath: string | undefined;
  artifactRoot: string | undefined;
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
  const dbArg = input.dbPath === undefined ? "" : ` --db ${JSON.stringify(input.dbPath)}`;
  const artifactRootArg =
    input.artifactRoot === undefined
      ? ""
      : ` --artifact-root ${JSON.stringify(input.artifactRoot)}`;

  if (!input.collectionComplete) {
    commands.push("Wait for collection status to become completed or completed_with_errors.");
    commands.push(
      `bun run cli -- gtfs-rt run-status --run-id ${input.runId}${dbArg}${artifactRootArg}`,
    );
    return commands;
  }

  if (input.successfulSnapshotRows > 0 && input.parsedSnapshotRows < input.successfulSnapshotRows) {
    commands.push(`bun run cli -- ingest gtfs-rt-snapshots --run-id ${input.runId}${dbArg}`);
    commands.push(`bun run cli -- build observed-headways --run-id ${input.runId}${dbArg}`);
  } else if (input.parsedComplete) {
    commands.push(`bun run cli -- build observed-headways --run-id ${input.runId}${dbArg}`);
  }

  if (year !== undefined && monthNumber !== undefined) {
    commands.push(
      `bun run cli -- build route-observed-reliability --year ${Number(year)} --month ${Number(
        monthNumber,
      )} --run-id ${input.runId}${dbArg}`,
    );
    commands.push(
      `bun run cli -- gtfs-rt preflight --year ${Number(year)} --month ${Number(
        monthNumber,
      )} --run-id ${input.runId}${dbArg}`,
    );
  }

  if (!input.snapshotsComplete && input.status === "completed") {
    commands.push(
      "Inspect collection snapshot counts; completed run has fewer snapshot rows than planned.",
    );
  }

  return commands;
}

export async function runGtfsRtRunStatus(
  inputs: GtfsRtRunStatusInputs,
): Promise<GtfsRtRunStatusResult> {
  const now = inputs.now ?? new Date();
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const runs = await listGtfsRtCollectionRuns(inputs.local.db);
  const run =
    inputs.runId === undefined ? runs.at(-1) : runs.find((row) => row.runId === inputs.runId);

  if (run === undefined) {
    const missingArtifactPath =
      inputs.outputPath ??
      (inputs.runId === undefined
        ? undefined
        : gtfsRtRunStatusArtifactPath(artifactRoot, inputs.runId));
    const missingResult: GtfsRtRunStatusResult = {
      status: "missing",
      runId: inputs.runId ?? null,
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
        inputs.runId === undefined
          ? ["Run collect:gtfs-rt with a stable --run-id."]
          : [`No collection run found for ${inputs.runId}.`],
    };
    if (missingArtifactPath !== undefined) {
      missingResult.artifactPath = missingArtifactPath;
      await mkdir(dirname(missingArtifactPath), { recursive: true });
      await writeJson(missingArtifactPath, missingResult);
    }
    return missingResult;
  }

  const feedTypes = requestedFeedTypes(run.requestedFeedTypes);
  const [snapshots, parsedSnapshots, rawDirectory] = await Promise.all([
    listGtfsRtFeedSnapshots(inputs.local.db, run.runId),
    listGtfsRtParsedSnapshots(inputs.local.db, run.runId),
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
  const parsedComplete = successfulSnapshotRows > 0 && parsedSnapshotRows >= successfulSnapshotRows;

  const artifactPath = inputs.outputPath ?? gtfsRtRunStatusArtifactPath(artifactRoot, run.runId);
  const result: GtfsRtRunStatusResult = {
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
    readiness: { collectionComplete, snapshotsComplete, parsedComplete },
    nextCommands: nextCommands({
      dbPath: inputs.dbPath,
      artifactRoot: inputs.artifactRoot,
      runId: run.runId,
      status: run.status,
      collectionComplete,
      snapshotsComplete,
      parsedComplete,
      successfulSnapshotRows,
      parsedSnapshotRows,
      startedAt: run.startedAt,
    }),
    artifactPath,
  };

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, result);
  return result;
}

export default defineCommand({
  path: ["gtfs-rt", "run-status"],
  summary: "Report the readiness of a GTFS-RT collection run for downstream builds.",
  input: {
    options: dbOptions.extend({
      runId: z.string().optional().describe("Specific run ID (default: latest)"),
      artifactRoot: z.string().optional().describe("Artifact root directory"),
      output: z.string().optional().describe("Override artifact JSON path"),
    }),
  },
  output: z.object({
    status: z.enum(["found", "missing"]),
    runId: z.string().nullable(),
    collection: z.unknown(),
    parsed: z.unknown(),
    readiness: z.unknown(),
    nextCommands: z.array(z.string()),
    artifactPath: z.string().optional(),
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined ? undefined : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined ? undefined : fromCliPath(input.options.output);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "gtfs-rt.run-status",
      operation: "runGtfsRtRunStatus",
      spanAttributes: {
        runId: input.options.runId ?? null,
        writesArtifact: outputPath !== undefined,
      },
      run: (local) =>
        runGtfsRtRunStatus({
          local,
          runId: input.options.runId,
          artifactRoot,
          outputPath,
          dbPath: input.options.db,
        }),
    });
  },
});

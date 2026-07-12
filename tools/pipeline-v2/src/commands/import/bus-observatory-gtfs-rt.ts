import {
  type GtfsRtFeedType,
  replaceGtfsRtCollectionRun,
  replaceGtfsRtFeedSnapshots,
  replaceGtfsRtParsedSnapshot,
} from "@bp/db/local";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { normalizeGtfsRealtimeRouteId } from "@bp/sources/gtfs-realtime";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

type CanonicalBusObservatoryRow = {
  entityId: string;
  timestamp: number;
  sourceRouteId: string | null;
  routeId: string | null;
  tripId: string | null;
  startDate: string | null;
  startTime: string | null;
  directionId: number | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  bearing: number | null;
  speed: number | null;
  currentStopSequence: number | null;
  stopId: string | null;
  currentStatus: string | null;
};

type ImportQaStatus = "pass" | "warning" | "fail";

export type ImportBusObservatoryGtfsRtInputs = {
  local: OpenLocalPipelineDb;
  runId: string;
  year: number;
  month: number;
  canonicalCsv: string;
  sampleSeconds?: number | undefined;
  maxGapSeconds?: number | undefined;
};

export type ImportBusObservatoryGtfsRtResult = {
  runId: string;
  month: string;
  provenance: "third_party_recovered";
  sourceId: "bus_observatory_nyct_mta_bus_gtfsrt";
  csvPath: string;
  sampleCount: number;
  vehiclePositionCount: number;
  skippedRowCount: number;
  routeCount: number;
  vehicleCount: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  maxTimestampGapSeconds: number | null;
  qaStatus: ImportQaStatus;
  qaIssues: string[];
};

type CsvState = {
  headers: string[];
  lineNumber: number;
  currentTimestamp: number | null;
  currentSampleRows: CanonicalBusObservatoryRow[];
  sampleIndex: number;
  vehiclePositionCount: number;
  skippedRowCount: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  maxTimestampGapSeconds: number | null;
  routeIds: Set<string>;
  vehicleIds: Set<string>;
};

const feedType: GtfsRtFeedType = "vehicle_positions";
const sourceId = "bus_observatory_nyct_mta_bus_gtfsrt";

function monthStartUnix(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month - 1, 1) / 1000);
}

function nextMonthStartUnix(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month, 1) / 1000);
}

function parseCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      output.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  output.push(current);
  return output;
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: string | undefined): number | null {
  const text = textOrNull(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: string | undefined): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function requiredInteger(name: string, value: string | undefined): number {
  const parsed = integerOrNull(value);
  if (parsed === null) throw new Error(`Missing or invalid ${name}`);
  return parsed;
}

function get(row: Record<string, string>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

function rowFromValues(headers: string[], values: string[]): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((header, index) => {
    output[header] = values[index] ?? "";
  });
  return output;
}

function normalizeRouteId(row: Record<string, string>): {
  sourceRouteId: string | null;
  routeId: string | null;
} {
  const sourceRouteId = textOrNull(get(row, "source_route_id", "sourceRouteId", "route_id"));
  const explicitRouteId = textOrNull(get(row, "route_id_normalized", "routeId"));
  if (explicitRouteId !== null) return { sourceRouteId, routeId: explicitRouteId };
  if (sourceRouteId === null) return { sourceRouteId, routeId: null };
  return { sourceRouteId, routeId: normalizeGtfsRealtimeRouteId(sourceRouteId) };
}

function parseCanonicalRow(headers: string[], line: string): CanonicalBusObservatoryRow {
  const raw = rowFromValues(headers, parseCsvLine(line));
  const route = normalizeRouteId(raw);
  const entityId =
    textOrNull(get(raw, "entity_id", "entityId", "id")) ??
    textOrNull(get(raw, "vehicle_id", "vehicleId")) ??
    textOrNull(get(raw, "trip_id", "tripId"));
  if (entityId === null) throw new Error("Missing entity_id, vehicle_id, and trip_id");
  return {
    entityId,
    timestamp: requiredInteger("timestamp", get(raw, "timestamp", "vehicle_timestamp")),
    sourceRouteId: route.sourceRouteId,
    routeId: route.routeId,
    tripId: textOrNull(get(raw, "trip_id", "tripId")),
    startDate: textOrNull(get(raw, "start_date", "startDate")),
    startTime: textOrNull(get(raw, "start_time", "startTime")),
    directionId: integerOrNull(get(raw, "direction_id", "directionId")),
    vehicleId: textOrNull(get(raw, "vehicle_id", "vehicleId")),
    vehicleLabel: textOrNull(get(raw, "vehicle_label", "vehicleLabel")),
    latitude: numberOrNull(get(raw, "latitude", "lat")),
    longitude: numberOrNull(get(raw, "longitude", "lon")),
    bearing: numberOrNull(get(raw, "bearing")),
    speed: numberOrNull(get(raw, "speed")),
    currentStopSequence: integerOrNull(get(raw, "current_stop_sequence", "currentStopSequence")),
    stopId: textOrNull(get(raw, "stop_id", "stopId")),
    currentStatus: textOrNull(get(raw, "current_status", "currentStatus")),
  };
}

async function* readLines(path: string): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of Bun.file(path).stream()) {
    buffered += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex).replace(/\r$/, "");
      buffered = buffered.slice(newlineIndex + 1);
      yield line;
      newlineIndex = buffered.indexOf("\n");
    }
  }
  buffered += decoder.decode();
  if (buffered.length > 0) yield buffered.replace(/\r$/, "");
}

async function flushSample(
  local: OpenLocalPipelineDb,
  runId: string,
  parsedAt: string,
  sampleIndex: number,
  timestamp: number,
  rows: CanonicalBusObservatoryRow[],
): Promise<void> {
  await replaceGtfsRtParsedSnapshot(local.db, {
    parsedSnapshot: {
      runId,
      feedType,
      sampleIndex,
      parsedAt,
      status: "parsed",
      gtfsRealtimeVersion: null,
      feedTimestamp: timestamp,
      entityCount: rows.length,
      vehiclePositionCount: rows.length,
      tripUpdateCount: 0,
      stopTimeUpdateCount: 0,
      alertCount: 0,
      error: null,
    },
    vehiclePositions: rows.map((row) => ({
      runId,
      feedType,
      sampleIndex,
      entityId: row.entityId,
      entityDeleted: false,
      gtfsRealtimeVersion: null,
      feedTimestamp: timestamp,
      sourceRouteId: row.sourceRouteId,
      routeId: row.routeId,
      tripId: row.tripId,
      startDate: row.startDate,
      startTime: row.startTime,
      directionId: row.directionId,
      scheduleRelationship: null,
      vehicleId: row.vehicleId,
      vehicleLabel: row.vehicleLabel,
      vehicleLicensePlate: null,
      latitude: row.latitude,
      longitude: row.longitude,
      bearing: row.bearing,
      odometer: null,
      speed: row.speed,
      currentStopSequence: row.currentStopSequence,
      stopId: row.stopId,
      currentStatus: row.currentStatus,
      timestamp: row.timestamp,
      congestionLevel: null,
      occupancyStatus: null,
      occupancyPercentage: null,
    })),
    tripUpdates: [],
    stopTimeUpdates: [],
    alerts: [],
  });
}

function addQaIssue(issues: string[], condition: boolean, issue: string): void {
  if (condition) issues.push(issue);
}

function qaStatus(issues: string[]): ImportQaStatus {
  return issues.some((issue) => issue.startsWith("fail:"))
    ? "fail"
    : issues.length > 0
      ? "warning"
      : "pass";
}

export async function runImportBusObservatoryGtfsRt(
  inputs: ImportBusObservatoryGtfsRtInputs,
): Promise<ImportBusObservatoryGtfsRtResult> {
  const sampleSeconds = inputs.sampleSeconds ?? 30;
  const maxGapSeconds = inputs.maxGapSeconds ?? 300;
  const parsedAt = new Date().toISOString();
  const monthLabel = isoMonth(inputs.year, inputs.month);
  const { local, runId, year, month, canonicalCsv: csvPath } = inputs;

  const state: CsvState = {
    headers: [],
    lineNumber: 0,
    currentTimestamp: null,
    currentSampleRows: [],
    sampleIndex: 0,
    vehiclePositionCount: 0,
    skippedRowCount: 0,
    minTimestamp: null,
    maxTimestamp: null,
    maxTimestampGapSeconds: null,
    routeIds: new Set<string>(),
    vehicleIds: new Set<string>(),
  };

  await replaceGtfsRtCollectionRun(local.db, {
    runId,
    startedAt: new Date(monthStartUnix(year, month) * 1000).toISOString(),
    endedAt: new Date(nextMonthStartUnix(year, month) * 1000).toISOString(),
    status: "completed",
    requestedDurationSeconds: nextMonthStartUnix(year, month) - monthStartUnix(year, month),
    sampleSeconds,
    requestedFeedTypes: feedType,
    snapshotCount: 0,
    successCount: 0,
    failureCount: 0,
    rawDirectory: csvPath,
    error: null,
  });
  await replaceGtfsRtFeedSnapshots(local.db, runId, []);

  for await (const line of readLines(csvPath)) {
    state.lineNumber += 1;
    if (line.trim().length === 0) continue;
    if (state.headers.length === 0) {
      state.headers = parseCsvLine(line);
      continue;
    }
    try {
      const row = parseCanonicalRow(state.headers, line);
      if (state.currentTimestamp !== null && row.timestamp < state.currentTimestamp) {
        throw new Error("Rows must be sorted by ascending timestamp.");
      }
      if (state.currentTimestamp !== null && row.timestamp !== state.currentTimestamp) {
        state.sampleIndex += 1;
        await flushSample(
          local,
          runId,
          parsedAt,
          state.sampleIndex,
          state.currentTimestamp,
          state.currentSampleRows,
        );
        const gap = row.timestamp - state.currentTimestamp;
        state.maxTimestampGapSeconds = Math.max(state.maxTimestampGapSeconds ?? 0, gap);
        state.currentSampleRows = [];
      }
      state.currentTimestamp = row.timestamp;
      state.currentSampleRows.push(row);
      state.vehiclePositionCount += 1;
      state.minTimestamp =
        state.minTimestamp === null ? row.timestamp : Math.min(state.minTimestamp, row.timestamp);
      state.maxTimestamp =
        state.maxTimestamp === null ? row.timestamp : Math.max(state.maxTimestamp, row.timestamp);
      if (row.routeId !== null) state.routeIds.add(row.routeId);
      if (row.vehicleId !== null) state.vehicleIds.add(row.vehicleId);
    } catch {
      state.skippedRowCount += 1;
    }
  }

  if (state.currentTimestamp !== null && state.currentSampleRows.length > 0) {
    state.sampleIndex += 1;
    await flushSample(
      local,
      runId,
      parsedAt,
      state.sampleIndex,
      state.currentTimestamp,
      state.currentSampleRows,
    );
  }

  const snapshots = Array.from({ length: state.sampleIndex }, (_, index) => {
    const sampleIndex = index + 1;
    return {
      runId,
      feedType,
      sampleIndex,
      sourceId,
      fetchedAt: parsedAt,
      status: "ok" as const,
      httpStatus: 200,
      byteLength: null,
      sha256: null,
      rawPath: csvPath,
      redactedUrl:
        "https://busobservatory-lake.s3.amazonaws.com/feeds/nyct_mta_bus_gtfsrt/REDACTED.parquet",
      error: null,
    };
  });
  await replaceGtfsRtFeedSnapshots(local.db, runId, snapshots);
  await replaceGtfsRtCollectionRun(local.db, {
    runId,
    startedAt:
      state.minTimestamp === null
        ? new Date(monthStartUnix(year, month) * 1000).toISOString()
        : new Date(state.minTimestamp * 1000).toISOString(),
    endedAt:
      state.maxTimestamp === null
        ? new Date(nextMonthStartUnix(year, month) * 1000).toISOString()
        : new Date(state.maxTimestamp * 1000).toISOString(),
    status: state.skippedRowCount > 0 ? "completed_with_errors" : "completed",
    requestedDurationSeconds: nextMonthStartUnix(year, month) - monthStartUnix(year, month),
    sampleSeconds,
    requestedFeedTypes: feedType,
    snapshotCount: state.sampleIndex,
    successCount: state.sampleIndex,
    failureCount: 0,
    rawDirectory: csvPath,
    error: state.skippedRowCount > 0 ? `${state.skippedRowCount} row(s) skipped.` : null,
  });

  const issues: string[] = [];
  addQaIssue(issues, state.vehiclePositionCount === 0, "fail:no_vehicle_positions_imported");
  addQaIssue(issues, state.routeIds.size === 0, "fail:no_route_ids_imported");
  addQaIssue(issues, state.vehicleIds.size === 0, "warning:no_vehicle_ids_imported");
  addQaIssue(
    issues,
    state.minTimestamp !== null && state.minTimestamp > monthStartUnix(year, month) + maxGapSeconds,
    "warning:month_start_gap_exceeds_threshold",
  );
  addQaIssue(
    issues,
    state.maxTimestamp !== null &&
      state.maxTimestamp < nextMonthStartUnix(year, month) - maxGapSeconds,
    "warning:month_end_gap_exceeds_threshold",
  );
  addQaIssue(
    issues,
    state.maxTimestampGapSeconds !== null && state.maxTimestampGapSeconds > maxGapSeconds,
    "warning:max_timestamp_gap_exceeds_threshold",
  );

  return {
    runId,
    month: monthLabel,
    provenance: "third_party_recovered",
    sourceId,
    csvPath,
    sampleCount: state.sampleIndex,
    vehiclePositionCount: state.vehiclePositionCount,
    skippedRowCount: state.skippedRowCount,
    routeCount: state.routeIds.size,
    vehicleCount: state.vehicleIds.size,
    minTimestamp: state.minTimestamp,
    maxTimestamp: state.maxTimestamp,
    maxTimestampGapSeconds: state.maxTimestampGapSeconds,
    qaStatus: qaStatus(issues),
    qaIssues: issues,
  };
}

export default defineCommand({
  path: ["import", "bus-observatory-gtfs-rt"],
  summary:
    "Import a canonicalized Bus Observatory recovered GTFS-RT CSV into the local pipeline DB.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        runId: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "Stable run identifier",
        }),
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        canonicalCsv: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "Path to canonicalized vehicle-positions CSV",
        }),
        sampleSeconds: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(30)))
          .annotate({ description: "Sample period in seconds" }),
        maxGapSeconds: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(300)))
          .annotate({ description: "Maximum allowed inter-sample gap" }),
      },
    }),
  },
  output: Schema.Struct({
    runId: Schema.String,
    month: Schema.String,
    provenance: Schema.String,
    sourceId: Schema.String,
    csvPath: Schema.String,
    sampleCount: Schema.Number,
    vehiclePositionCount: Schema.Number,
    skippedRowCount: Schema.Number,
    routeCount: Schema.Number,
    vehicleCount: Schema.Number,
    minTimestamp: Schema.NullOr(Schema.Number),
    maxTimestamp: Schema.NullOr(Schema.Number),
    maxTimestampGapSeconds: Schema.NullOr(Schema.Number),
    qaStatus: Schema.Literals(["pass", "warning", "fail"]),
    qaIssues: Schema.Array(Schema.String),
  }),
  async run({ input }) {
    const canonicalCsv = fromCliPath(input.options.canonicalCsv);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "import.bus-observatory-gtfs-rt",
      operation: "runImportBusObservatoryGtfsRt",
      spanAttributes: {
        runId: input.options.runId,
        year: input.options.year,
        month: input.options.month,
        sampleSeconds: input.options.sampleSeconds,
        maxGapSeconds: input.options.maxGapSeconds,
      },
      run: (local) =>
        runImportBusObservatoryGtfsRt({
          local,
          runId: input.options.runId,
          year: input.options.year,
          month: input.options.month,
          canonicalCsv,
          sampleSeconds: input.options.sampleSeconds,
          maxGapSeconds: input.options.maxGapSeconds,
        }),
    });
  },
});

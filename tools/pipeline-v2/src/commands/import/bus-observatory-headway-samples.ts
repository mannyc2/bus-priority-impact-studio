import { Effect } from "effect";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

type SnapshotCsvRow = Record<string, string> & {
  sample_index?: string;
  timestamp?: string;
  entity_count?: string;
  vehicle_position_count?: string;
  source_route_id?: string;
  route_id?: string;
  direction_id?: string;
  vehicle_id?: string;
  stop_id?: string;
  latitude?: string;
  longitude?: string;
};

type HeadwaySampleCsvRow = Record<string, string> & {
  sample_rank?: string;
  route_id?: string;
  source_route_id?: string;
  direction_id?: string;
  stop_id?: string;
  previous_vehicle_key?: string;
  vehicle_key?: string;
  previous_observed_timestamp?: string;
  observed_timestamp?: string;
  headway_seconds?: string;
  headway_minutes?: string;
};

export type ImportBusObservatoryHeadwaySamplesInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  runId: string;
  headwaySamplesCsv: string;
  snapshotsCsv: string;
  sampleSeconds?: number | undefined;
  batchSize?: number | undefined;
};

export type ImportBusObservatoryHeadwaySamplesResult = {
  month: string;
  runId: string;
  provenance: "third_party_recovered";
  headwaySamplesCsv: string;
  snapshotsCsv: string;
  snapshotCount: number;
  parsedSnapshotCount: number;
  vehiclePositionEvidenceCount: number;
  headwaySampleCount: number;
  routeCount: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
};

const feedType = "vehicle_positions";
const sourceId = "bus_observatory_nyct_mta_bus_gtfsrt";
const defaultBatchSize = 1000;

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

function rowFromValues<T extends Record<string, string>>(headers: string[], values: string[]): T {
  const output: Record<string, string> = {};
  headers.forEach((header, index) => {
    output[header] = values[index] ?? "";
  });
  return output as T;
}

async function* readCsvRows<T extends Record<string, string>>(path: string): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  let buffered = "";
  let headers: string[] | null = null;

  for await (const chunk of Bun.file(path).stream()) {
    buffered += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex).replace(/\r$/, "");
      buffered = buffered.slice(newlineIndex + 1);
      if (line.trim().length > 0) {
        if (headers === null) headers = parseCsvLine(line);
        else yield rowFromValues<T>(headers, parseCsvLine(line));
      }
      newlineIndex = buffered.indexOf("\n");
    }
  }
  buffered += decoder.decode();
  if (buffered.trim().length > 0) {
    if (headers === null) headers = parseCsvLine(buffered.replace(/\r$/, ""));
    else yield rowFromValues<T>(headers, parseCsvLine(buffered.replace(/\r$/, "")));
  }
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function requiredText(name: string, value: string | undefined): string {
  const parsed = textOrNull(value);
  if (parsed === null) throw new Error(`Missing ${name}`);
  return parsed;
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

function iso(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString();
}

function monthStartUnix(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month - 1, 1) / 1000);
}

function nextMonthStartUnix(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month, 1) / 1000);
}

function clearRunRows(sqlite: { exec: (sql: string) => void }, runId: string): void {
  const escaped = runId.replaceAll("'", "''");
  sqlite.exec(`
    delete from local_observed_headway_sample where run_id = '${escaped}';
    delete from local_observed_vehicle_stop_event where run_id = '${escaped}';
    delete from local_gtfs_rt_vehicle_position where run_id = '${escaped}';
    delete from local_gtfs_rt_trip_update where run_id = '${escaped}';
    delete from local_gtfs_rt_stop_time_update where run_id = '${escaped}';
    delete from local_gtfs_rt_alert where run_id = '${escaped}';
    delete from local_gtfs_rt_parsed_snapshot where run_id = '${escaped}';
    delete from local_gtfs_rt_feed_snapshot where run_id = '${escaped}';
    delete from local_gtfs_rt_collection_run where run_id = '${escaped}';
  `);
}

export async function runImportBusObservatoryHeadwaySamples(
  inputs: ImportBusObservatoryHeadwaySamplesInputs,
): Promise<ImportBusObservatoryHeadwaySamplesResult> {
  const { local } = inputs;
  const monthKey = isoMonth(inputs.year, inputs.month);
  const sampleSeconds = Math.max(1, Math.round(inputs.sampleSeconds ?? 30));
  const batchSize = Math.max(1, Math.round(inputs.batchSize ?? defaultBatchSize));
  const startedAt = monthStartUnix(inputs.year, inputs.month);
  const endedAt = nextMonthStartUnix(inputs.year, inputs.month);

  clearRunRows(local.sqlite, inputs.runId);

  const collectionRunInsert = local.sqlite.prepare(`
    insert into local_gtfs_rt_collection_run (
      run_id, started_at, ended_at, status, requested_duration_seconds, sample_seconds,
      requested_feed_types, snapshot_count, success_count, failure_count, raw_directory, error
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const feedSnapshotInsert = local.sqlite.prepare(`
    insert into local_gtfs_rt_feed_snapshot (
      run_id, feed_type, sample_index, source_id, fetched_at, status, http_status,
      byte_length, sha256, raw_path, redacted_url, error
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const parsedSnapshotInsert = local.sqlite.prepare(`
    insert into local_gtfs_rt_parsed_snapshot (
      run_id, feed_type, sample_index, parsed_at, status, gtfs_realtime_version,
      feed_timestamp, entity_count, vehicle_position_count, trip_update_count,
      stop_time_update_count, alert_count, error
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const vehiclePositionInsert = local.sqlite.prepare(`
    insert into local_gtfs_rt_vehicle_position (
      run_id, feed_type, sample_index, entity_id, entity_deleted, gtfs_realtime_version,
      feed_timestamp, source_route_id, route_id, trip_id, start_date, start_time,
      direction_id, schedule_relationship, vehicle_id, vehicle_label, vehicle_license_plate,
      latitude, longitude, bearing, odometer, speed, current_stop_sequence, stop_id,
      current_status, timestamp, congestion_level, occupancy_status, occupancy_percentage
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const headwaySampleInsert = local.sqlite.prepare(`
    insert into local_observed_headway_sample (
      run_id, sample_rank, route_id, source_route_id, direction_id, stop_id,
      previous_vehicle_key, vehicle_key, previous_observed_timestamp, observed_timestamp,
      headway_seconds, headway_minutes
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const parsedAt = new Date().toISOString();
  let snapshotCount = 0;
  let vehiclePositionEvidenceCount = 0;
  let headwaySampleCount = 0;
  let minTimestamp: number | null = null;
  let maxTimestamp: number | null = null;
  const routeIds = new Set<string>();

  collectionRunInsert.run(
    inputs.runId,
    iso(startedAt),
    iso(endedAt),
    "completed",
    endedAt - startedAt,
    sampleSeconds,
    feedType,
    0,
    0,
    0,
    inputs.headwaySamplesCsv,
    null,
  );

  let snapshotBatch = 0;
  local.sqlite.exec("begin");
  for await (const row of readCsvRows<SnapshotCsvRow>(inputs.snapshotsCsv)) {
    const sampleIndex = requiredInteger("sample_index", row.sample_index);
    const timestamp = requiredInteger("timestamp", row.timestamp);
    const entityCount = Math.max(1, requiredInteger("entity_count", row.entity_count));
    const vehiclePositionCount = Math.max(
      1,
      requiredInteger("vehicle_position_count", row.vehicle_position_count),
    );
    const routeId = textOrNull(row.route_id);
    const vehicleId = textOrNull(row.vehicle_id) ?? `snapshot-${sampleIndex}`;
    const fetchedAt = iso(timestamp);

    feedSnapshotInsert.run(
      inputs.runId,
      feedType,
      sampleIndex,
      sourceId,
      fetchedAt,
      "ok",
      200,
      null,
      null,
      inputs.snapshotsCsv,
      "https://busobservatory-lake.s3.amazonaws.com/feeds/nyct_mta_bus_gtfsrt/REDACTED.parquet",
      null,
    );
    parsedSnapshotInsert.run(
      inputs.runId,
      feedType,
      sampleIndex,
      parsedAt,
      "parsed",
      null,
      timestamp,
      entityCount,
      vehiclePositionCount,
      0,
      0,
      0,
      null,
    );
    vehiclePositionInsert.run(
      inputs.runId,
      feedType,
      sampleIndex,
      `snapshot-${sampleIndex}`,
      0,
      null,
      timestamp,
      textOrNull(row.source_route_id),
      routeId,
      null,
      null,
      null,
      integerOrNull(row.direction_id),
      null,
      vehicleId,
      null,
      null,
      numberOrNull(row.latitude),
      numberOrNull(row.longitude),
      null,
      null,
      null,
      null,
      textOrNull(row.stop_id),
      null,
      timestamp,
      null,
      null,
      null,
    );

    snapshotCount += 1;
    vehiclePositionEvidenceCount += 1;
    minTimestamp = minTimestamp === null ? timestamp : Math.min(minTimestamp, timestamp);
    maxTimestamp = maxTimestamp === null ? timestamp : Math.max(maxTimestamp, timestamp);
    if (routeId !== null) routeIds.add(routeId);
    snapshotBatch += 1;
    if (snapshotBatch >= batchSize) {
      local.sqlite.exec("commit");
      local.sqlite.exec("begin");
      snapshotBatch = 0;
    }
  }
  local.sqlite.exec("commit");

  let sampleBatch = 0;
  local.sqlite.exec("begin");
  for await (const row of readCsvRows<HeadwaySampleCsvRow>(inputs.headwaySamplesCsv)) {
    const sampleRank = integerOrNull(row.sample_rank) ?? headwaySampleCount + 1;
    const routeId = requiredText("route_id", row.route_id);
    const observedTimestamp = requiredInteger("observed_timestamp", row.observed_timestamp);
    headwaySampleInsert.run(
      inputs.runId,
      sampleRank,
      routeId,
      textOrNull(row.source_route_id),
      integerOrNull(row.direction_id),
      requiredText("stop_id", row.stop_id),
      requiredText("previous_vehicle_key", row.previous_vehicle_key),
      requiredText("vehicle_key", row.vehicle_key),
      requiredInteger("previous_observed_timestamp", row.previous_observed_timestamp),
      observedTimestamp,
      requiredInteger("headway_seconds", row.headway_seconds),
      numberOrNull(row.headway_minutes) ??
        requiredInteger("headway_seconds", row.headway_seconds) / 60,
    );
    headwaySampleCount += 1;
    routeIds.add(routeId);
    minTimestamp =
      minTimestamp === null ? observedTimestamp : Math.min(minTimestamp, observedTimestamp);
    maxTimestamp =
      maxTimestamp === null ? observedTimestamp : Math.max(maxTimestamp, observedTimestamp);
    sampleBatch += 1;
    if (sampleBatch >= batchSize) {
      local.sqlite.exec("commit");
      local.sqlite.exec("begin");
      sampleBatch = 0;
    }
  }
  local.sqlite.exec("commit");

  local.sqlite
    .prepare(
      `update local_gtfs_rt_collection_run
       set started_at = ?, ended_at = ?, snapshot_count = ?, success_count = ?, failure_count = ?, error = ?
       where run_id = ?`,
    )
    .run(
      iso(minTimestamp ?? startedAt),
      iso(maxTimestamp ?? endedAt),
      snapshotCount,
      snapshotCount,
      0,
      null,
      inputs.runId,
    );

  return {
    month: monthKey,
    runId: inputs.runId,
    provenance: "third_party_recovered",
    headwaySamplesCsv: inputs.headwaySamplesCsv,
    snapshotsCsv: inputs.snapshotsCsv,
    snapshotCount,
    parsedSnapshotCount: snapshotCount,
    vehiclePositionEvidenceCount,
    headwaySampleCount,
    routeCount: routeIds.size,
    minTimestamp,
    maxTimestamp,
  };
}

export default defineCommand({
  path: ["import", "bus-observatory-headway-samples"],
  summary:
    "Import recovered Bus Observatory headway samples + snapshot evidence CSVs into the local pipeline DB.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        runId: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "Stable run identifier",
        }),
        headwaySamplesCsv: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "Path to headway-samples CSV",
        }),
        snapshotsCsv: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "Path to snapshot evidence CSV",
        }),
        sampleSeconds: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(30)))
          .annotate({ description: "Sample period in seconds" }),
        batchSize: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultBatchSize)))
          .annotate({ description: "SQLite insert batch size" }),
      },
    }),
  },
  output: Schema.Struct({
    month: Schema.String,
    runId: Schema.String,
    provenance: Schema.String,
    headwaySamplesCsv: Schema.String,
    snapshotsCsv: Schema.String,
    snapshotCount: Schema.Number,
    parsedSnapshotCount: Schema.Number,
    vehiclePositionEvidenceCount: Schema.Number,
    headwaySampleCount: Schema.Number,
    routeCount: Schema.Number,
    minTimestamp: Schema.NullOr(Schema.Number),
    maxTimestamp: Schema.NullOr(Schema.Number),
  }),
  async run({ input }) {
    const headwaySamplesCsv = fromCliPath(input.options.headwaySamplesCsv);
    const snapshotsCsv = fromCliPath(input.options.snapshotsCsv);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "import.bus-observatory-headway-samples",
      operation: "runImportBusObservatoryHeadwaySamples",
      spanAttributes: {
        runId: input.options.runId,
        year: input.options.year,
        month: input.options.month,
        sampleSeconds: input.options.sampleSeconds,
        batchSize: input.options.batchSize,
      },
      run: (local) =>
        runImportBusObservatoryHeadwaySamples({
          local,
          year: input.options.year,
          month: input.options.month,
          runId: input.options.runId,
          headwaySamplesCsv,
          snapshotsCsv,
          sampleSeconds: input.options.sampleSeconds,
          batchSize: input.options.batchSize,
        }),
    });
  },
});

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { dbOptions } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const defaultGtfsRoot = "data/raw/gtfs-static/current/20260531T010822Z";

const defaultBundles = [
  { sourceId: "bus_gtfs_bronx", filename: "bus_gtfs_bronx.zip" },
  { sourceId: "bus_gtfs_brooklyn", filename: "bus_gtfs_brooklyn.zip" },
  { sourceId: "bus_gtfs_manhattan", filename: "bus_gtfs_manhattan.zip" },
  { sourceId: "bus_gtfs_queens", filename: "bus_gtfs_queens.zip" },
  { sourceId: "bus_gtfs_staten_island", filename: "bus_gtfs_staten_island.zip" },
  { sourceId: "bus_gtfs_mta_bus_company", filename: "bus_gtfs_mta_bus_company.zip" },
];

type GtfsBundleInput = {
  sourceId: string;
  zipPath: string;
};

export type GtfsStaticIngestInputs = {
  sqlite: Database;
  runId: string;
  bundles: readonly GtfsBundleInput[];
  ingestedAt: string;
  entryReader?: ((zipPath: string, entryName: string) => Promise<string>) | undefined;
};

export type GtfsStaticBundleIngestResult = {
  sourceId: string;
  zipPath: string;
  routeCount: number;
  tripCount: number;
  stopCount: number;
  stopTimeCount: number;
  calendarCount: number;
  calendarDateCount: number;
};

export type GtfsStaticIngestResult = {
  runId: string;
  bundleCount: number;
  routeCount: number;
  tripCount: number;
  stopCount: number;
  stopTimeCount: number;
  calendarCount: number;
  calendarDateCount: number;
  bundles: GtfsStaticBundleIngestResult[];
};

type CsvRecord = Record<string, string>;

function textOrNull(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value: string | undefined): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function parseGtfsCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const header = rows.shift();
  if (header === undefined) return [];
  return rows
    .filter((values) => values.some((value) => value.length > 0))
    .map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

async function readZipEntryText(zipPath: string, entryName: string): Promise<string> {
  const proc = Bun.spawn(["unzip", "-p", zipPath, entryName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(
      `Failed to read ${entryName} from ${zipPath} with unzip exit ${exitCode}: ${stderr.trim()}`,
    );
  }
  return stdout;
}

function ensureGtfsStaticTables(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_gtfs_static_bundle (
      run_id text NOT NULL,
      source_id text NOT NULL,
      zip_path text NOT NULL,
      ingested_at text NOT NULL,
      route_count integer NOT NULL,
      trip_count integer NOT NULL,
      stop_count integer NOT NULL,
      stop_time_count integer NOT NULL,
      calendar_count integer NOT NULL,
      calendar_date_count integer NOT NULL,
      PRIMARY KEY (run_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS local_gtfs_static_route (
      run_id text NOT NULL,
      source_id text NOT NULL,
      route_id text NOT NULL,
      route_short_name text,
      route_long_name text,
      route_desc text,
      route_type text,
      PRIMARY KEY (run_id, source_id, route_id)
    );

    CREATE TABLE IF NOT EXISTS local_gtfs_static_trip (
      run_id text NOT NULL,
      source_id text NOT NULL,
      trip_id text NOT NULL,
      route_id text NOT NULL,
      service_id text NOT NULL,
      trip_headsign text,
      direction_id text,
      block_id text,
      shape_id text,
      PRIMARY KEY (run_id, source_id, trip_id)
    );
    CREATE INDEX IF NOT EXISTS local_gtfs_static_trip_route_idx
      ON local_gtfs_static_trip (run_id, route_id, source_id, service_id);

    CREATE TABLE IF NOT EXISTS local_gtfs_static_stop (
      run_id text NOT NULL,
      source_id text NOT NULL,
      stop_id text NOT NULL,
      stop_name text,
      stop_lat real,
      stop_lon real,
      PRIMARY KEY (run_id, source_id, stop_id)
    );

    CREATE TABLE IF NOT EXISTS local_gtfs_static_calendar (
      run_id text NOT NULL,
      source_id text NOT NULL,
      service_id text NOT NULL,
      monday integer NOT NULL,
      tuesday integer NOT NULL,
      wednesday integer NOT NULL,
      thursday integer NOT NULL,
      friday integer NOT NULL,
      saturday integer NOT NULL,
      sunday integer NOT NULL,
      start_date text NOT NULL,
      end_date text NOT NULL,
      PRIMARY KEY (run_id, source_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS local_gtfs_static_calendar_date (
      run_id text NOT NULL,
      source_id text NOT NULL,
      service_id text NOT NULL,
      service_date text NOT NULL,
      exception_type integer NOT NULL,
      PRIMARY KEY (run_id, source_id, service_id, service_date)
    );
    CREATE INDEX IF NOT EXISTS local_gtfs_static_calendar_date_service_idx
      ON local_gtfs_static_calendar_date (run_id, source_id, service_id, service_date);

    CREATE TABLE IF NOT EXISTS local_gtfs_static_stop_time (
      run_id text NOT NULL,
      source_id text NOT NULL,
      trip_id text NOT NULL,
      route_id text NOT NULL,
      service_id text NOT NULL,
      direction_id text,
      stop_sequence integer NOT NULL,
      stop_id text NOT NULL,
      arrival_time text NOT NULL,
      departure_time text,
      stop_headsign text,
      pickup_type integer,
      drop_off_type integer,
      timepoint integer,
      PRIMARY KEY (run_id, source_id, trip_id, stop_sequence)
    );
    CREATE INDEX IF NOT EXISTS local_gtfs_static_stop_time_route_idx
      ON local_gtfs_static_stop_time (run_id, route_id, source_id, service_id, direction_id, stop_id);
    CREATE INDEX IF NOT EXISTS local_gtfs_static_stop_time_stop_idx
      ON local_gtfs_static_stop_time (run_id, source_id, stop_id);
  `);
}

function deleteBundleRows(sqlite: Database, runId: string, sourceId: string): void {
  for (const table of [
    "local_gtfs_static_stop_time",
    "local_gtfs_static_calendar_date",
    "local_gtfs_static_calendar",
    "local_gtfs_static_stop",
    "local_gtfs_static_trip",
    "local_gtfs_static_route",
    "local_gtfs_static_bundle",
  ]) {
    sqlite.prepare(`DELETE FROM ${table} WHERE run_id = ? AND source_id = ?`).run(runId, sourceId);
  }
}

async function readBundleRecords(input: {
  zipPath: string;
  entryReader: (zipPath: string, entryName: string) => Promise<string>;
}): Promise<Record<string, CsvRecord[]>> {
  const output: Record<string, CsvRecord[]> = {};
  for (const entry of [
    "routes.txt",
    "trips.txt",
    "stops.txt",
    "stop_times.txt",
    "calendar.txt",
    "calendar_dates.txt",
  ]) {
    output[entry] = parseGtfsCsv(await input.entryReader(input.zipPath, entry));
  }
  return output;
}

async function ingestBundle(input: {
  sqlite: Database;
  runId: string;
  sourceId: string;
  zipPath: string;
  ingestedAt: string;
  entryReader: (zipPath: string, entryName: string) => Promise<string>;
}): Promise<GtfsStaticBundleIngestResult> {
  const records = await readBundleRecords({
    zipPath: input.zipPath,
    entryReader: input.entryReader,
  });
  const routes = records["routes.txt"] ?? [];
  const trips = records["trips.txt"] ?? [];
  const stops = records["stops.txt"] ?? [];
  const stopTimes = records["stop_times.txt"] ?? [];
  const calendars = records["calendar.txt"] ?? [];
  const calendarDates = records["calendar_dates.txt"] ?? [];

  const tripById = new Map(
    trips.flatMap((trip) => {
      const tripId = textOrNull(trip["trip_id"]);
      const routeId = textOrNull(trip["route_id"]);
      const serviceId = textOrNull(trip["service_id"]);
      if (tripId === null || routeId === null || serviceId === null) return [];
      return [
        [tripId, { routeId, serviceId, directionId: textOrNull(trip["direction_id"]) }] as const,
      ];
    }),
  );

  const insertBundle = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_bundle (
      run_id, source_id, zip_path, ingested_at, route_count, trip_count, stop_count,
      stop_time_count, calendar_count, calendar_date_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRoute = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_route (
      run_id, source_id, route_id, route_short_name, route_long_name, route_desc, route_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTrip = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_trip (
      run_id, source_id, trip_id, route_id, service_id, trip_headsign, direction_id, block_id, shape_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertStop = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_stop (
      run_id, source_id, stop_id, stop_name, stop_lat, stop_lon
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCalendar = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_calendar (
      run_id, source_id, service_id, monday, tuesday, wednesday, thursday, friday,
      saturday, sunday, start_date, end_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCalendarDate = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_calendar_date (
      run_id, source_id, service_id, service_date, exception_type
    )
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertStopTime = input.sqlite.prepare(`
    INSERT INTO local_gtfs_static_stop_time (
      run_id, source_id, trip_id, route_id, service_id, direction_id, stop_sequence,
      stop_id, arrival_time, departure_time, stop_headsign, pickup_type, drop_off_type, timepoint
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let routeCount = 0;
  let tripCount = 0;
  let stopCount = 0;
  let stopTimeCount = 0;
  let calendarCount = 0;
  let calendarDateCount = 0;

  input.sqlite.transaction(() => {
    deleteBundleRows(input.sqlite, input.runId, input.sourceId);

    for (const route of routes) {
      const routeId = textOrNull(route["route_id"]);
      if (routeId === null) continue;
      insertRoute.run(
        input.runId,
        input.sourceId,
        routeId,
        textOrNull(route["route_short_name"]),
        textOrNull(route["route_long_name"]),
        textOrNull(route["route_desc"]),
        textOrNull(route["route_type"]),
      );
      routeCount += 1;
    }

    for (const trip of trips) {
      const tripId = textOrNull(trip["trip_id"]);
      const routeId = textOrNull(trip["route_id"]);
      const serviceId = textOrNull(trip["service_id"]);
      if (tripId === null || routeId === null || serviceId === null) continue;
      insertTrip.run(
        input.runId,
        input.sourceId,
        tripId,
        routeId,
        serviceId,
        textOrNull(trip["trip_headsign"]),
        textOrNull(trip["direction_id"]),
        textOrNull(trip["block_id"]),
        textOrNull(trip["shape_id"]),
      );
      tripCount += 1;
    }

    for (const stop of stops) {
      const stopId = textOrNull(stop["stop_id"]);
      if (stopId === null) continue;
      insertStop.run(
        input.runId,
        input.sourceId,
        stopId,
        textOrNull(stop["stop_name"]),
        numberOrNull(stop["stop_lat"]),
        numberOrNull(stop["stop_lon"]),
      );
      stopCount += 1;
    }

    for (const calendar of calendars) {
      const serviceId = textOrNull(calendar["service_id"]);
      const startDate = textOrNull(calendar["start_date"]);
      const endDate = textOrNull(calendar["end_date"]);
      if (serviceId === null || startDate === null || endDate === null) continue;
      insertCalendar.run(
        input.runId,
        input.sourceId,
        serviceId,
        intOrNull(calendar["monday"]) ?? 0,
        intOrNull(calendar["tuesday"]) ?? 0,
        intOrNull(calendar["wednesday"]) ?? 0,
        intOrNull(calendar["thursday"]) ?? 0,
        intOrNull(calendar["friday"]) ?? 0,
        intOrNull(calendar["saturday"]) ?? 0,
        intOrNull(calendar["sunday"]) ?? 0,
        startDate,
        endDate,
      );
      calendarCount += 1;
    }

    for (const calendarDate of calendarDates) {
      const serviceId = textOrNull(calendarDate["service_id"]);
      const serviceDate = textOrNull(calendarDate["date"]);
      const exceptionType = intOrNull(calendarDate["exception_type"]);
      if (serviceId === null || serviceDate === null || exceptionType === null) continue;
      insertCalendarDate.run(input.runId, input.sourceId, serviceId, serviceDate, exceptionType);
      calendarDateCount += 1;
    }

    for (const stopTime of stopTimes) {
      const tripId = textOrNull(stopTime["trip_id"]);
      const stopId = textOrNull(stopTime["stop_id"]);
      const stopSequence = intOrNull(stopTime["stop_sequence"]);
      const arrivalTime = textOrNull(stopTime["arrival_time"]);
      if (tripId === null || stopId === null || stopSequence === null || arrivalTime === null) {
        continue;
      }
      const trip = tripById.get(tripId);
      if (trip === undefined) continue;
      insertStopTime.run(
        input.runId,
        input.sourceId,
        tripId,
        trip.routeId,
        trip.serviceId,
        trip.directionId,
        stopSequence,
        stopId,
        arrivalTime,
        textOrNull(stopTime["departure_time"]),
        textOrNull(stopTime["stop_headsign"]),
        intOrNull(stopTime["pickup_type"]),
        intOrNull(stopTime["drop_off_type"]),
        intOrNull(stopTime["timepoint"]),
      );
      stopTimeCount += 1;
    }

    insertBundle.run(
      input.runId,
      input.sourceId,
      input.zipPath,
      input.ingestedAt,
      routeCount,
      tripCount,
      stopCount,
      stopTimeCount,
      calendarCount,
      calendarDateCount,
    );
  })();

  return {
    sourceId: input.sourceId,
    zipPath: input.zipPath,
    routeCount,
    tripCount,
    stopCount,
    stopTimeCount,
    calendarCount,
    calendarDateCount,
  };
}

export async function runGtfsStaticIngest(
  inputs: GtfsStaticIngestInputs,
): Promise<GtfsStaticIngestResult> {
  ensureGtfsStaticTables(inputs.sqlite);
  inputs.sqlite.exec("PRAGMA busy_timeout = 30000");
  const entryReader = inputs.entryReader ?? readZipEntryText;
  const bundles: GtfsStaticBundleIngestResult[] = [];

  for (const bundle of inputs.bundles) {
    if (!existsSync(bundle.zipPath) && inputs.entryReader === undefined) {
      throw new Error(`GTFS static ZIP not found: ${bundle.zipPath}`);
    }
    bundles.push(
      await ingestBundle({
        sqlite: inputs.sqlite,
        runId: inputs.runId,
        sourceId: bundle.sourceId,
        zipPath: bundle.zipPath,
        ingestedAt: inputs.ingestedAt,
        entryReader,
      }),
    );
  }

  return {
    runId: inputs.runId,
    bundleCount: bundles.length,
    routeCount: bundles.reduce((sum, bundle) => sum + bundle.routeCount, 0),
    tripCount: bundles.reduce((sum, bundle) => sum + bundle.tripCount, 0),
    stopCount: bundles.reduce((sum, bundle) => sum + bundle.stopCount, 0),
    stopTimeCount: bundles.reduce((sum, bundle) => sum + bundle.stopTimeCount, 0),
    calendarCount: bundles.reduce((sum, bundle) => sum + bundle.calendarCount, 0),
    calendarDateCount: bundles.reduce((sum, bundle) => sum + bundle.calendarDateCount, 0),
    bundles,
  };
}

function resolveBundles(gtfsRoot: string, sources: readonly string[]): GtfsBundleInput[] {
  const wanted = sources.length === 0 ? null : new Set(sources);
  return defaultBundles
    .filter((bundle) => wanted === null || wanted.has(bundle.sourceId))
    .map((bundle) => ({
      sourceId: bundle.sourceId,
      zipPath: join(gtfsRoot, bundle.filename),
    }));
}

export default defineIngestCommand({
  path: ["ingest", "gtfs-static"],
  summary: "Parse downloaded bus GTFS static ZIPs into local all-stop schedule tables.",
  options: Schema.Struct({
    ...dbOptions.fields,
    ...{
      runId: Schema.String.pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed("20260531T010822Z")),
      ).annotate({ description: "GTFS static snapshot/run ID to stamp on staged rows" }),
      gtfsRoot: Schema.String.pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultGtfsRoot)),
      ).annotate({ description: "Directory containing downloaded bus_gtfs_*.zip files" }),
      source: Schema.optionalKey(Schema.String).annotate({
        description: "Single GTFS source id convenience filter",
      }),
      sources: Schema.Array(Schema.String)
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
        .annotate({ description: "GTFS source ids to ingest (default: all six bus bundles)" }),
      routeLimitNote: Schema.optionalKey(arg.positiveInt()).annotate({
        description:
          "No-op guardrail placeholder; route-level filtering is not supported for GTFS ZIP parsing",
      }),
    },
  }),
  output: Schema.Struct({
    runId: Schema.String,
    bundleCount: Schema.Number,
    routeCount: Schema.Number,
    tripCount: Schema.Number,
    stopCount: Schema.Number,
    stopTimeCount: Schema.Number,
    calendarCount: Schema.Number,
    calendarDateCount: Schema.Number,
    bundles: Schema.Array(
      Schema.Struct({
        sourceId: Schema.String,
        zipPath: Schema.String,
        routeCount: Schema.Number,
        tripCount: Schema.Number,
        stopCount: Schema.Number,
        stopTimeCount: Schema.Number,
        calendarCount: Schema.Number,
        calendarDateCount: Schema.Number,
      }),
    ),
  }),
  operation: "runGtfsStaticIngest",
  dbPath: ({ db }) => (db === undefined ? undefined : fromCliPath(db)),
  async runner(local, options) {
    const gtfsRoot = fromCliPath(options.gtfsRoot);
    const sourceIds =
      options.source === undefined ? options.sources : [...options.sources, options.source];
    const bundles = resolveBundles(gtfsRoot, sourceIds);
    if (bundles.length === 0) {
      throw new Error(
        `No GTFS static bundles matched: ${sourceIds.join(", ") || "(default bundle set)"}`,
      );
    }

    const result = await runGtfsStaticIngest({
      sqlite: local.sqlite,
      runId: options.runId,
      bundles,
      ingestedAt: new Date().toISOString(),
    });
    return {
      ...result,
      bundles: result.bundles.map((bundle) => ({
        ...bundle,
        zipPath: basename(bundle.zipPath),
      })),
    };
  },
});

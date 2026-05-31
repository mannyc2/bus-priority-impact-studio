import type { Database } from "bun:sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import {
  getSocrataSource,
  parseSourceManifest,
  SocrataClient,
  type SocrataFetch,
  type SocrataRowsQuery,
  soqlIn,
} from "@bp/sources";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

type BusScheduleSourceId =
  | "bus_schedules_2023"
  | "bus_schedules_2024"
  | "bus_schedules_2025"
  | "bus_schedules_2026";

type RawRouteIdRow = {
  route_id?: unknown;
};

type RawScheduleStopRow = {
  schedule_date?: unknown;
  day_type?: unknown;
  direction?: unknown;
  shape_id?: unknown;
  route_id?: unknown;
  stop_sequence?: unknown;
  stop_id?: unknown;
  stop_name?: unknown;
  schedule_time?: unknown;
  distance_from_start?: unknown;
  trip_headsign?: unknown;
  block_id?: unknown;
  bundle?: unknown;
  timepoint?: unknown;
  revenue_stop?: unknown;
  origin?: unknown;
  destination?: unknown;
};

export type RouteSchedulesIngestInputs = {
  sqlite: Database;
  sourceYear: number;
  routes: readonly string[];
  routeConcurrency?: number | undefined;
  skipExisting?: boolean | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type RouteSchedulesIngestResult = {
  sourceYear: number;
  sourceId: BusScheduleSourceId;
  routeCount: number;
  skippedRouteCount: number;
  fetchedRowCount: number;
  writtenRowCount: number;
};

const DEFAULT_ROUTE_CONCURRENCY = 2;

function sourceIdForYear(sourceYear: number): BusScheduleSourceId {
  if (sourceYear === 2023) return "bus_schedules_2023";
  if (sourceYear === 2024) return "bus_schedules_2024";
  if (sourceYear === 2025) return "bus_schedules_2025";
  if (sourceYear === 2026) return "bus_schedules_2026";
  throw new Error(`Unsupported bus schedule source year: ${sourceYear}`);
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
  }
  return null;
}

function scheduleYearWhere(sourceYear: number): string {
  return [
    `schedule_date >= '${sourceYear}-01-01T00:00:00'`,
    `schedule_date < '${sourceYear + 1}-01-01T00:00:00'`,
    "route_id IS NOT NULL",
  ].join(" AND ");
}

function ensureRouteScheduleStopTable(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_route_schedule_stop (
      source_year integer NOT NULL,
      route_id text NOT NULL,
      row_rank integer NOT NULL,
      schedule_date text NOT NULL,
      day_type text NOT NULL,
      direction text NOT NULL,
      shape_id text NOT NULL,
      stop_sequence integer NOT NULL,
      stop_id text NOT NULL,
      stop_name text,
      schedule_time text NOT NULL,
      distance_from_start real,
      trip_headsign text,
      block_id text NOT NULL,
      bundle text,
      timepoint integer,
      revenue_stop integer,
      origin integer,
      destination integer,
      PRIMARY KEY (source_year, route_id, row_rank)
    );
    CREATE INDEX IF NOT EXISTS local_route_schedule_stop_lookup_idx
      ON local_route_schedule_stop (source_year, route_id, direction, stop_id, schedule_time);
  `);
}

function existingRowCount(sqlite: Database, sourceYear: number, routeId: string): number {
  const row = sqlite
    .query(
      `
        SELECT COUNT(*) AS count
        FROM local_route_schedule_stop
        WHERE source_year = ? AND route_id = ?
      `,
    )
    .get(sourceYear, routeId) as { count?: unknown } | null;
  const count = numberValue(row?.count);
  return count === null ? 0 : count;
}

async function listSourceRoutes(input: {
  client: SocrataClient;
  sourceYear: number;
}): Promise<string[]> {
  const rows = (await input.client.rows({
    select: "route_id",
    where: scheduleYearWhere(input.sourceYear),
    group: "route_id",
    order: "route_id",
  })) as RawRouteIdRow[];
  return rows
    .map((row) => textValue(row.route_id))
    .filter((routeId): routeId is string => routeId !== null)
    .sort();
}

async function fetchRouteScheduleRows(input: {
  client: SocrataClient;
  sourceYear: number;
  routeId: string;
}): Promise<RawScheduleStopRow[]> {
  const query: SocrataRowsQuery = {
    select:
      "schedule_date,day_type,direction,shape_id,route_id,stop_sequence,stop_id,stop_name,schedule_time,distance_from_start,trip_headsign,block_id,bundle,timepoint,revenue_stop,origin,destination",
    where: [scheduleYearWhere(input.sourceYear), soqlIn("route_id", [input.routeId])].join(" AND "),
    order: "route_id,schedule_date,direction,shape_id,block_id,schedule_time,stop_sequence",
  };
  return (await input.client.rows(query)) as RawScheduleStopRow[];
}

function writeRouteRows(input: {
  sqlite: Database;
  sourceYear: number;
  routeId: string;
  rows: readonly RawScheduleStopRow[];
}): number {
  const insert = input.sqlite.prepare(`
    INSERT INTO local_route_schedule_stop (
      source_year, route_id, row_rank, schedule_date, day_type, direction, shape_id,
      stop_sequence, stop_id, stop_name, schedule_time, distance_from_start, trip_headsign,
      block_id, bundle, timepoint, revenue_stop, origin, destination
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteRows = input.sqlite.prepare(
    "DELETE FROM local_route_schedule_stop WHERE source_year = ? AND route_id = ?",
  );

  let written = 0;
  input.sqlite.transaction(() => {
    deleteRows.run(input.sourceYear, input.routeId);
    for (const [index, row] of input.rows.entries()) {
      const routeId = textValue(row.route_id);
      const scheduleDate = textValue(row.schedule_date);
      const dayType = textValue(row.day_type);
      const direction = textValue(row.direction);
      const shapeId = textValue(row.shape_id);
      const stopSequence = numberValue(row.stop_sequence);
      const stopId = textValue(row.stop_id);
      const scheduleTime = textValue(row.schedule_time);
      const blockId = textValue(row.block_id);
      if (
        routeId === null ||
        scheduleDate === null ||
        dayType === null ||
        direction === null ||
        shapeId === null ||
        stopSequence === null ||
        stopId === null ||
        scheduleTime === null ||
        blockId === null
      ) {
        continue;
      }

      insert.run(
        input.sourceYear,
        routeId,
        index + 1,
        scheduleDate,
        dayType,
        direction,
        shapeId,
        stopSequence,
        stopId,
        textValue(row.stop_name),
        scheduleTime,
        numberValue(row.distance_from_start),
        textValue(row.trip_headsign),
        blockId,
        textValue(row.bundle),
        booleanValue(row.timepoint),
        booleanValue(row.revenue_stop),
        booleanValue(row.origin),
        booleanValue(row.destination),
      );
      written += 1;
    }
  })();

  return written;
}

export async function runRouteSchedulesIngest(
  inputs: RouteSchedulesIngestInputs,
): Promise<RouteSchedulesIngestResult> {
  ensureRouteScheduleStopTable(inputs.sqlite);
  inputs.sqlite.exec("PRAGMA busy_timeout = 5000");

  const sourceId = sourceIdForYear(inputs.sourceYear);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const client = SocrataClient.fromSource(source, { fetcher: inputs.fetcher });
  const routeIds =
    inputs.routes.length === 0
      ? await listSourceRoutes({ client, sourceYear: inputs.sourceYear })
      : [...new Set(inputs.routes.map((route) => route.toUpperCase()))].sort();
  const routeConcurrency = inputs.routeConcurrency ?? DEFAULT_ROUTE_CONCURRENCY;

  let fetchedRowCount = 0;
  let writtenRowCount = 0;
  let skippedRouteCount = 0;

  for (const routeChunk of chunkArray(routeIds, routeConcurrency)) {
    const results = await Promise.all(
      routeChunk.map(async (routeId) => {
        if (
          (inputs.skipExisting ?? true) &&
          existingRowCount(inputs.sqlite, inputs.sourceYear, routeId) > 0
        ) {
          return { routeId, rows: null as RawScheduleStopRow[] | null };
        }
        return {
          routeId,
          rows: await fetchRouteScheduleRows({
            client,
            sourceYear: inputs.sourceYear,
            routeId,
          }),
        };
      }),
    );

    for (const result of results) {
      if (result.rows === null) {
        skippedRouteCount += 1;
        continue;
      }
      fetchedRowCount += result.rows.length;
      writtenRowCount += writeRouteRows({
        sqlite: inputs.sqlite,
        sourceYear: inputs.sourceYear,
        routeId: result.routeId,
        rows: result.rows,
      });
    }
  }

  return {
    sourceYear: inputs.sourceYear,
    sourceId,
    routeCount: routeIds.length,
    skippedRouteCount,
    fetchedRowCount,
    writtenRowCount,
  };
}

export default defineCommand({
  path: ["ingest", "route-schedules"],
  summary: "Fetch full route-level bus schedule stop rows from Socrata.",
  input: {
    options: dbOptions.extend({
      sourceYear: arg
        .positiveInt()
        .default(2026)
        .describe("MTA Bus Schedules source year to ingest"),
      route: z.string().optional().describe("Single route ID convenience filter"),
      routes: z
        .array(z.string())
        .default([])
        .describe("Specific route IDs (default: all routes in source year)"),
      routeConcurrency: arg
        .positiveInt()
        .default(DEFAULT_ROUTE_CONCURRENCY)
        .describe("Number of route-level Socrata schedule queries to run concurrently"),
      skipExisting: z.coerce
        .boolean()
        .default(true)
        .describe("Skip routes that already have rows for the source year"),
    }),
  },
  output: z.object({
    sourceYear: z.number(),
    sourceId: z.enum([
      "bus_schedules_2023",
      "bus_schedules_2024",
      "bus_schedules_2025",
      "bus_schedules_2026",
    ]),
    routeCount: z.number(),
    skippedRouteCount: z.number(),
    fetchedRowCount: z.number(),
    writtenRowCount: z.number(),
  }),
  async run({ input }) {
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath);
    try {
      return await runRouteSchedulesIngest({
        sqlite,
        sourceYear: input.options.sourceYear,
        routes:
          input.options.route === undefined
            ? input.options.routes
            : [...input.options.routes, input.options.route],
        routeConcurrency: input.options.routeConcurrency,
        skipExisting: input.options.skipExisting,
      });
    } finally {
      sqlite.close();
    }
  },
});

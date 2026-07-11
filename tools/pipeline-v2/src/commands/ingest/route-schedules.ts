import { Effect } from "effect";
import type { Database } from "bun:sqlite";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runBoundedPromises, runBoundedSettledPromises } from "../../effect/concurrency.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  createSoda3SourceClient,
  type PipelineSoda3Client,
  type SocrataFetch,
  type Soda3SoqlQuery,
  soqlIn,
} from "../../lib/soda3.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

export type BusScheduleSourceId =
  | "bus_schedules_2023"
  | "bus_schedules_2024"
  | "bus_schedules_2025"
  | "bus_schedules_2026";

type RawRouteIdRow = {
  route_id?: unknown;
};

export type RawScheduleStopRow = {
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
  routePageConcurrency?: number | undefined;
  pageSize?: number | undefined;
  fetchTimeoutMs?: number | undefined;
  fetchRetryCount?: number | undefined;
  skipExisting?: boolean | undefined;
  progress?: ((event: RouteSchedulesIngestProgressEvent) => void) | undefined;
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
  failedRouteCount: number;
  failedRoutes: string[];
};

export type RouteSchedulesIngestProgressEvent = {
  kind:
    | "route_failed"
    | "route_fetching"
    | "route_page_written"
    | "route_skipped"
    | "route_written";
  sourceYear: number;
  routeId: string;
  offset?: number | undefined;
  rowCount?: number | undefined;
  error?: string | undefined;
};

const DEFAULT_ROUTE_CONCURRENCY = 2;
const DEFAULT_ROUTE_PAGE_CONCURRENCY = 1;
const DEFAULT_ROUTE_PAGE_SIZE = 5_000;
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_FETCH_RETRY_COUNT = 2;

export function sourceIdForYear(sourceYear: number): BusScheduleSourceId {
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

export function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitProgress(
  inputs: RouteSchedulesIngestInputs,
  event: RouteSchedulesIngestProgressEvent,
): void {
  inputs.progress?.(event);
}

function scheduleYearWhere(sourceYear: number): string {
  return [
    `schedule_date >= '${sourceYear}-01-01T00:00:00'`,
    `schedule_date < '${sourceYear + 1}-01-01T00:00:00'`,
    "route_id IS NOT NULL",
  ].join(" AND ");
}

export function ensureRouteScheduleStopTable(sqlite: Database): void {
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

    CREATE TABLE IF NOT EXISTS local_route_schedule_ingest_status (
      source_year integer NOT NULL,
      route_id text NOT NULL,
      status text NOT NULL,
      row_count integer NOT NULL DEFAULT 0,
      error text,
      updated_at text NOT NULL,
      completed_at text,
      PRIMARY KEY (source_year, route_id)
    );
  `);
}

function routeHasRows(sqlite: Database, sourceYear: number, routeId: string): boolean {
  const row = sqlite
    .query(
      `
        SELECT 1 AS exists_row
        FROM local_route_schedule_stop
        WHERE source_year = ? AND route_id = ?
        LIMIT 1
      `,
    )
    .get(sourceYear, routeId) as { exists_row?: unknown } | null;
  return row !== null;
}

export function isExistingRouteComplete(
  sqlite: Database,
  sourceYear: number,
  routeId: string,
): boolean {
  const status = sqlite
    .query(
      `
        SELECT status, row_count
        FROM local_route_schedule_ingest_status
        WHERE source_year = ? AND route_id = ?
      `,
    )
    .get(sourceYear, routeId) as { status?: unknown; row_count?: unknown } | null;

  if (status !== null) {
    return status.status === "complete" && Number(status.row_count ?? 0) > 0;
  }

  return routeHasRows(sqlite, sourceYear, routeId);
}

type RouteScheduleIngestStatus = "complete" | "failed" | "in_progress" | "source_absent";

export function markRouteStatus(input: {
  sqlite: Database;
  sourceYear: number;
  routeId: string;
  status: RouteScheduleIngestStatus;
  rowCount: number;
  error?: string | null | undefined;
}): void {
  input.sqlite
    .prepare(
      `
        INSERT INTO local_route_schedule_ingest_status (
          source_year, route_id, status, row_count, error, updated_at, completed_at
        )
        VALUES (?, ?, ?, ?, ?, datetime('now'), CASE WHEN ? IN ('complete', 'source_absent') THEN datetime('now') ELSE NULL END)
        ON CONFLICT(source_year, route_id) DO UPDATE SET
          status = excluded.status,
          row_count = excluded.row_count,
          error = excluded.error,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at
      `,
    )
    .run(
      input.sourceYear,
      input.routeId,
      input.status,
      input.rowCount,
      input.error ?? null,
      input.status,
    );
}

export function deleteRouteRows(sqlite: Database, sourceYear: number, routeId: string): void {
  sqlite
    .prepare("DELETE FROM local_route_schedule_stop WHERE source_year = ? AND route_id = ?")
    .run(sourceYear, routeId);
}

async function listSourceRoutes(input: {
  client: PipelineSoda3Client;
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

async function fetchAndWriteRouteScheduleRows(input: {
  client: PipelineSoda3Client;
  sqlite: Database;
  sourceYear: number;
  routeId: string;
  pageConcurrency: number;
  pageSize: number;
  onPageWritten?: ((event: { offset: number; rowCount: number }) => void) | undefined;
}): Promise<{ fetchedRowCount: number; writtenRowCount: number }> {
  const where = [scheduleYearWhere(input.sourceYear), soqlIn("route_id", [input.routeId])].join(
    " AND ",
  );
  const countRows = (await input.client.rows({
    select: "count(*)",
    where,
  })) as Array<{ count?: unknown }>;
  const rowCount = numberValue(countRows[0]?.count) ?? 0;
  markRouteStatus({
    sqlite: input.sqlite,
    sourceYear: input.sourceYear,
    routeId: input.routeId,
    status: "in_progress",
    rowCount: 0,
  });
  deleteRouteRows(input.sqlite, input.sourceYear, input.routeId);
  if (rowCount <= 0) {
    markRouteStatus({
      sqlite: input.sqlite,
      sourceYear: input.sourceYear,
      routeId: input.routeId,
      status: "source_absent",
      rowCount: 0,
      error: "no_source_rows_for_requested_route",
    });
    return { fetchedRowCount: 0, writtenRowCount: 0 };
  }

  const baseQuery: Soda3SoqlQuery = {
    select:
      "schedule_date,day_type,direction,shape_id,route_id,stop_sequence,stop_id,stop_name,schedule_time,distance_from_start,trip_headsign,block_id,bundle,timepoint,revenue_stop,origin,destination",
    where,
    order: "route_id,schedule_date,direction,shape_id,block_id,schedule_time,stop_sequence",
  };
  const offsets = Array.from(
    { length: Math.ceil(rowCount / input.pageSize) },
    (_, index) => index * input.pageSize,
  );

  let fetchedRowCount = 0;
  let writtenRowCount = 0;
  for (const offsetChunk of chunkArray(offsets, input.pageConcurrency)) {
    const pageResults = await runBoundedSettledPromises(
      offsetChunk,
      input.pageConcurrency,
      async (offset) => ({
        offset,
        rows: (await input.client.rows({
          ...baseQuery,
          limit: input.pageSize,
          offset,
        })) as RawScheduleStopRow[],
      }),
    );
    const rejected = pageResults.find((result) => result.status === "rejected");
    if (rejected !== undefined) {
      throw rejected.reason;
    }

    for (const result of pageResults) {
      if (result.status !== "fulfilled") continue;
      const page = result.value;
      fetchedRowCount += page.rows.length;
      const pageWrittenRowCount = writeRoutePageRows({
        sqlite: input.sqlite,
        sourceYear: input.sourceYear,
        routeId: input.routeId,
        rowRankStart: page.offset + 1,
        rows: page.rows,
      });
      writtenRowCount += pageWrittenRowCount;
      input.onPageWritten?.({ offset: page.offset, rowCount: pageWrittenRowCount });
    }
  }

  markRouteStatus({
    sqlite: input.sqlite,
    sourceYear: input.sourceYear,
    routeId: input.routeId,
    status: "complete",
    rowCount: writtenRowCount,
  });
  return { fetchedRowCount, writtenRowCount };
}

export function writeRoutePageRows(input: {
  sqlite: Database;
  sourceYear: number;
  routeId: string;
  rowRankStart: number;
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

  let written = 0;
  input.sqlite.transaction(() => {
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
        input.rowRankStart + index,
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
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const pageSize = inputs.pageSize ?? DEFAULT_ROUTE_PAGE_SIZE;
  const client = createSoda3SourceClient(source, {
    fetcher: inputs.fetcher,
    pageSize,
    retryCount: inputs.fetchRetryCount ?? DEFAULT_FETCH_RETRY_COUNT,
    retryDelayMs: 1_000,
    timeoutMs: inputs.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
  });
  const routeIds =
    inputs.routes.length === 0
      ? await listSourceRoutes({ client, sourceYear: inputs.sourceYear })
      : [...new Set(inputs.routes.map((route) => route.toUpperCase()))].sort();
  const routeConcurrency = inputs.routeConcurrency ?? DEFAULT_ROUTE_CONCURRENCY;
  const routePageConcurrency = inputs.routePageConcurrency ?? DEFAULT_ROUTE_PAGE_CONCURRENCY;

  let fetchedRowCount = 0;
  let writtenRowCount = 0;
  let skippedRouteCount = 0;
  const failedRoutes: string[] = [];
  const pendingRouteIds: string[] = [];

  for (const routeId of routeIds) {
    if (
      (inputs.skipExisting ?? true) &&
      isExistingRouteComplete(inputs.sqlite, inputs.sourceYear, routeId)
    ) {
      skippedRouteCount += 1;
      emitProgress(inputs, {
        kind: "route_skipped",
        sourceYear: inputs.sourceYear,
        routeId,
      });
      continue;
    }

    pendingRouteIds.push(routeId);
  }

  for (const routeChunk of chunkArray(pendingRouteIds, routeConcurrency)) {
    const results = await runBoundedPromises(routeChunk, routeConcurrency, async (routeId) => {
      try {
        emitProgress(inputs, {
          kind: "route_fetching",
          sourceYear: inputs.sourceYear,
          routeId,
        });
        const routeResult = await fetchAndWriteRouteScheduleRows({
          client,
          sqlite: inputs.sqlite,
          sourceYear: inputs.sourceYear,
          routeId,
          pageConcurrency: routePageConcurrency,
          pageSize,
          onPageWritten: (event) =>
            emitProgress(inputs, {
              kind: "route_page_written",
              sourceYear: inputs.sourceYear,
              routeId,
              offset: event.offset,
              rowCount: event.rowCount,
            }),
        });
        return {
          routeId,
          ...routeResult,
          error: null,
        };
      } catch (error) {
        const message = errorMessage(error);
        deleteRouteRows(inputs.sqlite, inputs.sourceYear, routeId);
        markRouteStatus({
          sqlite: inputs.sqlite,
          sourceYear: inputs.sourceYear,
          routeId,
          status: "failed",
          rowCount: 0,
          error: message,
        });
        return {
          routeId,
          fetchedRowCount: 0,
          writtenRowCount: 0,
          error,
        };
      }
    });

    for (const result of results) {
      if (result.error !== null) {
        const message = errorMessage(result.error);
        failedRoutes.push(result.routeId);
        emitProgress(inputs, {
          kind: "route_failed",
          sourceYear: inputs.sourceYear,
          routeId: result.routeId,
          error: message,
        });
        continue;
      }
      fetchedRowCount += result.fetchedRowCount;
      writtenRowCount += result.writtenRowCount;
      emitProgress(inputs, {
        kind: "route_written",
        sourceYear: inputs.sourceYear,
        routeId: result.routeId,
        rowCount: result.writtenRowCount,
      });
    }
  }

  if (failedRoutes.length > 0) {
    throw new Error(
      [
        `Failed to fetch ${failedRoutes.length} route schedule(s) for ${inputs.sourceYear}: ${failedRoutes.join(", ")}`,
        `wrote ${writtenRowCount} rows and skipped ${skippedRouteCount} existing route(s) before failing`,
      ].join("; "),
    );
  }

  return {
    sourceYear: inputs.sourceYear,
    sourceId,
    routeCount: routeIds.length,
    skippedRouteCount,
    fetchedRowCount,
    writtenRowCount,
    failedRouteCount: 0,
    failedRoutes: [],
  };
}

export default defineIngestCommand({
  path: ["ingest", "route-schedules"],
  summary: "Fetch full route-level bus schedule stop rows from Socrata.",
  options: Schema.Struct({
    ...dbOptions.fields,
    ...{
      sourceYear: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
        .annotate({ description: "MTA Bus Schedules source year to ingest" }),
      route: Schema.optionalKey(Schema.String).annotate({
        description: "Single route ID convenience filter",
      }),
      routes: Schema.Array(Schema.String)
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
        .annotate({ description: "Specific route IDs (default: all routes in source year)" }),
      routeConcurrency: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_ROUTE_CONCURRENCY)))
        .annotate({
          description: "Number of route-level Socrata schedule queries to run concurrently",
        }),
      routePageConcurrency: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_ROUTE_PAGE_CONCURRENCY)))
        .annotate({
          description: "Number of Socrata pages to fetch concurrently within each route",
        }),
      pageSize: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_ROUTE_PAGE_SIZE)))
        .annotate({ description: "Socrata page size for route schedule stop rows" }),
      fetchTimeoutMs: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_FETCH_TIMEOUT_MS)))
        .annotate({ description: "Timeout per Socrata request before retrying" }),
      fetchRetryCount: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_FETCH_RETRY_COUNT)))
        .annotate({ description: "Retry count for route schedule Socrata requests" }),
      logProgress: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
        .annotate({ description: "Write per-route ingest progress events to stderr" }),
      skipExisting: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
        .annotate({ description: "Skip routes that already have rows for the source year" }),
    },
  }),
  output: Schema.Struct({
    sourceYear: Schema.Number,
    sourceId: Schema.Literals([
      "bus_schedules_2023",
      "bus_schedules_2024",
      "bus_schedules_2025",
      "bus_schedules_2026",
    ]),
    routeCount: Schema.Number,
    skippedRouteCount: Schema.Number,
    fetchedRowCount: Schema.Number,
    writtenRowCount: Schema.Number,
    failedRouteCount: Schema.Number,
    failedRoutes: Schema.Array(Schema.String),
  }),
  operation: "runRouteSchedulesIngest",
  dbPath: ({ db }) => (db === undefined ? undefined : fromCliPath(db)),
  runner: async (local, options) =>
    runRouteSchedulesIngest({
      sqlite: local.sqlite,
      sourceYear: options.sourceYear,
      routes: options.route === undefined ? options.routes : [...options.routes, options.route],
      routeConcurrency: options.routeConcurrency,
      routePageConcurrency: options.routePageConcurrency,
      pageSize: options.pageSize,
      fetchTimeoutMs: options.fetchTimeoutMs,
      fetchRetryCount: options.fetchRetryCount,
      progress: options.logProgress
        ? (event) => {
            console.error(
              JSON.stringify({
                event: "route_schedules_ingest_progress",
                ...event,
              }),
            );
          }
        : undefined,
      skipExisting: options.skipExisting,
    }),
});

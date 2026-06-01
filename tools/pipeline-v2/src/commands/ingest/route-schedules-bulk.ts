import type { Database } from "bun:sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  getSocrataSource,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataManifestSource,
} from "@bp/sources";
import { arg, defineCommand, z } from "@liche/core";
import { downloadHttpFile } from "../../lib/http-file-download.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { fetchWithSocrataAppToken } from "../../lib/socrata-token.ts";
import { readCsvRecords } from "../../lib/streaming-csv.ts";
import {
  deleteRouteRows,
  ensureRouteScheduleStopTable,
  isExistingRouteComplete,
  markRouteStatus,
  numberValue,
  type RawScheduleStopRow,
  sourceIdForYear,
  textValue,
  writeRoutePageRows,
} from "./route-schedules.ts";

export type RouteSchedulesBulkIngestProgressEvent =
  | {
      kind: "csv_download_started";
      sourceYear: number;
      url: string;
      csvPath: string;
    }
  | {
      kind: "csv_download_progress";
      sourceYear: number;
      csvPath: string;
      downloadedBytes: number;
      totalBytes: number | null;
      attempt: number;
      maxAttempts: number;
    }
  | {
      kind: "csv_download_attempt_failed";
      sourceYear: number;
      csvPath: string;
      attempt: number;
      maxAttempts: number;
      message: string;
    }
  | {
      kind: "csv_download_completed" | "csv_download_reused";
      sourceYear: number;
      csvPath: string;
      downloadedBytes?: number | undefined;
    }
  | {
      kind: "csv_split_progress";
      sourceYear: number;
      rowCount: number;
      spooledRowCount: number;
      routeCount: number;
      skippedRouteCount: number;
    }
  | {
      kind: "route_filter_resolved";
      sourceYear: number;
      routeCount: number;
      routeIds: string[];
    }
  | {
      kind: "route_skipped" | "route_importing" | "route_imported";
      sourceYear: number;
      routeId: string;
      rowCount?: number | undefined;
    };

export type RouteSchedulesBulkIngestInputs = {
  sqlite: Database;
  sourceYear: number;
  routes: readonly string[];
  csvPath?: string | undefined;
  partitionManifestPath?: string | undefined;
  cacheDir?: string | undefined;
  spoolDir?: string | undefined;
  forceDownload?: boolean | undefined;
  skipDownload?: boolean | undefined;
  downloadRetryCount?: number | undefined;
  downloadRetryDelayMs?: number | undefined;
  downloadOnly?: boolean | undefined;
  skipExisting?: boolean | undefined;
  onlyMissingCurrentRoutes?: boolean | undefined;
  keepSpool?: boolean | undefined;
  batchSize?: number | undefined;
  progress?: ((event: RouteSchedulesBulkIngestProgressEvent) => void) | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type RouteSchedulesBulkIngestResult = {
  sourceYear: number;
  sourceId: ReturnType<typeof sourceIdForYear>;
  csvPath: string;
  csvPathCount: number;
  routeCount: number;
  skippedRouteCount: number;
  spooledRowCount: number;
  writtenRowCount: number;
  emptyRouteCount: number;
  downloaded: boolean;
  downloadOnly: boolean;
};

type ScheduleCsvColumn = keyof Pick<
  RawScheduleStopRow,
  | "schedule_date"
  | "day_type"
  | "direction"
  | "shape_id"
  | "route_id"
  | "stop_sequence"
  | "stop_id"
  | "stop_name"
  | "schedule_time"
  | "distance_from_start"
  | "trip_headsign"
  | "block_id"
  | "bundle"
  | "timepoint"
  | "revenue_stop"
  | "origin"
  | "destination"
>;

type ScheduleCsvIndexes = Partial<Record<ScheduleCsvColumn, number>>;

type RouteSpool = {
  routeId: string;
  path: string;
  writer: ReturnType<ReturnType<typeof Bun.file>["writer"]>;
  rowCount: number;
};

type PartitionManifest = {
  chunks?: Array<{
    path?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
  }>;
};

type CsvSnapshotInput = {
  displayPath: string;
  csvPaths: string[];
  downloaded: boolean;
  bytes: number;
};

const defaultBatchSize = 10_000;
const progressRowInterval = 250_000;
const progressByteInterval = 50 * 1024 * 1024;

const columnAliases: Record<ScheduleCsvColumn, string[]> = {
  schedule_date: ["schedule_date", "schedule day", "schedule date"],
  day_type: ["day_type", "day type"],
  direction: ["direction"],
  shape_id: ["shape_id", "shape id"],
  route_id: ["route_id", "route id"],
  stop_sequence: ["stop_sequence", "stop sequence"],
  stop_id: ["stop_id", "stop id"],
  stop_name: ["stop_name", "stop name"],
  schedule_time: ["schedule_time", "schedule time"],
  distance_from_start: ["distance_from_start", "distance from start"],
  trip_headsign: ["trip_headsign", "trip headsign", "trip head sign"],
  block_id: ["block_id", "block id"],
  bundle: ["bundle"],
  timepoint: ["timepoint"],
  revenue_stop: ["revenue_stop", "revenue stop"],
  origin: ["origin"],
  destination: ["destination"],
};

function emitProgress(
  inputs: RouteSchedulesBulkIngestInputs,
  event: RouteSchedulesBulkIngestProgressEvent,
): void {
  inputs.progress?.(event);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildScheduleCsvIndexes(headers: readonly string[]): ScheduleCsvIndexes {
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    headerIndexes.set(normalizeHeader(header), index);
  });

  const indexes: ScheduleCsvIndexes = {};
  for (const [column, aliases] of Object.entries(columnAliases) as Array<
    [ScheduleCsvColumn, string[]]
  >) {
    const index = aliases
      .map((alias) => headerIndexes.get(normalizeHeader(alias)))
      .find((candidate): candidate is number => candidate !== undefined);
    if (index !== undefined) indexes[column] = index;
  }

  for (const required of [
    "schedule_date",
    "day_type",
    "direction",
    "shape_id",
    "route_id",
    "stop_sequence",
    "stop_id",
    "schedule_time",
    "block_id",
  ] satisfies ScheduleCsvColumn[]) {
    if (indexes[required] === undefined) {
      throw new Error(`Bulk schedule CSV is missing required column: ${required}`);
    }
  }

  return indexes;
}

function csvValue(
  values: readonly string[],
  indexes: ScheduleCsvIndexes,
  column: ScheduleCsvColumn,
): string | undefined {
  const index = indexes[column];
  return index === undefined ? undefined : values[index];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseUsDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (match === null) return null;
  return {
    month: Number(match[1]),
    day: Number(match[2]),
    year: Number(match[3]),
  };
}

function normalizeScheduleDate(value: string | undefined): string | undefined {
  const text = value?.trim() ?? "";
  if (text.length === 0) return undefined;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000`;

  const parsed = parseUsDate(text);
  if (parsed === null) return text;
  return `${parsed.year}-${pad2(parsed.month)}-${pad2(parsed.day)}T00:00:00.000`;
}

function normalizeScheduleTime(value: string | undefined): string | undefined {
  const text = value?.trim() ?? "";
  if (text.length === 0) return undefined;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return text;

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(
    text,
  );
  if (match === null) return text;

  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const meridiem = (match[7] ?? "").toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour < 12) hour += 12;

  return `${match[3]}-${pad2(Number(match[1]))}-${pad2(Number(match[2]))}T${pad2(hour)}:${pad2(
    minute,
  )}:${pad2(second)}.000`;
}

function csvRecordToScheduleRow(
  values: readonly string[],
  indexes: ScheduleCsvIndexes,
): RawScheduleStopRow | null {
  const routeId = csvValue(values, indexes, "route_id")?.trim().toUpperCase();
  if (routeId === undefined || routeId.length === 0) return null;

  return {
    schedule_date: normalizeScheduleDate(csvValue(values, indexes, "schedule_date")),
    day_type: csvValue(values, indexes, "day_type")?.trim(),
    direction: csvValue(values, indexes, "direction")?.trim(),
    shape_id: csvValue(values, indexes, "shape_id")?.trim(),
    route_id: routeId,
    stop_sequence: csvValue(values, indexes, "stop_sequence")?.trim(),
    stop_id: csvValue(values, indexes, "stop_id")?.trim(),
    stop_name: csvValue(values, indexes, "stop_name")?.trim(),
    schedule_time: normalizeScheduleTime(csvValue(values, indexes, "schedule_time")),
    distance_from_start: csvValue(values, indexes, "distance_from_start")?.trim(),
    trip_headsign: csvValue(values, indexes, "trip_headsign")?.trim(),
    block_id: csvValue(values, indexes, "block_id")?.trim(),
    bundle: csvValue(values, indexes, "bundle")?.trim(),
    timepoint: csvValue(values, indexes, "timepoint")?.trim(),
    revenue_stop: csvValue(values, indexes, "revenue_stop")?.trim(),
    origin: csvValue(values, indexes, "origin")?.trim(),
    destination: csvValue(values, indexes, "destination")?.trim(),
  };
}

function routeMatchesFilter(routeId: string, routeFilter: Set<string> | null): boolean {
  return routeFilter === null || routeFilter.has(routeId);
}

function routeSpoolPath(spoolDir: string, routeId: string): string {
  return join(spoolDir, `${routeId.replace(/[^A-Za-z0-9+_-]/g, "_")}.ndjson`);
}

async function closeRouteSpools(spools: Iterable<RouteSpool>): Promise<void> {
  await Promise.all([...spools].map((spool) => spool.writer.end()));
}

function compareText(left: unknown, right: unknown): number {
  return (textValue(left) ?? "").localeCompare(textValue(right) ?? "");
}

function compareScheduleRows(left: RawScheduleStopRow, right: RawScheduleStopRow): number {
  return (
    compareText(left.route_id, right.route_id) ||
    compareText(left.schedule_date, right.schedule_date) ||
    compareText(left.direction, right.direction) ||
    compareText(left.shape_id, right.shape_id) ||
    compareText(left.block_id, right.block_id) ||
    compareText(left.schedule_time, right.schedule_time) ||
    (numberValue(left.stop_sequence) ?? 0) - (numberValue(right.stop_sequence) ?? 0)
  );
}

async function* readSpoolRows(path: string): AsyncGenerator<RawScheduleStopRow> {
  const decoder = new TextDecoder();
  let buffered = "";

  for await (const chunk of Bun.file(path).stream()) {
    buffered += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex);
      buffered = buffered.slice(newlineIndex + 1);
      if (line.trim().length > 0) yield JSON.parse(line) as RawScheduleStopRow;
      newlineIndex = buffered.indexOf("\n");
    }
  }

  buffered += decoder.decode();
  if (buffered.trim().length > 0) yield JSON.parse(buffered) as RawScheduleStopRow;
}

async function readSortedSpoolRows(path: string): Promise<RawScheduleStopRow[]> {
  const rows: RawScheduleStopRow[] = [];
  for await (const row of readSpoolRows(path)) rows.push(row);
  rows.sort(compareScheduleRows);
  return rows;
}

function shouldReuseCsv(path: string, forceDownload: boolean | undefined): boolean {
  return !forceDownload && existsSync(path);
}

function normalizeRouteIds(routes: readonly string[]): string[] {
  return [...new Set(routes.map((routeId) => routeId.trim().toUpperCase()).filter(Boolean))].sort();
}

function localTableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function currentCatalogRouteIds(sqlite: Database): string[] {
  if (!localTableExists(sqlite, "local_route_catalog")) {
    throw new Error(
      "--only-missing-current-routes requires local_route_catalog to be present in the local DB",
    );
  }

  return (
    sqlite
      .query("SELECT DISTINCT route_id FROM local_route_catalog ORDER BY route_id")
      .all() as Array<{ route_id?: unknown }>
  )
    .map((row) => textValue(row.route_id))
    .filter((routeId): routeId is string => routeId !== null)
    .map((routeId) => routeId.toUpperCase());
}

function missingCurrentRouteIds(input: {
  sqlite: Database;
  sourceYear: number;
  explicitRoutes: readonly string[];
}): string[] {
  const explicitRoutes = normalizeRouteIds(input.explicitRoutes);
  const explicitSet = explicitRoutes.length > 0 ? new Set(explicitRoutes) : null;
  return currentCatalogRouteIds(input.sqlite).filter(
    (routeId) =>
      routeMatchesFilter(routeId, explicitSet) &&
      !isExistingRouteComplete(input.sqlite, input.sourceYear, routeId),
  );
}

async function downloadCsvSnapshot(input: {
  sourceYear: number;
  source: SocrataManifestSource;
  csvPath: string;
  forceDownload?: boolean | undefined;
  skipDownload?: boolean | undefined;
  downloadRetryCount?: number | undefined;
  downloadRetryDelayMs?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  progress?: ((event: RouteSchedulesBulkIngestProgressEvent) => void) | undefined;
}): Promise<{ downloaded: boolean; bytes: number }> {
  if (input.skipDownload) {
    if (shouldReuseCsv(input.csvPath, input.forceDownload)) {
      input.progress?.({
        kind: "csv_download_reused",
        sourceYear: input.sourceYear,
        csvPath: input.csvPath,
      });
      return { downloaded: false, bytes: 0 };
    }
    throw new Error(`Bulk schedule CSV does not exist: ${input.csvPath}`);
  }

  return downloadHttpFile({
    url: input.source.rows_csv,
    outputPath: input.csvPath,
    force: input.forceDownload,
    retryCount: input.downloadRetryCount,
    retryDelayMs: input.downloadRetryDelayMs,
    progressByteInterval,
    fetcher: input.fetcher,
    progress: (event) => {
      if (event.kind === "download_started") {
        input.progress?.({
          kind: "csv_download_started",
          sourceYear: input.sourceYear,
          url: event.url,
          csvPath: event.outputPath,
        });
      } else if (event.kind === "download_progress") {
        input.progress?.({
          kind: "csv_download_progress",
          sourceYear: input.sourceYear,
          csvPath: event.outputPath,
          downloadedBytes: event.downloadedBytes,
          totalBytes: event.totalBytes,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
        });
      } else if (event.kind === "download_attempt_failed") {
        input.progress?.({
          kind: "csv_download_attempt_failed",
          sourceYear: input.sourceYear,
          csvPath: event.outputPath,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          message: event.message,
        });
      } else {
        input.progress?.({
          kind:
            event.kind === "download_completed" ? "csv_download_completed" : "csv_download_reused",
          sourceYear: input.sourceYear,
          csvPath: event.outputPath,
          downloadedBytes: event.downloadedBytes,
        });
      }
    },
  });
}

function partitionManifestRowsCsvPaths(manifestPath: string, manifest: PartitionManifest): string[] {
  const manifestDir = dirname(manifestPath);
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  const paths = chunks
    .map((chunk) => {
      const chunkPath = chunk.path?.trim();
      if (chunkPath === undefined || chunkPath.length === 0) return null;
      return resolve(manifestDir, chunkPath);
    })
    .filter((path): path is string => path !== null);

  if (paths.length === 0) {
    throw new Error(`Partition manifest has no chunk paths: ${manifestPath}`);
  }

  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`Partition manifest references missing CSV chunk: ${path}`);
    }
  }

  return paths;
}

async function readPartitionManifestCsvSnapshot(manifestPath: string): Promise<CsvSnapshotInput> {
  if (!existsSync(manifestPath)) {
    throw new Error(`Partition manifest does not exist: ${manifestPath}`);
  }

  const manifest = JSON.parse(await Bun.file(manifestPath).text()) as PartitionManifest;
  const csvPaths = partitionManifestRowsCsvPaths(manifestPath, manifest);
  const bytes = csvPaths.reduce((sum, path) => sum + statSync(path).size, 0);
  return {
    displayPath: manifestPath,
    csvPaths,
    downloaded: false,
    bytes,
  };
}

async function prepareCsvSnapshot(input: {
  sourceYear: number;
  source: SocrataManifestSource;
  csvPath: string;
  partitionManifestPath?: string | undefined;
  forceDownload?: boolean | undefined;
  skipDownload?: boolean | undefined;
  downloadRetryCount?: number | undefined;
  downloadRetryDelayMs?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  progress?: ((event: RouteSchedulesBulkIngestProgressEvent) => void) | undefined;
}): Promise<CsvSnapshotInput> {
  if (input.partitionManifestPath !== undefined) {
    if (input.forceDownload) {
      throw new Error("--force-download is not supported with --partition-manifest-path");
    }
    const snapshot = await readPartitionManifestCsvSnapshot(input.partitionManifestPath);
    input.progress?.({
      kind: "csv_download_reused",
      sourceYear: input.sourceYear,
      csvPath: snapshot.displayPath,
      downloadedBytes: snapshot.bytes,
    });
    return snapshot;
  }

  const downloadResult = await downloadCsvSnapshot({
    sourceYear: input.sourceYear,
    source: input.source,
    csvPath: input.csvPath,
    forceDownload: input.forceDownload,
    skipDownload: input.skipDownload,
    downloadRetryCount: input.downloadRetryCount,
    downloadRetryDelayMs: input.downloadRetryDelayMs,
    fetcher: input.fetcher,
    progress: input.progress,
  });
  return {
    displayPath: input.csvPath,
    csvPaths: [input.csvPath],
    downloaded: downloadResult.downloaded,
    bytes: downloadResult.bytes,
  };
}

async function splitCsvToRouteSpools(input: {
  sqlite: Database;
  sourceYear: number;
  csvPaths: readonly string[];
  spoolDir: string;
  routes: readonly string[];
  skipExisting: boolean;
  progress?: ((event: RouteSchedulesBulkIngestProgressEvent) => void) | undefined;
}): Promise<{
  spools: Map<string, RouteSpool>;
  skippedRouteIds: Set<string>;
  requestedRouteIds: Set<string> | null;
  scannedRowCount: number;
  spooledRowCount: number;
}> {
  await mkdir(input.spoolDir, { recursive: true });
  const requestedRouteIds =
    input.routes.length === 0
      ? null
      : new Set(input.routes.map((routeId) => routeId.toUpperCase()).sort());
  const routeDecisions = new Map<string, boolean>();
  const skippedRouteIds = new Set<string>();
  const spools = new Map<string, RouteSpool>();

  let scannedRowCount = 0;
  let spooledRowCount = 0;

  for (const csvPath of input.csvPaths) {
    let indexes: ScheduleCsvIndexes | null = null;
    for await (const record of readCsvRecords(csvPath)) {
      if (indexes === null) indexes = buildScheduleCsvIndexes(record.headers);
      scannedRowCount += 1;

      const routeId = csvValue(record.values, indexes, "route_id")?.trim().toUpperCase();
      if (routeId === undefined || routeId.length === 0) continue;

      let shouldSpool = routeDecisions.get(routeId);
      if (shouldSpool === undefined) {
        shouldSpool =
          routeMatchesFilter(routeId, requestedRouteIds) &&
          !(input.skipExisting && isExistingRouteComplete(input.sqlite, input.sourceYear, routeId));
        routeDecisions.set(routeId, shouldSpool);
        if (!shouldSpool && routeMatchesFilter(routeId, requestedRouteIds)) {
          skippedRouteIds.add(routeId);
          input.progress?.({
            kind: "route_skipped",
            sourceYear: input.sourceYear,
            routeId,
          });
        }
      }

      if (scannedRowCount % progressRowInterval === 0) {
        input.progress?.({
          kind: "csv_split_progress",
          sourceYear: input.sourceYear,
          rowCount: scannedRowCount,
          spooledRowCount,
          routeCount: spools.size,
          skippedRouteCount: skippedRouteIds.size,
        });
      }

      if (!shouldSpool) continue;

      const row = csvRecordToScheduleRow(record.values, indexes);
      if (row === null) continue;

      let spool = spools.get(routeId);
      if (spool === undefined) {
        const path = routeSpoolPath(input.spoolDir, routeId);
        spool = {
          routeId,
          path,
          writer: Bun.file(path).writer({ highWaterMark: 1024 * 1024 }),
          rowCount: 0,
        };
        spools.set(routeId, spool);
      }

      spool.writer.write(`${JSON.stringify(row)}\n`);
      spool.rowCount += 1;
      spooledRowCount += 1;
    }
  }

  await closeRouteSpools(spools.values());
  return {
    spools,
    skippedRouteIds,
    requestedRouteIds,
    scannedRowCount,
    spooledRowCount,
  };
}

async function importRouteSpools(input: {
  sqlite: Database;
  sourceYear: number;
  spools: Map<string, RouteSpool>;
  requestedRouteIds: Set<string> | null;
  skippedRouteIds: Set<string>;
  batchSize: number;
  progress?: ((event: RouteSchedulesBulkIngestProgressEvent) => void) | undefined;
}): Promise<{ writtenRowCount: number; routeCount: number; emptyRouteCount: number }> {
  let writtenRowCount = 0;
  let emptyRouteCount = 0;
  const routeIds =
    input.requestedRouteIds === null
      ? [...input.spools.keys()].sort()
      : [...input.requestedRouteIds].sort();

  for (const routeId of routeIds) {
    if (input.skippedRouteIds.has(routeId)) continue;

    const spool = input.spools.get(routeId);
    if (spool === undefined) {
      markRouteStatus({
        sqlite: input.sqlite,
        sourceYear: input.sourceYear,
        routeId,
        status: "source_absent",
        rowCount: 0,
        error: "no_source_rows_for_requested_route",
      });
      emptyRouteCount += 1;
      continue;
    }

    input.progress?.({
      kind: "route_importing",
      sourceYear: input.sourceYear,
      routeId,
      rowCount: spool.rowCount,
    });
    markRouteStatus({
      sqlite: input.sqlite,
      sourceYear: input.sourceYear,
      routeId,
      status: "in_progress",
      rowCount: 0,
    });
    deleteRouteRows(input.sqlite, input.sourceYear, routeId);

    const rows = await readSortedSpoolRows(spool.path);
    let routeWrittenRowCount = 0;
    for (let index = 0; index < rows.length; index += input.batchSize) {
      routeWrittenRowCount += writeRoutePageRows({
        sqlite: input.sqlite,
        sourceYear: input.sourceYear,
        routeId,
        rowRankStart: index + 1,
        rows: rows.slice(index, index + input.batchSize),
      });
    }

    markRouteStatus({
      sqlite: input.sqlite,
      sourceYear: input.sourceYear,
      routeId,
      status: "complete",
      rowCount: routeWrittenRowCount,
    });
    writtenRowCount += routeWrittenRowCount;
    input.progress?.({
      kind: "route_imported",
      sourceYear: input.sourceYear,
      routeId,
      rowCount: routeWrittenRowCount,
    });
  }

  return {
    writtenRowCount,
    routeCount: routeIds.length,
    emptyRouteCount,
  };
}

function defaultCsvPath(input: { cacheDir?: string | undefined; sourceId: string }): string {
  const cacheDir = input.cacheDir ?? fromRepoRoot(join("data/raw/socrata-bulk", input.sourceId));
  return join(cacheDir, "rows.csv");
}

function defaultSpoolDir(sourceId: string): string {
  return fromRepoRoot(
    join("data/working/route-schedules-bulk", `${sourceId}-${Date.now()}-${process.pid}`),
  );
}

export async function runRouteSchedulesBulkIngest(
  inputs: RouteSchedulesBulkIngestInputs,
): Promise<RouteSchedulesBulkIngestResult> {
  ensureRouteScheduleStopTable(inputs.sqlite);
  inputs.sqlite.exec("PRAGMA busy_timeout = 5000");

  const sourceId = sourceIdForYear(inputs.sourceYear);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const csvPath = inputs.csvPath ?? defaultCsvPath({ cacheDir: inputs.cacheDir, sourceId });
  const spoolDir = inputs.spoolDir ?? defaultSpoolDir(sourceId);
  const skipExisting = inputs.skipExisting ?? true;
  const batchSize = inputs.batchSize ?? defaultBatchSize;
  const downloadOnly = inputs.downloadOnly ?? false;
  const routes = inputs.onlyMissingCurrentRoutes
    ? missingCurrentRouteIds({
        sqlite: inputs.sqlite,
        sourceYear: inputs.sourceYear,
        explicitRoutes: inputs.routes,
      })
    : normalizeRouteIds(inputs.routes);

  if (inputs.onlyMissingCurrentRoutes) {
    emitProgress(inputs, {
      kind: "route_filter_resolved",
      sourceYear: inputs.sourceYear,
      routeCount: routes.length,
      routeIds: routes,
    });
  }

  if (!downloadOnly && inputs.onlyMissingCurrentRoutes && routes.length === 0) {
    return {
      sourceYear: inputs.sourceYear,
      sourceId,
      csvPath: inputs.partitionManifestPath ?? csvPath,
      csvPathCount: 0,
      routeCount: 0,
      skippedRouteCount: 0,
      spooledRowCount: 0,
      writtenRowCount: 0,
      emptyRouteCount: 0,
      downloaded: false,
      downloadOnly,
    };
  }

  const csvSnapshot = await prepareCsvSnapshot({
    sourceYear: inputs.sourceYear,
    source,
    csvPath,
    partitionManifestPath: inputs.partitionManifestPath,
    forceDownload: inputs.forceDownload,
    skipDownload: inputs.skipDownload,
    downloadRetryCount: inputs.downloadRetryCount,
    downloadRetryDelayMs: inputs.downloadRetryDelayMs,
    fetcher: fetchWithSocrataAppToken(inputs.fetcher),
    progress: (event) => emitProgress(inputs, event),
  });

  if (downloadOnly) {
    return {
      sourceYear: inputs.sourceYear,
      sourceId,
      csvPath: csvSnapshot.displayPath,
      csvPathCount: csvSnapshot.csvPaths.length,
      routeCount: 0,
      skippedRouteCount: 0,
      spooledRowCount: 0,
      writtenRowCount: 0,
      emptyRouteCount: 0,
      downloaded: csvSnapshot.downloaded,
      downloadOnly,
    };
  }

  let splitResult: Awaited<ReturnType<typeof splitCsvToRouteSpools>> | undefined;
  try {
    splitResult = await splitCsvToRouteSpools({
      sqlite: inputs.sqlite,
      sourceYear: inputs.sourceYear,
      csvPaths: csvSnapshot.csvPaths,
      spoolDir,
      routes,
      skipExisting,
      progress: (event) => emitProgress(inputs, event),
    });

    const importResult = await importRouteSpools({
      sqlite: inputs.sqlite,
      sourceYear: inputs.sourceYear,
      spools: splitResult.spools,
      requestedRouteIds: splitResult.requestedRouteIds,
      skippedRouteIds: splitResult.skippedRouteIds,
      batchSize,
      progress: (event) => emitProgress(inputs, event),
    });

      return {
        sourceYear: inputs.sourceYear,
        sourceId,
        csvPath: csvSnapshot.displayPath,
        csvPathCount: csvSnapshot.csvPaths.length,
        routeCount: importResult.routeCount,
        skippedRouteCount: splitResult.skippedRouteIds.size,
        spooledRowCount: splitResult.spooledRowCount,
        writtenRowCount: importResult.writtenRowCount,
        emptyRouteCount: importResult.emptyRouteCount,
        downloaded: csvSnapshot.downloaded,
        downloadOnly,
      };
  } finally {
    if (!(inputs.keepSpool ?? false)) {
      await rm(spoolDir, { recursive: true, force: true });
    }
  }
}

export default defineCommand({
  path: ["ingest", "route-schedules-bulk"],
  summary:
    "Download or reuse Socrata schedule CSV snapshots and stream-import route schedule stop rows.",
  input: {
    options: dbOptions.extend({
      sourceYear: arg
        .positiveInt()
        .default(2026)
        .describe("MTA Bus Schedules source year to bulk ingest"),
      route: z.string().optional().describe("Single route ID convenience filter"),
      routes: z
        .array(z.string())
        .default([])
        .describe("Specific route IDs (default: all routes in source year)"),
      csvPath: z.string().optional().describe("Existing or target full rows.csv path"),
      partitionManifestPath: z
        .string()
        .optional()
        .describe("Existing SODA3 partition-manifest.json to import instead of one full CSV"),
      cacheDir: z.string().optional().describe("Directory for the downloaded rows.csv cache"),
      spoolDir: z.string().optional().describe("Scratch directory for per-route spool files"),
      forceDownload: z.coerce
        .boolean()
        .default(false)
        .describe("Redownload the full CSV even if csvPath already exists"),
      skipDownload: z.coerce
        .boolean()
        .default(false)
        .describe("Require csvPath to already exist; do not fetch Socrata"),
      downloadRetryCount: z.coerce
        .number()
        .int()
        .min(0)
        .default(2)
        .describe("Number of retry attempts after a failed CSV download attempt"),
      downloadRetryDelayMs: z.coerce
        .number()
        .int()
        .min(0)
        .default(5_000)
        .describe("Delay between CSV download retry attempts"),
      downloadOnly: z.coerce
        .boolean()
        .default(false)
        .describe("Download or verify the CSV cache without importing route rows"),
      skipExisting: z.coerce
        .boolean()
        .default(true)
        .describe("Skip routes already marked complete for the source year"),
      onlyMissingCurrentRoutes: z.coerce
        .boolean()
        .default(false)
        .describe(
          "Restrict import to current-catalog routes that are not already complete for the source year",
        ),
      keepSpool: z.coerce
        .boolean()
        .default(false)
        .describe("Keep per-route scratch NDJSON files after import"),
      batchSize: arg
        .positiveInt()
        .default(defaultBatchSize)
        .describe("SQLite insert batch size per route"),
      logProgress: z.coerce
        .boolean()
        .default(true)
        .describe("Write bulk ingest progress events to stderr"),
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
    csvPath: z.string(),
    csvPathCount: z.number(),
    routeCount: z.number(),
    skippedRouteCount: z.number(),
    spooledRowCount: z.number(),
    writtenRowCount: z.number(),
    emptyRouteCount: z.number(),
    downloaded: z.boolean(),
    downloadOnly: z.boolean(),
  }),
  async run({ input }) {
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath);
    try {
      return await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: input.options.sourceYear,
        routes:
          input.options.route === undefined
            ? input.options.routes
            : [...input.options.routes, input.options.route],
        csvPath:
          input.options.csvPath === undefined ? undefined : fromCliPath(input.options.csvPath),
        partitionManifestPath:
          input.options.partitionManifestPath === undefined
            ? undefined
            : fromCliPath(input.options.partitionManifestPath),
        cacheDir:
          input.options.cacheDir === undefined ? undefined : fromCliPath(input.options.cacheDir),
        spoolDir:
          input.options.spoolDir === undefined ? undefined : fromCliPath(input.options.spoolDir),
        forceDownload: input.options.forceDownload,
        skipDownload: input.options.skipDownload,
        downloadRetryCount: input.options.downloadRetryCount,
        downloadRetryDelayMs: input.options.downloadRetryDelayMs,
        downloadOnly: input.options.downloadOnly,
        skipExisting: input.options.skipExisting,
        onlyMissingCurrentRoutes: input.options.onlyMissingCurrentRoutes,
        keepSpool: input.options.keepSpool,
        batchSize: input.options.batchSize,
        progress: input.options.logProgress
          ? (event) => {
              console.error(
                JSON.stringify({
                  event: "route_schedules_bulk_ingest_progress",
                  ...event,
                }),
              );
            }
          : undefined,
      });
    } finally {
      sqlite.close();
    }
  },
});

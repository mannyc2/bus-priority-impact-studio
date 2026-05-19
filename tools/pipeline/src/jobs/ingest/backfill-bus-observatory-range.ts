/**
 * Backfill Bus Observatory recovered GTFS-RT for a range of months.
 *
 * For each month in [--since, --until]:
 *   1. Read the availability artifact (produced by check:bus-observatory-gtfs-rt-range).
 *   2. Generate build-headway-samples.sql and build-snapshots-30s.sql under
 *      data/working/bus-observatory/<YYYY-MM>/raw-provenance/.
 *   3. Run DuckDB twice (in parallel within the month) to stream the parquets
 *      from S3 and write the two CSVs.
 *   4. Run importBusObservatoryHeadwaySamples to load samples + snapshots.
 *   5. Run buildRouteObservedReliability to summarize the month.
 *
 * Across months: DuckDB extraction runs in parallel up to --concurrency; SQLite
 * writes (steps 4-5) serialize through an internal mutex because SQLite write
 * contention is the bottleneck.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readBusObservatoryAvailabilityArtifact } from "../check/bus-observatory-availability.js";
import { type CliOption, parseCliOptions } from "../../lib/cli-args.js";
import { defaultArtifactRootPath, fromRepoRoot } from "../../lib/paths.js";

const DUCKDB_BIN = process.env["DUCKDB_BIN"] ?? `${process.env["HOME"]}/.local/bin/duckdb`;
const DEFAULT_CONCURRENCY = 3;

type BackfillArgs = {
  sinceYear?: number;
  sinceMonth?: number;
  untilYear?: number;
  untilMonth?: number;
  concurrency?: number;
  skipExtract?: boolean;
  skipImport?: boolean;
  skipReliability?: boolean;
};

type MonthSpec = { year: number; month: number; label: string };

function parseMonth(value: string | undefined, label: string): { year: number; month: number } {
  if (value === undefined) throw new Error(`Missing required argument: --${label}`);
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) throw new Error(`--${label} must be YYYY-MM, got: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function stepMonth(year: number, month: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function enumerateMonths(since: { year: number; month: number }, until: { year: number; month: number }): MonthSpec[] {
  const out: MonthSpec[] = [];
  let cursor = since;
  while (cursor.year < until.year || (cursor.year === until.year && cursor.month <= until.month)) {
    out.push({ year: cursor.year, month: cursor.month, label: isoMonth(cursor.year, cursor.month) });
    cursor = stepMonth(cursor.year, cursor.month);
  }
  return out;
}

function workingDir(label: string): string {
  return fromRepoRoot(`data/working/bus-observatory/${label}/raw-provenance`);
}

function buildHeadwaySql(urls: string[], year: number, month: number, csvOutPath: string): string {
  const next = stepMonth(year, month);
  const sinceTs = `${isoDate(year, month, 1)} 00:00:00`;
  const untilTs = `${isoDate(next.year, next.month, 1)} 00:00:00`;
  const urlList = urls.map((u) => `    '${u}'`).join(",\n");
  return `SET http_retries = 8;
SET http_retry_wait_ms = 1000;
SET http_retry_backoff = 2;
COPY (
WITH positions AS (
  SELECT
    id AS entity_id,
    epoch("vehicle.timestamp")::BIGINT AS ts,
    "vehicle.trip.route_id" AS route_id,
    cast("vehicle.trip.direction_id" AS INTEGER) AS direction_id,
    "vehicle.stop_id" AS stop_id,
    coalesce("vehicle.vehicle.id", id, "vehicle.trip.trip_id") AS vehicle_key,
    "vehicle.vehicle.id" AS vehicle_id,
    "vehicle.position.latitude" AS latitude,
    "vehicle.position.longitude" AS longitude
  FROM read_parquet([
${urlList}
  ])
  WHERE "vehicle.trip.route_id" IS NOT NULL
    AND "vehicle.stop_id" IS NOT NULL
    AND "vehicle.timestamp" >= TIMESTAMP '${sinceTs}'
    AND "vehicle.timestamp" < TIMESTAMP '${untilTs}'
),
events AS (
  SELECT
    route_id,
    route_id AS source_route_id,
    direction_id,
    stop_id,
    vehicle_key,
    min(vehicle_id) AS vehicle_id,
    min(ts) AS observed_timestamp
  FROM positions
  WHERE vehicle_key IS NOT NULL
  GROUP BY route_id, direction_id, stop_id, vehicle_key
),
ordered_events AS (
  SELECT
    *,
    lag(vehicle_key) OVER w AS previous_vehicle_key,
    lag(observed_timestamp) OVER w AS previous_observed_timestamp
  FROM events
  WINDOW w AS (PARTITION BY route_id, direction_id, stop_id ORDER BY observed_timestamp, vehicle_key)
),
headways AS (
  SELECT
    route_id, source_route_id, direction_id, stop_id,
    previous_vehicle_key, vehicle_key,
    previous_observed_timestamp, observed_timestamp,
    observed_timestamp - previous_observed_timestamp AS headway_seconds
  FROM ordered_events
  WHERE previous_vehicle_key IS NOT NULL
    AND previous_vehicle_key <> vehicle_key
    AND observed_timestamp - previous_observed_timestamp > 0
    AND observed_timestamp - previous_observed_timestamp <= 21600
)
SELECT
  row_number() OVER (ORDER BY route_id, direction_id, stop_id, observed_timestamp, vehicle_key) AS sample_rank,
  route_id, source_route_id, direction_id, stop_id, previous_vehicle_key, vehicle_key,
  previous_observed_timestamp, observed_timestamp, headway_seconds,
  round(headway_seconds / 60.0, 2) AS headway_minutes
FROM headways
) TO '${csvOutPath}' (HEADER, DELIMITER ',');
`;
}

function buildSnapshotsSql(urls: string[], year: number, month: number, csvOutPath: string): string {
  const next = stepMonth(year, month);
  const sinceTs = `${isoDate(year, month, 1)} 00:00:00`;
  const untilTs = `${isoDate(next.year, next.month, 1)} 00:00:00`;
  const urlList = urls.map((u) => `    '${u}'`).join(",\n");
  return `SET http_retries = 8;
SET http_retry_wait_ms = 1000;
SET http_retry_backoff = 2;
COPY (
WITH positions AS (
  SELECT
    epoch("vehicle.timestamp")::BIGINT AS ts,
    floor(epoch("vehicle.timestamp")::BIGINT / 30) * 30 AS bucket_ts,
    "vehicle.trip.route_id" AS route_id,
    cast("vehicle.trip.direction_id" AS INTEGER) AS direction_id,
    "vehicle.stop_id" AS stop_id,
    "vehicle.vehicle.id" AS vehicle_id,
    "vehicle.position.latitude" AS latitude,
    "vehicle.position.longitude" AS longitude
  FROM read_parquet([
${urlList}
  ])
  WHERE "vehicle.timestamp" >= TIMESTAMP '${sinceTs}'
    AND "vehicle.timestamp" < TIMESTAMP '${untilTs}'
),
by_bucket AS (
  SELECT
    bucket_ts AS ts,
    count(*) AS entity_count,
    count(*) AS vehicle_position_count,
    min(route_id) AS route_id,
    min(direction_id) AS direction_id,
    min(vehicle_id) AS vehicle_id,
    min(stop_id) AS stop_id,
    min(latitude) AS latitude,
    min(longitude) AS longitude
  FROM positions
  GROUP BY bucket_ts
)
SELECT
  row_number() OVER (ORDER BY ts) AS sample_index,
  ts AS timestamp, entity_count, vehicle_position_count, route_id AS source_route_id, route_id,
  direction_id, vehicle_id, stop_id, latitude, longitude
FROM by_bucket
ORDER BY ts
) TO '${csvOutPath}' (HEADER, DELIMITER ',');
`;
}

function runDuckDb(sqlPath: string, monthLabel: string, queryLabel: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(DUCKDB_BIN, ["-c", `.read ${sqlPath}`], {
      cwd: fromRepoRoot("."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        process.stdout.write(`backfill: ${monthLabel} ${queryLabel} extract: ok\n`);
        resolve();
      } else {
        reject(new Error(`duckdb ${queryLabel} for ${monthLabel} exited ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

type MutexQueue = {
  acquire(): Promise<() => void>;
};

function createMutex(): MutexQueue {
  let busy = false;
  const waiters: Array<() => void> = [];
  return {
    acquire(): Promise<() => void> {
      return new Promise((resolve) => {
        const grant = (): void => {
          busy = true;
          resolve(() => {
            busy = false;
            const next = waiters.shift();
            if (next !== undefined) next();
          });
        };
        if (busy) waiters.push(grant);
        else grant();
      });
    },
  };
}

async function runMonth(
  spec: MonthSpec,
  args: Required<Pick<BackfillArgs, "skipExtract" | "skipImport" | "skipReliability">>,
  sqliteMutex: MutexQueue,
): Promise<{ label: string; status: "ok" | "skipped" | "error"; note?: string }> {
  const artifactRoot = defaultArtifactRootPath();
  const artifact = await readBusObservatoryAvailabilityArtifact(artifactRoot, spec.label);
  if (artifact === null) {
    return { label: spec.label, status: "error", note: "no availability artifact" };
  }
  if (artifact.objects.length === 0) {
    return { label: spec.label, status: "skipped", note: "no parquet files in S3" };
  }
  const urls = artifact.objects.map((o) => o.url);

  const dir = workingDir(spec.label);
  await mkdir(dir, { recursive: true });
  const headwayCsv = join(dir, "headway-samples.csv");
  const snapshotsCsv = join(dir, "snapshots-30s.csv");
  const headwaySql = join(dir, "build-headway-samples.sql");
  const snapshotsSql = join(dir, "build-snapshots-30s.sql");

  if (!args.skipExtract) {
    await writeFile(headwaySql, buildHeadwaySql(urls, spec.year, spec.month, headwayCsv));
    await writeFile(snapshotsSql, buildSnapshotsSql(urls, spec.year, spec.month, snapshotsCsv));
    process.stdout.write(`backfill: ${spec.label} extract starting (${urls.length} parquets)\n`);
    await runDuckDb(headwaySql, spec.label, "headways");
    await runDuckDb(snapshotsSql, spec.label, "snapshots");
  }

  if (!args.skipImport || !args.skipReliability) {
    const release = await sqliteMutex.acquire();
    try {
      if (!args.skipImport) {
        const { importBusObservatoryHeadwaySamples } = await import(
          "./import-bus-observatory-headway-samples.js"
        );
        process.stdout.write(`backfill: ${spec.label} import starting\n`);
        const importResult = await importBusObservatoryHeadwaySamples({
          year: spec.year,
          month: spec.month,
          runId: `bus-observatory-${spec.label}`,
          headwaySamplesCsv: headwayCsv,
          snapshotsCsv: snapshotsCsv,
        });
        process.stdout.write(
          `backfill: ${spec.label} import: ${importResult.headwaySampleCount} samples, ${importResult.routeCount} routes\n`,
        );
      }
      if (!args.skipReliability) {
        const { buildRouteObservedReliability } = await import(
          "../build/route-observed-reliability.js"
        );
        process.stdout.write(`backfill: ${spec.label} reliability starting\n`);
        const reliabilityResult = await buildRouteObservedReliability({
          year: spec.year,
          month: spec.month,
          runId: `bus-observatory-${spec.label}`,
        });
        process.stdout.write(
          `backfill: ${spec.label} reliability: ${reliabilityResult.observedRouteCount} observed routes\n`,
        );
      }
    } finally {
      release();
    }
  }
  return { label: spec.label, status: "ok" };
}

function parseArgs(args: string[]): BackfillArgs {
  const output: BackfillArgs = {};
  const options: CliOption<BackfillArgs>[] = [
    {
      flags: ["--since"],
      apply: (target, value) => {
        const { year, month } = parseMonth(value, "since");
        target.sinceYear = year;
        target.sinceMonth = month;
      },
    },
    {
      flags: ["--until"],
      apply: (target, value) => {
        const { year, month } = parseMonth(value, "until");
        target.untilYear = year;
        target.untilMonth = month;
      },
    },
    {
      flags: ["--concurrency"],
      apply: (target, value) => {
        target.concurrency = Math.max(1, Number(value));
      },
    },
    {
      flags: ["--skip-extract"],
      value: false,
      apply: (target) => {
        target.skipExtract = true;
      },
    },
    {
      flags: ["--skip-import"],
      value: false,
      apply: (target) => {
        target.skipImport = true;
      },
    },
    {
      flags: ["--skip-reliability"],
      value: false,
      apply: (target) => {
        target.skipReliability = true;
      },
    },
  ];
  return parseCliOptions(args, output, options);
}

export async function backfillBusObservatoryRange(args: BackfillArgs): Promise<{
  monthCount: number;
  results: Array<{ label: string; status: "ok" | "skipped" | "error"; note?: string }>;
}> {
  if (args.sinceYear === undefined || args.sinceMonth === undefined) {
    throw new Error("Missing required argument: --since YYYY-MM");
  }
  if (args.untilYear === undefined || args.untilMonth === undefined) {
    throw new Error("Missing required argument: --until YYYY-MM");
  }
  const months = enumerateMonths(
    { year: args.sinceYear, month: args.sinceMonth },
    { year: args.untilYear, month: args.untilMonth },
  );
  const concurrency = args.concurrency ?? DEFAULT_CONCURRENCY;
  const skip = {
    skipExtract: args.skipExtract === true,
    skipImport: args.skipImport === true,
    skipReliability: args.skipReliability === true,
  };
  const mutex = createMutex();
  const results: Array<{ label: string; status: "ok" | "skipped" | "error"; note?: string }> = [];

  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, months.length); i += 1) {
    workers.push(
      (async () => {
        while (cursor < months.length) {
          const idx = cursor;
          cursor += 1;
          const spec = months[idx];
          if (spec === undefined) break;
          try {
            const result = await runMonth(spec, skip, mutex);
            results.push(result);
          } catch (err) {
            results.push({
              label: spec.label,
              status: "error",
              note: err instanceof Error ? err.message : String(err),
            });
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  results.sort((a, b) => a.label.localeCompare(b.label));
  return { monthCount: months.length, results };
}

export async function backfillBusObservatoryRangeFromCli(args: string[]): Promise<{
  monthCount: number;
  results: Array<{ label: string; status: "ok" | "skipped" | "error"; note?: string }>;
}> {
  return backfillBusObservatoryRange(parseArgs(args));
}

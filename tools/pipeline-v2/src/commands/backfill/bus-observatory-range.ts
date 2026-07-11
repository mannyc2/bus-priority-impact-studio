/**
 * Backfill Bus Observatory recovered GTFS-RT for a range of months.
 *
 * For each month in [--since, --until]:
 *   1. Read the availability artifact (produced by check:bus-observatory-gtfs-rt-range).
 *   2. Generate build-headway-samples.sql and build-snapshots-30s.sql under
 *      data/working/bus-observatory/<YYYY-MM>/raw-provenance/.
 *   3. Run DuckDB twice to stream the parquets from S3 and write the two CSVs.
 *   4. Spawn `cli -- import bus-observatory-headway-samples` to load samples + snapshots.
 *   5. Spawn `cli -- build route-observed-reliability` (in v1 today; ported in batch C).
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { defaultArtifactRootPath, fromRepoRoot } from "../../lib/paths.ts";
import { readBusObservatoryAvailabilityArtifact } from "../check/bus-observatory-gtfs-rt.ts";

const DUCKDB_BIN = process.env["DUCKDB_BIN"] ?? `${process.env["HOME"]}/.local/bin/duckdb`;
const DEFAULT_CONCURRENCY = 3;

export type BackfillBusObservatoryRangeInputs = {
  sinceYear: number;
  sinceMonth: number;
  untilYear: number;
  untilMonth: number;
  concurrency?: number | undefined;
  skipExtract?: boolean | undefined;
  skipImport?: boolean | undefined;
  skipReliability?: boolean | undefined;
};

type MonthSpec = { year: number; month: number; label: string };
type MonthResult = { label: string; status: "ok" | "skipped" | "error"; note?: string };

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

function enumerateMonths(
  since: { year: number; month: number },
  until: { year: number; month: number },
): MonthSpec[] {
  const out: MonthSpec[] = [];
  let cursor = since;
  while (cursor.year < until.year || (cursor.year === until.year && cursor.month <= until.month)) {
    out.push({
      year: cursor.year,
      month: cursor.month,
      label: isoMonth(cursor.year, cursor.month),
    });
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

function buildSnapshotsSql(
  urls: string[],
  year: number,
  month: number,
  csvOutPath: string,
): string {
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
        reject(
          new Error(
            `duckdb ${queryLabel} for ${monthLabel} exited ${code}: ${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

function spawnCli(args: string[], label: string, tag: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["--filter", "@bp/pipeline-v2", "cli", "--", ...args], {
      cwd: fromRepoRoot("."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.stdout.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        process.stdout.write(`backfill: ${label} ${tag}: ok\n`);
        resolve();
      } else {
        reject(new Error(`${tag} for ${label} exited ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

type MutexQueue = { acquire(): Promise<() => void> };

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
  flags: { skipExtract: boolean; skipImport: boolean; skipReliability: boolean },
  sqliteMutex: MutexQueue,
): Promise<MonthResult> {
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

  if (!flags.skipExtract) {
    await writeFile(headwaySql, buildHeadwaySql(urls, spec.year, spec.month, headwayCsv));
    await writeFile(snapshotsSql, buildSnapshotsSql(urls, spec.year, spec.month, snapshotsCsv));
    process.stdout.write(`backfill: ${spec.label} extract starting (${urls.length} parquets)\n`);
    await runDuckDb(headwaySql, spec.label, "headways");
    await runDuckDb(snapshotsSql, spec.label, "snapshots");
  }

  if (!flags.skipImport || !flags.skipReliability) {
    const release = await sqliteMutex.acquire();
    try {
      const runId = `bus-observatory-${spec.label}`;
      if (!flags.skipImport) {
        process.stdout.write(`backfill: ${spec.label} import starting\n`);
        await spawnCli(
          [
            "import",
            "bus-observatory-headway-samples",
            "--year",
            String(spec.year),
            "--month",
            String(spec.month),
            "--run-id",
            runId,
            "--headway-samples-csv",
            headwayCsv,
            "--snapshots-csv",
            snapshotsCsv,
          ],
          spec.label,
          "import",
        );
      }
      if (!flags.skipReliability) {
        process.stdout.write(`backfill: ${spec.label} reliability starting\n`);
        await spawnCli(
          [
            "build",
            "route-observed-reliability",
            "--year",
            String(spec.year),
            "--month",
            String(spec.month),
            "--run-id",
            runId,
          ],
          spec.label,
          "reliability",
        );
      }
    } finally {
      release();
    }
  }
  return { label: spec.label, status: "ok" };
}

export async function runBackfillBusObservatoryRange(
  inputs: BackfillBusObservatoryRangeInputs,
): Promise<{ monthCount: number; results: MonthResult[] }> {
  const months = enumerateMonths(
    { year: inputs.sinceYear, month: inputs.sinceMonth },
    { year: inputs.untilYear, month: inputs.untilMonth },
  );
  const concurrency = inputs.concurrency ?? DEFAULT_CONCURRENCY;
  const flags = {
    skipExtract: inputs.skipExtract === true,
    skipImport: inputs.skipImport === true,
    skipReliability: inputs.skipReliability === true,
  };
  const mutex = createMutex();
  const results: MonthResult[] = [];

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
            results.push(await runMonth(spec, flags, mutex));
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

function parseMonthArg(value: string, label: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) throw new Error(`--${label} must be YYYY-MM, got: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export default defineCommand({
  path: ["backfill", "bus-observatory-range"],
  summary:
    "Backfill Bus Observatory recovered GTFS-RT (extract, import, reliability) across a month range.",
  input: {
    options: Schema.Struct({
      since: Schema.String.check(Schema.isPattern(/^\d{4}-\d{1,2}$/)).annotate({
        description: "Start month, YYYY-MM",
      }),
      until: Schema.String.check(Schema.isPattern(/^\d{4}-\d{1,2}$/)).annotate({
        description: "End month, YYYY-MM",
      }),
      concurrency: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_CONCURRENCY)))
        .annotate({ description: "Per-month concurrency" }),
      skipExtract: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Skip DuckDB extract step" }),
      skipImport: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Skip CSV import step" }),
      skipReliability: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Skip route-observed-reliability build" }),
    }),
  },
  output: Schema.Struct({
    monthCount: Schema.Number,
    results: Schema.Array(
      Schema.Struct({
        label: Schema.String,
        status: Schema.Literals(["ok", "skipped", "error"]),
        note: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
  async run({ input }) {
    const since = parseMonthArg(input.options.since, "since");
    const until = parseMonthArg(input.options.until, "until");
    return runBackfillBusObservatoryRange({
      sinceYear: since.year,
      sinceMonth: since.month,
      untilYear: until.year,
      untilMonth: until.month,
      concurrency: input.options.concurrency,
      skipExtract: input.options.skipExtract,
      skipImport: input.options.skipImport,
      skipReliability: input.options.skipReliability,
    });
  },
});

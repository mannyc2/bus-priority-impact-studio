import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteMonthCoverage } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient } from "@bp/sources";
import * as z from "zod";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type CoverageSourceId = "bus_segment_speeds_2025" | "bus_schedules_2026";

type RouteMonthCoverageArgs = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  workingDir?: string;
  dbPath?: string;
};

type RouteMonthCoverageResult = {
  summaryPath: string;
  routeCount: number;
  speedRouteCount: number;
  scheduleRouteCount: number;
  dbPath: string;
};

const RawSpeedCoverageRowSchema = z
  .object({
    route_id: z.string().min(1),
    observation_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative(),
    average_speed_mph: z.coerce.number().nonnegative(),
  })
  .passthrough();

const RawScheduleCoverageRowSchema = z
  .object({
    route_id: z.string().min(1),
    timepoint_count: z.coerce.number().int().nonnegative(),
  })
  .passthrough();

type CoverageEntry = {
  schemaVersion: typeof schemaVersion;
  routeId: string;
  isoMonth: string;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  hasSpeedData: boolean;
  hasScheduleData: boolean;
};

function parseArgs(args: RouteMonthCoverageArgs = {}): Required<RouteMonthCoverageArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    fetchedAt: args.fetchedAt ?? new Date(),
    fetcher: args.fetcher ?? fetch,
    workingDir: args.workingDir ?? fromRepoRoot(join("data/working/network")),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteMonthCoverageArgs {
  const output: RouteMonthCoverageArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

async function fetchSourceRows(
  source: SocrataManifestSource,
  query: SocrataRowsQuery,
  fetcher: SocrataFetch,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

function normalizeSpeedCoverage(rows: SocrataRow[], month: string): Map<string, CoverageEntry> {
  const entries = new Map<string, CoverageEntry>();

  for (const row of rows) {
    const parsed = RawSpeedCoverageRowSchema.parse(row);
    const routeId = z.decode(RouteIdCodec, parsed.route_id);
    entries.set(routeId, {
      schemaVersion,
      routeId,
      isoMonth: month,
      speedObservationCount: parsed.observation_count,
      speedBusTripCount: parsed.bus_trip_count,
      averageSpeedMph: Math.round(parsed.average_speed_mph * 10_000) / 10_000,
      scheduleTimepointCount: 0,
      hasSpeedData: true,
      hasScheduleData: false,
    });
  }

  return entries;
}

function addScheduleCoverage(
  entries: Map<string, CoverageEntry>,
  rows: SocrataRow[],
  month: string,
): void {
  for (const row of rows) {
    const parsed = RawScheduleCoverageRowSchema.parse(row);
    const routeId = z.decode(RouteIdCodec, parsed.route_id);
    const entry =
      entries.get(routeId) ??
      ({
        schemaVersion,
        routeId,
        isoMonth: month,
        speedObservationCount: 0,
        speedBusTripCount: 0,
        averageSpeedMph: null,
        scheduleTimepointCount: 0,
        hasSpeedData: false,
        hasScheduleData: false,
      } satisfies CoverageEntry);

    entry.scheduleTimepointCount = parsed.timepoint_count;
    entry.hasScheduleData = true;
    entries.set(routeId, entry);
  }
}

export async function ingestRouteMonthCoverage(
  args: RouteMonthCoverageArgs = {},
): Promise<RouteMonthCoverageResult> {
  const options = parseArgs(args);
  const month = isoMonth(options.year, options.month);
  const manifest = await readSourceManifest();
  const speedSource = getSocrataSource(
    manifest,
    "bus_segment_speeds_2025" satisfies CoverageSourceId,
  );
  const scheduleSource = getSocrataSource(
    manifest,
    "bus_schedules_2026" satisfies CoverageSourceId,
  );
  const workingDir = options.workingDir;
  const summaryPath = join(workingDir, `route-month-coverage-${month}-summary.json`);
  const speedQuery: SocrataRowsQuery = {
    select:
      "route_id,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
    where: `year=${options.year} AND month=${options.month}`,
    group: "route_id",
    order: "route_id",
  };
  const scheduleQuery: SocrataRowsQuery = {
    select: "route_id,count(*) as timepoint_count",
    where: "timepoint='1' AND route_id IS NOT NULL",
    group: "route_id",
    order: "route_id",
  };
  const [speedRows, scheduleRows] = await Promise.all([
    fetchSourceRows(speedSource, speedQuery, options.fetcher),
    fetchSourceRows(scheduleSource, scheduleQuery, options.fetcher),
  ]);
  const entries = normalizeSpeedCoverage(speedRows, month);
  addScheduleCoverage(entries, scheduleRows, month);
  const rows = [...entries.values()].sort((left, right) => {
    if (left.averageSpeedMph !== null && right.averageSpeedMph !== null) {
      return (
        left.averageSpeedMph - right.averageSpeedMph || left.routeId.localeCompare(right.routeId)
      );
    }

    return left.routeId.localeCompare(right.routeId);
  });
  const summary = {
    schemaVersion,
    analysisPeriod: month,
    fetchedAt: options.fetchedAt.toISOString(),
    routeCount: rows.length,
    speedRouteCount: rows.filter((row) => row.hasSpeedData).length,
    scheduleRouteCount: rows.filter((row) => row.hasScheduleData).length,
    completeCoverageRouteCount: rows.filter((row) => row.hasSpeedData && row.hasScheduleData)
      .length,
    slowestRoutes: rows.filter((row) => row.averageSpeedMph !== null).slice(0, 10),
    caveats: [
      "Coverage rows are route/month aggregates intended for inventory and batch planning.",
      "Average speed is an unweighted route aggregate from public segment-speed rows; detailed route artifacts compute richer weighted metrics.",
      "All-route ridership aggregation is intentionally not part of this query because the public ridership dataset is too slow for a single uncached all-route monthly aggregate.",
    ],
  };
  const local = await openLocalPipelineDb(options.dbPath);

  try {
    await replaceRouteMonthCoverage(local.db, month, rows);
  } finally {
    local.sqlite.close();
  }

  await mkdir(workingDir, { recursive: true });
  await writeJson(summaryPath, summary);

  return {
    summaryPath,
    routeCount: rows.length,
    speedRouteCount: summary.speedRouteCount,
    scheduleRouteCount: summary.scheduleRouteCount,
    dbPath: local.path,
  };
}

export async function ingestRouteMonthCoverageFromCli(
  args: string[],
): Promise<RouteMonthCoverageResult> {
  return ingestRouteMonthCoverage(parseCliArgs(args));
}

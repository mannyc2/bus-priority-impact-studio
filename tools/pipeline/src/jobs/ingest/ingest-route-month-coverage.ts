import { replaceRouteMonthCoverage } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient } from "@bp/sources";
import * as z from "zod";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type CoverageSourceId = "bus_segment_speeds_2025" | "bus_schedules_2026";

type RouteMonthCoverageArgs = {
  year?: number;
  month?: number;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type RouteMonthCoverageResult = {
  routeCount: number;
  speedRouteCount: number;
  scheduleRouteCount: number;
  completeCoverageRouteCount: number;
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

function parseArgs(
  args: RouteMonthCoverageArgs = {},
): Required<Omit<RouteMonthCoverageArgs, "fetchedAt" | "workingDir">> & { isoMonth: string } {
  return {
    ...createMonthContext(args),
    fetcher: args.fetcher ?? fetch,
  };
}

function parseCliArgs(args: string[]): RouteMonthCoverageArgs {
  return parseMonthDbCliArgs(args, {} as RouteMonthCoverageArgs);
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
  const manifest = await readSourceManifest();
  const speedSource = getSocrataSource(
    manifest,
    "bus_segment_speeds_2025" satisfies CoverageSourceId,
  );
  const scheduleSource = getSocrataSource(
    manifest,
    "bus_schedules_2026" satisfies CoverageSourceId,
  );
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
  const entries = normalizeSpeedCoverage(speedRows, options.isoMonth);
  addScheduleCoverage(entries, scheduleRows, options.isoMonth);
  const rows = [...entries.values()].sort((left, right) => {
    if (left.averageSpeedMph !== null && right.averageSpeedMph !== null) {
      return (
        left.averageSpeedMph - right.averageSpeedMph || left.routeId.localeCompare(right.routeId)
      );
    }

    return left.routeId.localeCompare(right.routeId);
  });
  const speedRouteCount = rows.filter((row) => row.hasSpeedData).length;
  const scheduleRouteCount = rows.filter((row) => row.hasScheduleData).length;
  const completeCoverageRouteCount = rows.filter(
    (row) => row.hasSpeedData && row.hasScheduleData,
  ).length;
  const dbPath = await withLocalPipelineDb(options.dbPath, async (local) => {
    await replaceRouteMonthCoverage(local.db, options.isoMonth, rows);
    return local.path;
  });

  return {
    routeCount: rows.length,
    speedRouteCount,
    scheduleRouteCount,
    completeCoverageRouteCount,
    dbPath,
  };
}

export async function ingestRouteMonthCoverageFromCli(
  args: string[],
): Promise<RouteMonthCoverageResult> {
  return ingestRouteMonthCoverage(parseCliArgs(args));
}

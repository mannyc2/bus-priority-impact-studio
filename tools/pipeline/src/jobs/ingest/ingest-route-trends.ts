import { listRouteBuildPlan, replaceRouteMonthTrends } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient, soqlIn, soqlYearMonthRange } from "@bp/sources";
import * as z from "zod";
import { isoMonth, isoMonthStart, monthRange, nextIsoMonthStart } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type RouteTrendSourceId = "bus_segment_speeds_2025" | "bus_hourly_ridership_2025";

type RouteTrendsArgs = {
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  routes?: string[];
  includeRidership?: boolean;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type RouteTrendsResult = {
  startMonth: string;
  endMonth: string;
  routeCount: number;
  monthCount: number;
  rowCount: number;
  speedRowCount: number;
  ridershipRowCount: number;
  completeTrendRowCount: number;
};

type TrendRow = {
  schemaVersion: typeof schemaVersion;
  routeId: string;
  isoMonth: string;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  ridership: number | null;
  transfers: number | null;
  trendCoverage: {
    speed: boolean;
    ridership: boolean;
  };
};

const RawSpeedTrendRowSchema = z
  .object({
    route_id: z.string().min(1),
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    observation_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative(),
    average_speed_mph: z.coerce.number().nonnegative(),
  })
  .passthrough();

const RawRidershipTrendRowSchema = z
  .object({
    bus_route: z.string().min(1),
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    ridership: z.coerce.number().nonnegative(),
    transfers: z.coerce.number().nonnegative(),
  })
  .passthrough();

function parseArgs(
  args: RouteTrendsArgs = {},
): Required<Omit<RouteTrendsArgs, "fetchedAt" | "workingDir">> {
  return {
    startYear: args.startYear ?? 2025,
    startMonth: args.startMonth ?? 1,
    endYear: args.endYear ?? 2026,
    endMonth: args.endMonth ?? 3,
    routes: args.routes ?? [],
    includeRidership: args.includeRidership ?? true,
    fetcher: args.fetcher ?? fetch,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteTrendsArgs {
  const output: RouteTrendsArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--start-year" && value !== undefined) {
      output.startYear = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--start-month" && value !== undefined) {
      output.startMonth = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--end-year" && value !== undefined) {
      output.endYear = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--end-month" && value !== undefined) {
      output.endMonth = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--routes" && value !== undefined) {
      output.routes = value
        .split(",")
        .map((route) => route.trim())
        .filter((route) => route.length > 0);
      index += 1;
      continue;
    }

    if (arg === "--skip-ridership") {
      output.includeRidership = false;
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

async function routeIdsFromCurrentBatch(
  endYear: number,
  endMonth: number,
  dbPath: string,
): Promise<string[]> {
  const month = isoMonth(endYear, endMonth);
  const local = await openLocalPipelineDb(dbPath);

  try {
    const plan = await listRouteBuildPlan(local.db, month);
    return [...new Set(plan.map((route) => z.decode(RouteIdCodec, route.routeId)))].sort();
  } finally {
    local.sqlite.close();
  }
}

function trendKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function addSpeedRows(entries: Map<string, TrendRow>, rows: SocrataRow[]): void {
  for (const row of rows) {
    const parsed = RawSpeedTrendRowSchema.parse(row);
    const routeId = z.decode(RouteIdCodec, parsed.route_id);
    const month = isoMonth(parsed.year, parsed.month);
    const key = trendKey(routeId, month);
    const entry = entries.get(key) ?? {
      schemaVersion,
      routeId,
      isoMonth: month,
      speedObservationCount: 0,
      speedBusTripCount: 0,
      averageSpeedMph: null,
      ridership: null,
      transfers: null,
      trendCoverage: { speed: false, ridership: false },
    };

    entry.speedObservationCount = parsed.observation_count;
    entry.speedBusTripCount = parsed.bus_trip_count;
    entry.averageSpeedMph = Math.round(parsed.average_speed_mph * 10_000) / 10_000;
    entry.trendCoverage.speed = true;
    entries.set(key, entry);
  }
}

function addRidershipRows(entries: Map<string, TrendRow>, rows: SocrataRow[]): void {
  for (const row of rows) {
    const parsed = RawRidershipTrendRowSchema.parse(row);
    const routeId = z.decode(RouteIdCodec, parsed.bus_route);
    const month = isoMonth(parsed.year, parsed.month);
    const key = trendKey(routeId, month);
    const entry = entries.get(key) ?? {
      schemaVersion,
      routeId,
      isoMonth: month,
      speedObservationCount: 0,
      speedBusTripCount: 0,
      averageSpeedMph: null,
      ridership: null,
      transfers: null,
      trendCoverage: { speed: false, ridership: false },
    };

    entry.ridership = Math.round(parsed.ridership * 10_000) / 10_000;
    entry.transfers = Math.round(parsed.transfers * 10_000) / 10_000;
    entry.trendCoverage.ridership = true;
    entries.set(key, entry);
  }
}

export async function ingestRouteTrends(args: RouteTrendsArgs = {}): Promise<RouteTrendsResult> {
  const options = parseArgs(args);
  const months = monthRange(
    options.startYear,
    options.startMonth,
    options.endYear,
    options.endMonth,
  );
  const routeIds =
    options.routes.length > 0
      ? [...new Set(options.routes.map((route) => z.decode(RouteIdCodec, route)))].sort()
      : await routeIdsFromCurrentBatch(options.endYear, options.endMonth, options.dbPath);

  if (routeIds.length === 0) {
    throw new Error("No route IDs provided and no build plan found for the trend end month.");
  }

  const manifest = await readSourceManifest();
  const speedSource = getSocrataSource(
    manifest,
    "bus_segment_speeds_2025" satisfies RouteTrendSourceId,
  );
  const ridershipSource = options.includeRidership
    ? getSocrataSource(manifest, "bus_hourly_ridership_2025" satisfies RouteTrendSourceId)
    : null;
  const start = months[0];
  const end = months.at(-1);
  if (start === undefined || end === undefined) {
    throw new Error("Trend month range is empty.");
  }

  const speedQuery: SocrataRowsQuery = {
    select:
      "route_id,year,month,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
    where: [
      soqlYearMonthRange(start.year, start.month, end.year, end.month),
      soqlIn("route_id", routeIds),
    ].join(" AND "),
    group: "route_id,year,month",
    order: "route_id,year,month",
  };
  const ridershipQuery: SocrataRowsQuery = {
    select:
      "bus_route,date_extract_y(transit_timestamp) as year,date_extract_m(transit_timestamp) as month,sum(ridership) as ridership,sum(transfers) as transfers",
    where: [
      `transit_timestamp >= '${isoMonthStart(start.year, start.month)}'`,
      `transit_timestamp < '${nextIsoMonthStart(end.year, end.month)}'`,
      soqlIn("bus_route", routeIds),
    ].join(" AND "),
    group: "bus_route,date_extract_y(transit_timestamp),date_extract_m(transit_timestamp)",
    order: "bus_route,year,month",
  };
  const [speedRows, ridershipRows] = await Promise.all([
    fetchSourceRows(speedSource, speedQuery, options.fetcher),
    ridershipSource === null
      ? Promise.resolve([])
      : fetchSourceRows(ridershipSource, ridershipQuery, options.fetcher),
  ]);
  const entries = new Map<string, TrendRow>();
  addSpeedRows(entries, speedRows);
  addRidershipRows(entries, ridershipRows);
  const rows = [...entries.values()].sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) || left.isoMonth.localeCompare(right.isoMonth),
  );
  const startMonth = start.isoMonth;
  const endMonth = end.isoMonth;
  const speedRowCount = rows.filter((row) => row.trendCoverage.speed).length;
  const ridershipRowCount = rows.filter((row) => row.trendCoverage.ridership).length;
  const completeTrendRowCount = rows.filter(
    (row) => row.trendCoverage.speed && row.trendCoverage.ridership,
  ).length;

  const local = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteMonthTrends(
      local.db,
      rows.map((row) => ({
        routeId: row.routeId,
        month: row.isoMonth,
        speedObservationCount: row.speedObservationCount,
        speedBusTripCount: row.speedBusTripCount,
        averageSpeedMph: row.averageSpeedMph,
        ridership: row.ridership,
        transfers: row.transfers,
        hasSpeedTrend: row.trendCoverage.speed,
        hasRidershipTrend: row.trendCoverage.ridership,
      })),
    );
  } finally {
    local.sqlite.close();
  }

  return {
    startMonth,
    endMonth,
    routeCount: routeIds.length,
    monthCount: months.length,
    rowCount: rows.length,
    speedRowCount,
    ridershipRowCount,
    completeTrendRowCount,
  };
}

export function ingestRouteTrendsFromCli(args: string[]): Promise<RouteTrendsResult> {
  return ingestRouteTrends(parseCliArgs(args));
}

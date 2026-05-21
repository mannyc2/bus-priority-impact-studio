import { listRouteBuildPlan, replaceRouteMonthTrends } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient, soqlIn, soqlYearMonthRange } from "@bp/sources";
import * as z from "zod";
import { falseOption, stringListOption } from "../../lib/cli-args.js";
import { isoMonth, isoMonthStart, monthRange, nextIsoMonthStart } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthRangeContext, parseMonthRangeDbCliArgs } from "../../lib/route-job.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type RouteTrendSourceId =
  | "bus_segment_speeds_2023_2024"
  | "bus_segment_speeds_2025"
  | "bus_hourly_ridership_2020_2024"
  | "bus_hourly_ridership_2025";

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

function parseArgs(args: RouteTrendsArgs = {}): Required<
  Omit<RouteTrendsArgs, "fetchedAt" | "workingDir">
> & {
  startIsoMonth: string;
  endIsoMonth: string;
} {
  return {
    ...createMonthRangeContext(args),
    routes: args.routes ?? [],
    includeRidership: args.includeRidership ?? true,
    fetcher: args.fetcher ?? fetch,
  };
}

function parseCliArgs(args: string[]): RouteTrendsArgs {
  return parseMonthRangeDbCliArgs(args, {} as RouteTrendsArgs, [
    stringListOption(["--routes"], (output, value) => {
      output.routes = value;
    }),
    falseOption(["--skip-ridership"], (output) => {
      output.includeRidership = false;
    }),
  ]);
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
  return withLocalPipelineDb(dbPath, async (local) => {
    const plan = await listRouteBuildPlan(local.db, month);
    return [...new Set(plan.map((route) => z.decode(RouteIdCodec, route.routeId)))].sort();
  });
}

function trendKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function compareIsoMonth(left: string, right: string): number {
  return left.localeCompare(right);
}

function clampSourceWindow(
  startMonth: string,
  endMonth: string,
  sourceStartMonth: string,
  sourceEndMonth: string | null,
): { startMonth: string; endMonth: string } | null {
  const clampedStart =
    compareIsoMonth(startMonth, sourceStartMonth) > 0 ? startMonth : sourceStartMonth;
  const clampedEnd =
    sourceEndMonth === null || compareIsoMonth(endMonth, sourceEndMonth) < 0
      ? endMonth
      : sourceEndMonth;

  if (compareIsoMonth(clampedStart, clampedEnd) > 0) {
    return null;
  }

  return { startMonth: clampedStart, endMonth: clampedEnd };
}

function parseIsoMonthParts(value: string): { year: number; month: number } {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Invalid ISO month: ${value}`);
  }

  return { year, month };
}

function sourceWindows<TSourceId extends RouteTrendSourceId>(
  startMonth: string,
  endMonth: string,
  sources: readonly {
    sourceId: TSourceId;
    startMonth: string;
    endMonth: string | null;
  }[],
): {
  sourceId: TSourceId;
  start: { year: number; month: number };
  end: { year: number; month: number };
}[] {
  return sources.flatMap((source) => {
    const window = clampSourceWindow(startMonth, endMonth, source.startMonth, source.endMonth);
    if (window === null) {
      return [];
    }

    return [
      {
        sourceId: source.sourceId,
        start: parseIsoMonthParts(window.startMonth),
        end: parseIsoMonthParts(window.endMonth),
      },
    ];
  });
}

function expandSourceWindowsByMonth<TSourceId extends RouteTrendSourceId>(
  windows: {
    sourceId: TSourceId;
    start: { year: number; month: number };
    end: { year: number; month: number };
  }[],
): {
  sourceId: TSourceId;
  start: { year: number; month: number };
  end: { year: number; month: number };
}[] {
  return windows.flatMap((window) =>
    monthRange(window.start.year, window.start.month, window.end.year, window.end.month).map(
      (month) => ({
        sourceId: window.sourceId,
        start: { year: month.year, month: month.month },
        end: { year: month.year, month: month.month },
      }),
    ),
  );
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
): Promise<U[]> {
  const output: U[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) {
        output[index] = await mapper(value);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, () => worker()),
  );

  return output;
}

function addSpeedRows(
  entries: Map<string, TrendRow>,
  rows: SocrataRow[],
  routeIdSet: ReadonlySet<string>,
): void {
  for (const row of rows) {
    const parsed = RawSpeedTrendRowSchema.parse(row);
    const routeId = z.decode(RouteIdCodec, parsed.route_id);
    if (!routeIdSet.has(routeId)) {
      continue;
    }
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

function addRidershipRows(
  entries: Map<string, TrendRow>,
  rows: SocrataRow[],
  routeIdSet: ReadonlySet<string>,
): void {
  for (const row of rows) {
    const parsed = RawRidershipTrendRowSchema.parse(row);
    const routeId = z.decode(RouteIdCodec, parsed.bus_route);
    if (!routeIdSet.has(routeId)) {
      continue;
    }
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

  const start = months[0];
  const end = months.at(-1);
  if (start === undefined || end === undefined) {
    throw new Error("Trend month range is empty.");
  }

  const manifest = await readSourceManifest();
  const speedWindows = expandSourceWindowsByMonth(
    sourceWindows(start.isoMonth, end.isoMonth, [
      {
        sourceId: "bus_segment_speeds_2023_2024" satisfies RouteTrendSourceId,
        startMonth: "2023-01",
        endMonth: "2024-12",
      },
      {
        sourceId: "bus_segment_speeds_2025" satisfies RouteTrendSourceId,
        startMonth: "2025-01",
        endMonth: null,
      },
    ]),
  );
  const ridershipWindows = options.includeRidership
    ? expandSourceWindowsByMonth(
        sourceWindows(start.isoMonth, end.isoMonth, [
          {
            sourceId: "bus_hourly_ridership_2020_2024" satisfies RouteTrendSourceId,
            startMonth: "2020-01",
            endMonth: "2024-12",
          },
          {
            sourceId: "bus_hourly_ridership_2025" satisfies RouteTrendSourceId,
            startMonth: "2025-01",
            endMonth: null,
          },
        ]),
      )
    : [];

  const routeIdSet = new Set(routeIds);
  const speedRows: SocrataRow[] = [];
  for (const window of speedWindows) {
    const source = getSocrataSource(manifest, window.sourceId);
    const speedWhere = [
      soqlYearMonthRange(window.start.year, window.start.month, window.end.year, window.end.month),
    ];
    if (routeIds.length <= 50) {
      speedWhere.push(soqlIn("route_id", routeIds));
    }
    const query: SocrataRowsQuery = {
      select:
        "route_id,year,month,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
      where: speedWhere.join(" AND "),
      group: "route_id,year,month",
      order: "route_id,year,month",
    };
    speedRows.push(...(await fetchSourceRows(source, query, options.fetcher)));
  }

  const ridershipRows: SocrataRow[] = [];
  const ridershipFetches = ridershipWindows.flatMap((window) =>
    chunkArray(routeIds, 50).map((routeChunk) => ({ window, routeChunk })),
  );
  const ridershipRowBatches = await mapWithConcurrency(ridershipFetches, 4, async (fetchInput) => {
    const source = getSocrataSource(manifest, fetchInput.window.sourceId);
    const query: SocrataRowsQuery = {
      select:
        "bus_route,date_extract_y(transit_timestamp) as year,date_extract_m(transit_timestamp) as month,sum(ridership) as ridership,sum(transfers) as transfers",
      where: [
        `transit_timestamp >= '${isoMonthStart(fetchInput.window.start.year, fetchInput.window.start.month)}'`,
        `transit_timestamp < '${nextIsoMonthStart(fetchInput.window.end.year, fetchInput.window.end.month)}'`,
        soqlIn("bus_route", fetchInput.routeChunk),
      ].join(" AND "),
      group: "bus_route,date_extract_y(transit_timestamp),date_extract_m(transit_timestamp)",
      order: "bus_route,year,month",
    };
    return fetchSourceRows(source, query, options.fetcher);
  });
  ridershipRows.push(...ridershipRowBatches.flat());
  const entries = new Map<string, TrendRow>();
  addSpeedRows(entries, speedRows, routeIdSet);
  addRidershipRows(entries, ridershipRows, routeIdSet);
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

  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteMonthTrends(
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
    ),
  );

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

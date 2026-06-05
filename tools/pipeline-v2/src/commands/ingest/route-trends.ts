import { listRouteBuildPlan, replaceRouteMonthTrends } from "@bp/db/local";
import { soqlIn, soqlYearMonthRange } from "@bp/sources/clients/socrata/soql";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth, isoMonthStart, monthRange, nextIsoMonthStart } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";

const schemaVersion = 1;

type RouteTrendSourceId =
  | "bus_segment_speeds_2023_2024"
  | "bus_segment_speeds_2025"
  | "bus_hourly_ridership_2020_2024"
  | "bus_hourly_ridership_2025";

export type RouteTrendsRunInputs = {
  local: OpenLocalPipelineDb;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  routes: readonly string[];
  includeRidership: boolean;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type RouteTrendsIngestResult = {
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
  trendCoverage: { speed: boolean; ridership: boolean };
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
  if (compareIsoMonth(clampedStart, clampedEnd) > 0) return null;
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
  sources: readonly { sourceId: TSourceId; startMonth: string; endMonth: string | null }[],
) {
  return sources.flatMap((source) => {
    const window = clampSourceWindow(startMonth, endMonth, source.startMonth, source.endMonth);
    if (window === null) return [];
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
) {
  return windows.flatMap((w) =>
    monthRange(w.start.year, w.start.month, w.end.year, w.end.month).map((m) => ({
      sourceId: w.sourceId,
      start: { year: m.year, month: m.month },
      end: { year: m.year, month: m.month },
    })),
  );
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (v: T) => Promise<U>,
): Promise<U[]> {
  const output: U[] = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) output[index] = await mapper(value);
    }
  };
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
    const routeId = parsed.route_id;
    if (!routeIdSet.has(routeId)) continue;
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
    const routeId = parsed.bus_route;
    if (!routeIdSet.has(routeId)) continue;
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

export async function runRouteTrendsIngest(
  inputs: RouteTrendsRunInputs,
): Promise<RouteTrendsIngestResult> {
  const months = monthRange(inputs.startYear, inputs.startMonth, inputs.endYear, inputs.endMonth);
  const start = months[0];
  const end = months.at(-1);
  if (start === undefined || end === undefined) {
    throw new Error("Trend month range is empty.");
  }

  let routeIds: string[];
  if (inputs.routes.length > 0) {
    routeIds = [...new Set(inputs.routes)].sort();
  } else {
    const plan = await listRouteBuildPlan(
      inputs.local.db,
      isoMonth(inputs.endYear, inputs.endMonth),
    );
    routeIds = [...new Set(plan.map((r) => r.routeId))].sort();
  }
  if (routeIds.length === 0) {
    throw new Error("No route IDs provided and no build plan found for the trend end month.");
  }

  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);

  const speedWindows = expandSourceWindowsByMonth(
    sourceWindows(start.isoMonth, end.isoMonth, [
      { sourceId: "bus_segment_speeds_2023_2024", startMonth: "2023-01", endMonth: "2024-12" },
      { sourceId: "bus_segment_speeds_2025", startMonth: "2025-01", endMonth: null },
    ]),
  );
  const ridershipWindows = inputs.includeRidership
    ? expandSourceWindowsByMonth(
        sourceWindows(start.isoMonth, end.isoMonth, [
          {
            sourceId: "bus_hourly_ridership_2020_2024",
            startMonth: "2020-01",
            endMonth: "2024-12",
          },
          { sourceId: "bus_hourly_ridership_2025", startMonth: "2025-01", endMonth: null },
        ]),
      )
    : [];

  const routeIdSet = new Set(routeIds);

  const speedRows: SocrataRow[] = [];
  for (const window of speedWindows) {
    const source = getSocrataSource(manifest, window.sourceId);
    const whereParts = [
      soqlYearMonthRange(window.start.year, window.start.month, window.end.year, window.end.month),
    ];
    if (routeIds.length <= 50) whereParts.push(soqlIn("route_id", routeIds));
    const query: Soda3SoqlQuery = {
      select:
        "route_id,year,month,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
      where: whereParts.join(" AND "),
      group: "route_id,year,month",
      order: "route_id,year,month",
    };
    speedRows.push(...(await fetchSoda3RowsForSource(source, query, { fetcher: inputs.fetcher })));
  }

  const ridershipFetches = ridershipWindows.flatMap((window) =>
    chunkArray(routeIds, 50).map((routeChunk) => ({ window, routeChunk })),
  );
  const ridershipRowBatches = await mapWithConcurrency(ridershipFetches, 4, async (f) => {
    const source = getSocrataSource(manifest, f.window.sourceId);
    const query: Soda3SoqlQuery = {
      select:
        "bus_route,date_extract_y(transit_timestamp) as year,date_extract_m(transit_timestamp) as month,sum(ridership) as ridership,sum(transfers) as transfers",
      where: [
        `transit_timestamp >= '${isoMonthStart(f.window.start.year, f.window.start.month)}'`,
        `transit_timestamp < '${nextIsoMonthStart(f.window.end.year, f.window.end.month)}'`,
        soqlIn("bus_route", f.routeChunk),
      ].join(" AND "),
      group: "bus_route,date_extract_y(transit_timestamp),date_extract_m(transit_timestamp)",
      order: "bus_route,year,month",
    };
    return fetchSoda3RowsForSource(source, query, { fetcher: inputs.fetcher });
  });
  const ridershipRows: SocrataRow[] = ridershipRowBatches.flat();

  const entries = new Map<string, TrendRow>();
  addSpeedRows(entries, speedRows, routeIdSet);
  addRidershipRows(entries, ridershipRows, routeIdSet);
  const rows = [...entries.values()].sort(
    (l, r) => l.routeId.localeCompare(r.routeId) || l.isoMonth.localeCompare(r.isoMonth),
  );

  await replaceRouteMonthTrends(
    inputs.local.db,
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

  return {
    startMonth: start.isoMonth,
    endMonth: end.isoMonth,
    routeCount: routeIds.length,
    monthCount: months.length,
    rowCount: rows.length,
    speedRowCount: rows.filter((r) => r.trendCoverage.speed).length,
    ridershipRowCount: rows.filter((r) => r.trendCoverage.ridership).length,
    completeTrendRowCount: rows.filter((r) => r.trendCoverage.speed && r.trendCoverage.ridership)
      .length,
  };
}

export default defineCommand({
  path: ["ingest", "route-trends"],
  summary: "Fetch monthly speed and ridership trends for build-plan routes across a month range.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start of year range"),
      startMonth: arg.positiveInt().default(1).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End of year range"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      routes: z
        .array(z.string())
        .default([])
        .describe("Specific route IDs (default: read from build plan)"),
      skipRidership: z.coerce.boolean().default(false).describe("Skip the ridership trend fetch"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    routeCount: z.number(),
    monthCount: z.number(),
    rowCount: z.number(),
    speedRowCount: z.number(),
    ridershipRowCount: z.number(),
    completeTrendRowCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runRouteTrendsIngest({
      local: localDbFromCtx(ctx),
      startYear: input.options.startYear,
      startMonth: input.options.startMonth,
      endYear: input.options.endYear,
      endMonth: input.options.endMonth,
      routes: input.options.routes,
      includeRidership: !input.options.skipRidership,
    });
  },
});

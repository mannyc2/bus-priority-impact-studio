import { listRouteBuildPlan, replaceRouteMonthTrends } from "@bp/db/local";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runBoundedPromises } from "../../effect/concurrency.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth, isoMonthStart, monthRange, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { mergeRoutesWithFile } from "../../lib/route-list.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
  soqlIn,
} from "../../lib/soda3.ts";

const schemaVersion = 1;

type RouteTrendSourceId = "bus_hourly_ridership_2020_2024" | "bus_hourly_ridership_2025";

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
  monthsWithoutCellSpeedCoverage: string[];
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

type LocalSpeedTrendRow = {
  route_id: string;
  month: string;
  observation_count: number;
  bus_trip_count: number;
  average_speed_mph: number | null;
};

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

function addSpeedRows(
  entries: Map<string, TrendRow>,
  rows: readonly LocalSpeedTrendRow[],
  routeIdSet: ReadonlySet<string>,
): void {
  for (const parsed of rows) {
    const routeId = parsed.route_id;
    if (!routeIdSet.has(routeId)) continue;
    const month = parsed.month;
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
    entry.averageSpeedMph =
      parsed.average_speed_mph === null
        ? null
        : Math.round(parsed.average_speed_mph * 10_000) / 10_000;
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

  // Speed aggregates are a projection of local_route_segment_speed_cell; the golden-diff
  // command (build route-month-speed-golden-diff) proves byte-identity with the prior
  // Socrata server-side aggregation.
  const speedRows = inputs.local.sqlite
    .query(
      `SELECT route_id, month,
              COUNT(*) AS observation_count,
              SUM(bus_trip_count) AS bus_trip_count,
              AVG(average_road_speed_mph) AS average_speed_mph
       FROM local_route_segment_speed_cell
       WHERE month >= ? AND month <= ?
       GROUP BY route_id, month
       ORDER BY route_id, month`,
    )
    .all(start.isoMonth, end.isoMonth) as LocalSpeedTrendRow[];
  const coveredMonths = new Set(speedRows.map((row) => row.month));
  const monthsWithoutCellSpeedCoverage = months
    .map((m) => m.isoMonth)
    .filter((m) => !coveredMonths.has(m));

  const ridershipFetches = ridershipWindows.flatMap((window) =>
    chunkArray(routeIds, 50).map((routeChunk) => ({ window, routeChunk })),
  );
  const ridershipRowBatches = await runBoundedPromises(ridershipFetches, 4, async (f) => {
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
    monthsWithoutCellSpeedCoverage,
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
      routesFile: z.string().optional().describe("JSON file containing route IDs"),
      skipRidership: z.coerce.boolean().default(false).describe("Skip the ridership trend fetch"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    routeCount: z.number(),
    monthCount: z.number(),
    rowCount: z.number(),
    speedRowCount: z.number(),
    ridershipRowCount: z.number(),
    completeTrendRowCount: z.number(),
    monthsWithoutCellSpeedCoverage: z.array(z.string()),
  }),
  async run({ input }) {
    const routes = await mergeRoutesWithFile(input.options.routes, input.options.routesFile);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.route-trends",
      operation: "runRouteTrendsIngest",
      spanAttributes: {
        startYear: input.options.startYear,
        startMonth: input.options.startMonth,
        endYear: input.options.endYear,
        endMonth: input.options.endMonth,
        routeCount: routes.length,
        includeRidership: !input.options.skipRidership,
      },
      run: (local) =>
        runRouteTrendsIngest({
          local,
          startYear: input.options.startYear,
          startMonth: input.options.startMonth,
          endYear: input.options.endYear,
          endMonth: input.options.endMonth,
          routes,
          includeRidership: !input.options.skipRidership,
        }),
    });
  },
});

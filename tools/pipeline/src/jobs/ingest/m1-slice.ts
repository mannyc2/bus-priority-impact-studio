import { join } from "node:path";
import {
  replaceRouteHourlyRidership,
  replaceRouteSegmentSpeeds,
  replaceRouteStops,
} from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import {
  getSocrataSource,
  normalizeHourlyRidershipRows,
  normalizeRouteShapeRows,
  normalizeSegmentSpeedRows,
  normalizeStopRows,
  SocrataClient,
} from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import {
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
const defaultRouteId = z.decode(RouteIdCodec, "M1");
const defaultYear = 2026;
const defaultMonth = 3;

type SliceSourceId =
  | "bus_segment_speeds_2025"
  | "current_bus_routes"
  | "current_bus_stops"
  | "bus_hourly_ridership_2025";

type RouteSliceArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type RouteSliceOptions = {
  routeId: string;
  year: number;
  month: number;
  fetchedAt: Date;
  fetcher?: SocrataFetch;
  dbPath: string;
};

type RouteSliceOutput = {
  rawDir: string;
  summary: {
    schemaVersion: typeof schemaVersion;
    routeId: string;
    isoMonth: string;
    fetchedAt: string;
    raw: Record<SliceSourceId, { rowCount: number; path: string }>;
    normalized: {
      segmentSpeedCount: number;
      routeShapeCount: number;
      stopCount: number;
      timepointStopCount: number;
      ridershipWindowCount: number;
      totalRidership: number;
      totalTransfers: number;
    };
  };
};

function assertMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Month must be an integer from 1 to 12. Received: ${month}`);
  }

  return month;
}

function assertYear(year: number): number {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error(`Year must be an integer from 2020 to 2100. Received: ${year}`);
  }

  return year;
}

function lowerSliceKey(routeId: string, year: number, month: number): string {
  return routeSliceKey(routeId, isoMonth(year, month));
}

function normalizeOptions(args: RouteSliceArgs = {}): RouteSliceOptions {
  const output: RouteSliceOptions = {
    routeId: args.routeId === undefined ? defaultRouteId : z.decode(RouteIdCodec, args.routeId),
    year: assertYear(args.year ?? defaultYear),
    month: assertMonth(args.month ?? defaultMonth),
    fetchedAt: args.fetchedAt ?? new Date(),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };

  if (args.fetcher !== undefined) {
    output.fetcher = args.fetcher;
  }

  return output;
}

async function fetchSourceRows(
  source: SocrataManifestSource,
  query: SocrataRowsQuery,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestM1RouteSlice(args: RouteSliceArgs = {}): Promise<RouteSliceOutput> {
  const options = normalizeOptions(args);
  const manifest = await readSourceManifest();
  const routeWhere = `route_id='${options.routeId}'`;
  const inEffectRouteWhere = `${routeWhere} AND in_effect='true'`;
  const segmentWhere = `${routeWhere} AND year=${options.year} AND month=${options.month}`;
  const ridershipWhere = [
    `bus_route='${options.routeId}'`,
    `transit_timestamp >= '${isoMonthStart(options.year, options.month)}'`,
    `transit_timestamp < '${nextIsoMonthStart(options.year, options.month)}'`,
  ].join(" AND ");
  const speedSource = getSocrataSource(manifest, "bus_segment_speeds_2025" satisfies SliceSourceId);
  const routeSource = getSocrataSource(manifest, "current_bus_routes" satisfies SliceSourceId);
  const stopSource = getSocrataSource(manifest, "current_bus_stops" satisfies SliceSourceId);
  const ridershipSource = getSocrataSource(
    manifest,
    "bus_hourly_ridership_2025" satisfies SliceSourceId,
  );
  const fetchedAt = options.fetchedAt.toISOString();
  const key = lowerSliceKey(options.routeId, options.year, options.month);
  const rawDir = fromRepoRoot(join("data/raw/route-slices", key));

  const speedQuery = {
    where: segmentWhere,
    order: "direction, stop_order, day_of_week, hour_of_day, timepoint_stop_id",
  };
  const routeQuery = {
    where: inEffectRouteWhere,
    order: "direction_id, shape_id",
  };
  const stopQuery = {
    where: inEffectRouteWhere,
    order: "direction_id, stop_id",
  };
  const ridershipQuery = {
    select:
      "date_extract_dow(transit_timestamp) as day_of_week_index,date_extract_hh(transit_timestamp) as hour_of_day,sum(ridership) as ridership,sum(transfers) as transfers",
    where: ridershipWhere,
    group: "date_extract_dow(transit_timestamp),date_extract_hh(transit_timestamp)",
    order: "day_of_week_index,hour_of_day",
  };
  const [speedRows, routeRows, stopRows, ridershipRows] = await Promise.all([
    fetchSourceRows(speedSource, speedQuery, options.fetcher),
    fetchSourceRows(routeSource, routeQuery, options.fetcher),
    fetchSourceRows(stopSource, stopQuery, options.fetcher),
    fetchSourceRows(ridershipSource, ridershipQuery, options.fetcher),
  ]);
  const segmentSpeeds = normalizeSegmentSpeedRows(speedRows);
  const routeShapes = normalizeRouteShapeRows(routeRows);
  const stops = normalizeStopRows(stopRows);
  const ridership = normalizeHourlyRidershipRows(ridershipRows, {
    routeId: options.routeId,
    year: options.year,
    month: options.month,
  });
  const rawPaths: Record<SliceSourceId, string> = {
    bus_segment_speeds_2025: join(rawDir, "bus_segment_speeds_2025.json"),
    current_bus_routes: join(rawDir, "current_bus_routes.json"),
    current_bus_stops: join(rawDir, "current_bus_stops.json"),
    bus_hourly_ridership_2025: join(rawDir, "bus_hourly_ridership_2025.json"),
  };
  const totalRidership = ridership.reduce((sum, row) => sum + row.ridership, 0);
  const totalTransfers = ridership.reduce((sum, row) => sum + row.transfers, 0);
  const summary: RouteSliceOutput["summary"] = {
    schemaVersion,
    routeId: options.routeId,
    isoMonth: isoMonth(options.year, options.month),
    fetchedAt,
    raw: {
      bus_segment_speeds_2025: {
        rowCount: speedRows.length,
        path: rawPaths.bus_segment_speeds_2025,
      },
      current_bus_routes: {
        rowCount: routeRows.length,
        path: rawPaths.current_bus_routes,
      },
      current_bus_stops: {
        rowCount: stopRows.length,
        path: rawPaths.current_bus_stops,
      },
      bus_hourly_ridership_2025: {
        rowCount: ridershipRows.length,
        path: rawPaths.bus_hourly_ridership_2025,
      },
    },
    normalized: {
      segmentSpeedCount: segmentSpeeds.length,
      routeShapeCount: routeShapes.length,
      stopCount: stops.length,
      timepointStopCount: stops.filter((stop) => stop.timepoint).length,
      ridershipWindowCount: ridership.length,
      totalRidership,
      totalTransfers,
    },
  };
  const local = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteSegmentSpeeds(local.db, options.routeId, summary.isoMonth, segmentSpeeds);
    await replaceRouteHourlyRidership(local.db, options.routeId, summary.isoMonth, ridership);
    await replaceRouteStops(
      local.db,
      options.routeId,
      summary.isoMonth,
      stops.map((stop) => ({ ...stop, isoMonth: summary.isoMonth })),
    );
  } finally {
    local.sqlite.close();
  }

  await Promise.all([
    writeRawSourceSnapshot({
      path: rawPaths.bus_segment_speeds_2025,
      sourceId: "bus_segment_speeds_2025",
      fetchedAt,
      query: speedQuery,
      rows: speedRows,
    }),
    writeRawSourceSnapshot({
      path: rawPaths.current_bus_routes,
      sourceId: "current_bus_routes",
      fetchedAt,
      query: routeQuery,
      rows: routeRows,
    }),
    writeRawSourceSnapshot({
      path: rawPaths.current_bus_stops,
      sourceId: "current_bus_stops",
      fetchedAt,
      query: stopQuery,
      rows: stopRows,
    }),
    writeRawSourceSnapshot({
      path: rawPaths.bus_hourly_ridership_2025,
      sourceId: "bus_hourly_ridership_2025",
      fetchedAt,
      query: ridershipQuery,
      rows: ridershipRows,
    }),
  ]);

  return {
    rawDir,
    summary,
  };
}

export function parseM1SliceCliArgs(args: string[]): RouteSliceArgs {
  return parseCliOptions(args, {} as RouteSliceArgs, [
    routeOption(),
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
}

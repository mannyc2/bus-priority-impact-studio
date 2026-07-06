import {
  type LocalRouteHourlyRidership,
  listRouteMonthTrends,
  replaceRouteHourlyRidership,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeHourlyRidershipRows } from "@bp/sources/adapters/mta/bus-ridership";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runBoundedPromises } from "../../effect/concurrency.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { mergeRoutesWithFile } from "../../lib/route-list.ts";
import {
  createSoda3SourceClient,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
  soqlIn,
} from "../../lib/soda3.ts";

type HourlyRidershipSourceId = "bus_hourly_ridership_2020_2024" | "bus_hourly_ridership_2025";

const DEFAULT_ROUTE_CHUNK_SIZE = 5;
const DEFAULT_QUERY_CONCURRENCY = 4;

export type RouteHourlyRidershipIngestInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  routes: readonly string[];
  routeChunkSize?: number | undefined;
  queryConcurrency?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type RouteHourlyRidershipIngestResult = {
  month: string;
  sourceId: HourlyRidershipSourceId;
  fetchedRowCount: number;
  normalizedRowCount: number;
  routeCount: number;
};

function sourceIdForMonth(month: string): HourlyRidershipSourceId {
  return month < "2025-01" ? "bus_hourly_ridership_2020_2024" : "bus_hourly_ridership_2025";
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function rowsByRoute(
  rows: readonly LocalRouteHourlyRidership[],
): Map<string, LocalRouteHourlyRidership[]> {
  const output = new Map<string, LocalRouteHourlyRidership[]>();
  for (const row of rows) {
    output.set(row.routeId, [...(output.get(row.routeId) ?? []), row]);
  }
  return output;
}

function sortRidershipRows(
  left: LocalRouteHourlyRidership,
  right: LocalRouteHourlyRidership,
): number {
  return left.dayOfWeek.localeCompare(right.dayOfWeek) || left.hourOfDay - right.hourOfDay;
}

export function normalizeRouteHourlyRidershipRows(
  rows: SocrataRow[],
  args: { year: number; month: number },
): LocalRouteHourlyRidership[] {
  const month = isoMonth(args.year, args.month);
  const rowsByRawRoute = new Map<string, SocrataRow[]>();
  const busRouteField = "bus_route";
  for (const row of rows) {
    const routeId = row[busRouteField];
    if (typeof routeId !== "string" || routeId.length === 0) continue;
    rowsByRawRoute.set(routeId, [...(rowsByRawRoute.get(routeId) ?? []), row]);
  }

  return [...rowsByRawRoute.entries()]
    .flatMap(([routeId, routeRows]) =>
      normalizeHourlyRidershipRows(routeRows, {
        routeId,
        year: args.year,
        month: args.month,
      }),
    )
    .filter((row) => row.isoMonth === month)
    .map(({ schemaVersion: _schemaVersion, ...row }) => row)
    .sort(
      (left, right) => left.routeId.localeCompare(right.routeId) || sortRidershipRows(left, right),
    );
}

async function routeIdsForMonth(input: {
  local: OpenLocalPipelineDb;
  month: string;
  providedRoutes: readonly string[];
}): Promise<string[]> {
  if (input.providedRoutes.length > 0) return [...new Set(input.providedRoutes)].sort();
  const trendRows = await listRouteMonthTrends(input.local.db);
  return [
    ...new Set(trendRows.filter((row) => row.month === input.month).map((row) => row.routeId)),
  ].sort();
}

export async function runRouteHourlyRidershipIngest(
  inputs: RouteHourlyRidershipIngestInputs,
): Promise<RouteHourlyRidershipIngestResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const sourceId = sourceIdForMonth(month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const source = getSocrataSource(manifest, sourceId);
  const routeIds = await routeIdsForMonth({
    local: inputs.local,
    month,
    providedRoutes: inputs.routes,
  });
  const routeChunkSize = inputs.routeChunkSize ?? DEFAULT_ROUTE_CHUNK_SIZE;
  const queryConcurrency = inputs.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY;
  const client = createSoda3SourceClient(source, { fetcher: inputs.fetcher });
  const rawRows: SocrataRow[] = [];
  const routeChunks = chunkArray(routeIds, routeChunkSize);
  for (const queryChunk of chunkArray(routeChunks, queryConcurrency)) {
    const rowGroups = await runBoundedPromises(queryChunk, queryConcurrency, (routeChunk) => {
      const query: Soda3SoqlQuery = {
        select:
          "bus_route,date_extract_dow(transit_timestamp) as day_of_week_index,date_extract_hh(transit_timestamp) as hour_of_day,sum(ridership) as ridership,sum(transfers) as transfers",
        where: [
          `transit_timestamp >= '${isoMonthStart(inputs.year, inputs.month)}'`,
          `transit_timestamp < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
          soqlIn("bus_route", routeChunk),
        ].join(" AND "),
        group: "bus_route,date_extract_dow(transit_timestamp),date_extract_hh(transit_timestamp)",
        order: "bus_route,day_of_week_index,hour_of_day",
      };
      return client.rows(query);
    });
    rawRows.push(...rowGroups.flat());
  }
  const normalizedRows = normalizeRouteHourlyRidershipRows(rawRows, {
    year: inputs.year,
    month: inputs.month,
  });
  const byRoute = rowsByRoute(normalizedRows);

  for (const routeId of routeIds) {
    const rows = byRoute.get(routeId) ?? [];
    await replaceRouteHourlyRidership(inputs.local.db, routeId, month, rows);
  }

  return {
    month,
    sourceId,
    fetchedRowCount: rawRows.length,
    normalizedRowCount: normalizedRows.length,
    routeCount: routeIds.length,
  };
}

export default defineCommand({
  path: ["ingest", "route-hourly-ridership"],
  summary: "Fetch route hourly ridership rows for a month and replace local route/month slices.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Year to ingest"),
      month: arg.positiveInt().default(3).describe("Month to ingest, 1-12"),
      route: z.string().optional().describe("Single route ID convenience filter"),
      routes: z
        .array(z.string())
        .default([])
        .describe("Specific route IDs (default: all routes in source month)"),
      routesFile: z.string().optional().describe("JSON file containing route IDs"),
      routeChunkSize: arg
        .positiveInt()
        .default(DEFAULT_ROUTE_CHUNK_SIZE)
        .describe("Number of routes per Socrata aggregate query"),
      queryConcurrency: arg
        .positiveInt()
        .default(DEFAULT_QUERY_CONCURRENCY)
        .describe("Number of Socrata hourly-ridership aggregate queries to run concurrently"),
    }),
  },
  output: z.object({
    month: z.string(),
    sourceId: z.enum(["bus_hourly_ridership_2020_2024", "bus_hourly_ridership_2025"]),
    fetchedRowCount: z.number(),
    normalizedRowCount: z.number(),
    routeCount: z.number(),
  }),
  async run({ input }) {
    const routes = await mergeRoutesWithFile(
      input.options.route === undefined
        ? input.options.routes
        : [...input.options.routes, input.options.route],
      input.options.routesFile,
    );
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.route-hourly-ridership",
      operation: "runRouteHourlyRidershipIngest",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        routeCount: routes.length,
        routeChunkSize: input.options.routeChunkSize,
        queryConcurrency: input.options.queryConcurrency,
      },
      run: (local) =>
        runRouteHourlyRidershipIngest({
          local,
          year: input.options.year,
          month: input.options.month,
          routes,
          routeChunkSize: input.options.routeChunkSize,
          queryConcurrency: input.options.queryConcurrency,
        }),
    });
  },
});

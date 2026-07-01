import { listRouteMonthTrends, replaceRouteMonthTrends } from "@bp/db/local";
import { soqlQuote } from "@bp/sources/clients/socrata/soql";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { mergeRoutesWithFile } from "../../lib/route-list.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";

type TrendRow = Awaited<ReturnType<typeof listRouteMonthTrends>>[number];
type RidershipSourceId = "bus_hourly_ridership_2020_2024" | "bus_hourly_ridership_2025";

const RawRidershipAggregateSchema = z
  .object({
    bus_route: z.string().min(1).optional(),
    ridership: z.coerce.number().nonnegative().optional(),
    transfers: z.coerce.number().nonnegative().optional(),
  })
  .passthrough();

export type BackfillRouteRidershipTrendsInputs = {
  local: OpenLocalPipelineDb;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  routes?: string[] | undefined;
  limit?: number | undefined;
  concurrency?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type BackfillRouteRidershipTrendsResult = {
  startMonth: string;
  endMonth: string;
  attemptedChunkCount: number;
  updatedRowCount: number;
  failedRowCount: number;
  remainingRidershipMissingCount: number;
};

function parseIsoMonth(month: string): { year: number; month: number } {
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) {
    throw new Error(`Invalid ISO month: ${month}`);
  }
  return { year, month: monthNumber };
}

function inRange(row: TrendRow, startMonth: string, endMonth: string): boolean {
  return row.month >= startMonth && row.month <= endMonth;
}

function ridershipSourceIdForMonth(month: string): RidershipSourceId {
  return month < "2025-01" ? "bus_hourly_ridership_2020_2024" : "bus_hourly_ridership_2025";
}

function trendKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchRidershipAggregates(input: {
  sources: ReadonlyMap<RidershipSourceId, SocrataManifestSource>;
  routeIds: readonly string[];
  isoMonth: string;
  fetcher: SocrataFetch;
}): Promise<Map<string, { ridership: number; transfers: number }>> {
  const parsedMonth = parseIsoMonth(input.isoMonth);
  const sourceId = ridershipSourceIdForMonth(input.isoMonth);
  const source = input.sources.get(sourceId);
  if (source === undefined) {
    throw new Error(`Missing ridership source: ${sourceId}`);
  }
  const query: Soda3SoqlQuery = {
    select: "bus_route,sum(ridership) as ridership,sum(transfers) as transfers",
    where: [
      `bus_route in(${input.routeIds.map(soqlQuote).join(",")})`,
      `transit_timestamp >= ${soqlQuote(isoMonthStart(parsedMonth.year, parsedMonth.month))}`,
      `transit_timestamp < ${soqlQuote(nextIsoMonthStart(parsedMonth.year, parsedMonth.month))}`,
    ].join(" AND "),
    group: "bus_route",
    order: "bus_route",
  };
  const rows = await fetchSoda3RowsForSource(source, query, { fetcher: input.fetcher });
  const output = new Map<string, { ridership: number; transfers: number }>();
  for (const row of rows) {
    const parsed = RawRidershipAggregateSchema.parse(row);
    if (parsed.bus_route === undefined) continue;
    output.set(parsed.bus_route, {
      ridership: Math.round((parsed.ridership ?? 0) * 10_000) / 10_000,
      transfers: Math.round((parsed.transfers ?? 0) * 10_000) / 10_000,
    });
  }
  return output;
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
      if (value !== undefined) output[index] = await mapper(value);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, () => worker()),
  );
  return output;
}

export async function runBackfillRouteRidershipTrends(
  inputs: BackfillRouteRidershipTrendsInputs,
): Promise<BackfillRouteRidershipTrendsResult> {
  const startMonth = isoMonth(inputs.startYear, inputs.startMonth);
  const endMonth = isoMonth(inputs.endYear, inputs.endMonth);
  const routes = inputs.routes ?? [];
  const limit = inputs.limit ?? Number.POSITIVE_INFINITY;
  const concurrency = inputs.concurrency ?? 4;
  const fetcher = inputs.fetcher ?? fetch;
  const routeFilter = new Set<string>(routes);
  const existingRows = await listRouteMonthTrends(inputs.local.db);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const sources = new Map<RidershipSourceId, SocrataManifestSource>([
    [
      "bus_hourly_ridership_2020_2024",
      getSocrataSource(manifest, "bus_hourly_ridership_2020_2024"),
    ],
    ["bus_hourly_ridership_2025", getSocrataSource(manifest, "bus_hourly_ridership_2025")],
  ]);
  const rangeRows = existingRows.filter((row) => inRange(row, startMonth, endMonth));
  const candidates = rangeRows
    .filter((row) => !row.hasRidershipTrend)
    .filter((row) => routeFilter.size === 0 || routeFilter.has(row.routeId))
    .slice(0, limit);
  const candidatesByMonth = new Map<string, TrendRow[]>();
  for (const row of candidates) {
    candidatesByMonth.set(row.month, [...(candidatesByMonth.get(row.month) ?? []), row]);
  }
  const fetchBatches = [...candidatesByMonth.entries()].flatMap(([month, rows]) =>
    chunkArray(rows, 50).map((chunk) => ({ month, rows: chunk })),
  );
  let completedBatchCount = 0;
  const updateBatches = await mapWithConcurrency(fetchBatches, concurrency, async (batch) => {
    try {
      const aggregateByRoute = await fetchRidershipAggregates({
        sources,
        routeIds: batch.rows.map((row) => row.routeId),
        isoMonth: batch.month,
        fetcher,
      });
      return batch.rows.map((row) => ({
        row,
        ...(aggregateByRoute.get(row.routeId) ?? { ridership: 0, transfers: 0 }),
      }));
    } catch (error) {
      console.error(
        `ridership trend backfill: failed ${batch.month} (${batch.rows.length} routes): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    } finally {
      completedBatchCount += 1;
      if (completedBatchCount === fetchBatches.length || completedBatchCount % 10 === 0) {
        console.error(
          `ridership trend backfill: ${completedBatchCount}/${fetchBatches.length} source batches attempted`,
        );
      }
    }
  });
  const successfulUpdates = updateBatches.flatMap((update) => update ?? []);
  const updateByKey = new Map(
    successfulUpdates.map((update) => [trendKey(update.row.routeId, update.row.month), update]),
  );
  const rows: TrendRow[] = existingRows.map((row) => {
    const update = updateByKey.get(trendKey(row.routeId, row.month));
    if (update === undefined) return row;
    return {
      ...row,
      ridership: update.ridership,
      transfers: update.transfers,
      hasRidershipTrend: true,
    };
  });
  const outputRows = rows.filter((row) => inRange(row, startMonth, endMonth));
  const remainingRidershipMissingCount = outputRows.filter((row) => !row.hasRidershipTrend).length;

  await replaceRouteMonthTrends(inputs.local.db, rows);

  return {
    startMonth,
    endMonth,
    attemptedChunkCount: candidates.length,
    updatedRowCount: successfulUpdates.length,
    failedRowCount: candidates.length - successfulUpdates.length,
    remainingRidershipMissingCount,
  };
}

export default defineCommand({
  path: ["backfill", "route-ridership-trends"],
  summary: "Backfill missing ridership values on route_month_trends across a month range.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(1).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      routes: z.array(z.string()).default([]).describe("Specific route IDs (default: all)"),
      routesFile: z.string().optional().describe("JSON file containing route IDs"),
      limit: arg.positiveInt().optional().describe("Cap on candidate rows"),
      concurrency: arg.positiveInt().default(4).describe("Concurrent Socrata fetches"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    attemptedChunkCount: z.number(),
    updatedRowCount: z.number(),
    failedRowCount: z.number(),
    remainingRidershipMissingCount: z.number(),
  }),
  async run({ input }) {
    const routes = await mergeRoutesWithFile(input.options.routes, input.options.routesFile);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "backfill.route-ridership-trends",
      operation: "runBackfillRouteRidershipTrends",
      spanAttributes: {
        startYear: input.options.startYear,
        startMonth: input.options.startMonth,
        endYear: input.options.endYear,
        endMonth: input.options.endMonth,
        routeCount: routes.length,
        concurrency: input.options.concurrency,
        limit: input.options.limit ?? null,
      },
      run: (local) =>
        runBackfillRouteRidershipTrends({
          local,
          startYear: input.options.startYear,
          startMonth: input.options.startMonth,
          endYear: input.options.endYear,
          endMonth: input.options.endMonth,
          routes: routes.length === 0 ? undefined : routes,
          limit: input.options.limit,
          concurrency: input.options.concurrency,
        }),
    });
  },
});

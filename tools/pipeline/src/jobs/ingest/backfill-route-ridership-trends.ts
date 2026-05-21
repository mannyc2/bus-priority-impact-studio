import { listRouteMonthTrends, replaceRouteMonthTrends } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient, soqlQuote } from "@bp/sources";
import * as z from "zod";
import { numberOption, stringListOption } from "../../lib/cli-args.js";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthRangeContext, parseMonthRangeDbCliArgs } from "../../lib/route-job.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { readSourceManifest } from "../../source-manifest.js";

type RidershipBackfillArgs = {
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  routes?: string[];
  limit?: number;
  concurrency?: number;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type RidershipBackfillResult = {
  startMonth: string;
  endMonth: string;
  attemptedChunkCount: number;
  updatedRowCount: number;
  failedRowCount: number;
  remainingRidershipMissingCount: number;
};

type TrendRow = Awaited<ReturnType<typeof listRouteMonthTrends>>[number];

type RidershipSourceId = "bus_hourly_ridership_2020_2024" | "bus_hourly_ridership_2025";

const RawRidershipAggregateSchema = z
  .object({
    bus_route: z.string().min(1).optional(),
    ridership: z.coerce.number().nonnegative().optional(),
    transfers: z.coerce.number().nonnegative().optional(),
  })
  .passthrough();

function parseIsoMonth(month: string): { year: number; month: number } {
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) {
    throw new Error(`Invalid ISO month: ${month}`);
  }

  return { year, month: monthNumber };
}

function parseArgs(args: RidershipBackfillArgs = {}): Required<
  Omit<RidershipBackfillArgs, "fetchedAt" | "workingDir">
> & {
  startIsoMonth: string;
  endIsoMonth: string;
} {
  return {
    ...createMonthRangeContext(args),
    routes: args.routes ?? [],
    limit: args.limit ?? Number.POSITIVE_INFINITY,
    concurrency: args.concurrency ?? 4,
    fetcher: args.fetcher ?? fetch,
  };
}

function parseCliArgs(args: string[]): RidershipBackfillArgs {
  return parseMonthRangeDbCliArgs(args, {} as RidershipBackfillArgs, [
    stringListOption(["--routes"], (output, value) => {
      output.routes = value;
    }),
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
    numberOption(["--concurrency"], (output, value) => {
      output.concurrency = value;
    }),
  ]);
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
  const query: SocrataRowsQuery = {
    select: "bus_route,sum(ridership) as ridership,sum(transfers) as transfers",
    where: [
      `bus_route in(${input.routeIds.map(soqlQuote).join(",")})`,
      `transit_timestamp >= ${soqlQuote(isoMonthStart(parsedMonth.year, parsedMonth.month))}`,
      `transit_timestamp < ${soqlQuote(nextIsoMonthStart(parsedMonth.year, parsedMonth.month))}`,
    ].join(" AND "),
    group: "bus_route",
    order: "bus_route",
  };
  const rows = await SocrataClient.fromSource(source, { fetcher: input.fetcher }).rows(query);
  const output = new Map<string, { ridership: number; transfers: number }>();

  for (const row of rows) {
    const parsed = RawRidershipAggregateSchema.parse(row);
    if (parsed.bus_route === undefined) {
      continue;
    }
    const routeId = z.decode(RouteIdCodec, parsed.bus_route);
    output.set(routeId, {
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

export async function backfillRouteRidershipTrends(
  args: RidershipBackfillArgs = {},
): Promise<RidershipBackfillResult> {
  const options = parseArgs(args);
  const startMonth = options.startIsoMonth;
  const endMonth = options.endIsoMonth;
  const routeFilter = new Set<string>(options.routes.map((route) => z.decode(RouteIdCodec, route)));
  const existingRows = await withLocalPipelineDb(options.dbPath, (local) =>
    listRouteMonthTrends(local.db),
  );
  const manifest = await readSourceManifest();
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
    .slice(0, options.limit);
  const candidatesByMonth = new Map<string, TrendRow[]>();
  for (const row of candidates) {
    candidatesByMonth.set(row.month, [...(candidatesByMonth.get(row.month) ?? []), row]);
  }
  const fetchBatches = [...candidatesByMonth.entries()].flatMap(([month, rows]) =>
    chunkArray(rows, 50).map((chunk) => ({ month, rows: chunk })),
  );
  let completedBatchCount = 0;
  const updateBatches = await mapWithConcurrency(
    fetchBatches,
    options.concurrency,
    async (batch) => {
      try {
        const aggregateByRoute = await fetchRidershipAggregates({
          sources,
          routeIds: batch.rows.map((row) => row.routeId),
          isoMonth: batch.month,
          fetcher: options.fetcher,
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
    },
  );
  const successfulUpdates = updateBatches.flatMap((update) => update ?? []);
  const updateByKey = new Map(
    successfulUpdates.map((update) => [trendKey(update.row.routeId, update.row.month), update]),
  );
  const rows: TrendRow[] = existingRows.map((row) => {
    const update = updateByKey.get(trendKey(row.routeId, row.month));
    if (update === undefined) {
      return row;
    }

    return {
      ...row,
      ridership: update.ridership,
      transfers: update.transfers,
      hasRidershipTrend: true,
    };
  });
  const outputRows = rows.filter((row) => inRange(row, startMonth, endMonth));
  const remainingRidershipMissingCount = outputRows.filter((row) => !row.hasRidershipTrend).length;

  await withLocalPipelineDb(options.dbPath, (local) => replaceRouteMonthTrends(local.db, rows));

  return {
    startMonth,
    endMonth,
    attemptedChunkCount: candidates.length,
    updatedRowCount: successfulUpdates.length,
    failedRowCount: candidates.length - successfulUpdates.length,
    remainingRidershipMissingCount,
  };
}

export function backfillRouteRidershipTrendsFromCli(
  args: string[],
): Promise<RidershipBackfillResult> {
  return backfillRouteRidershipTrends(parseCliArgs(args));
}

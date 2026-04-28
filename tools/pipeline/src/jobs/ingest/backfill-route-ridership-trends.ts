import { listRouteMonthTrends, replaceRouteMonthTrends } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient, soqlQuote } from "@bp/sources";
import * as z from "zod";
import { dbOption, numberOption, parseCliOptions, stringListOption } from "../../lib/cli-args.js";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
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
  remainingRidershipMissingCount: number;
};

type TrendRow = Awaited<ReturnType<typeof listRouteMonthTrends>>[number];

const RawRidershipAggregateSchema = z
  .object({
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

function parseArgs(
  args: RidershipBackfillArgs = {},
): Required<Omit<RidershipBackfillArgs, "fetchedAt" | "workingDir">> {
  return {
    startYear: args.startYear ?? 2025,
    startMonth: args.startMonth ?? 1,
    endYear: args.endYear ?? 2026,
    endMonth: args.endMonth ?? 3,
    routes: args.routes ?? [],
    limit: args.limit ?? Number.POSITIVE_INFINITY,
    concurrency: args.concurrency ?? 4,
    fetcher: args.fetcher ?? fetch,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RidershipBackfillArgs {
  return parseCliOptions(args, {} as RidershipBackfillArgs, [
    numberOption(["--start-year"], (output, value) => {
      output.startYear = value;
    }),
    numberOption(["--start-month"], (output, value) => {
      output.startMonth = value;
    }),
    numberOption(["--end-year"], (output, value) => {
      output.endYear = value;
    }),
    numberOption(["--end-month"], (output, value) => {
      output.endMonth = value;
    }),
    stringListOption(["--routes"], (output, value) => {
      output.routes = value;
    }),
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
    numberOption(["--concurrency"], (output, value) => {
      output.concurrency = value;
    }),
    dbOption(fromCliPath),
  ]);
}

function inRange(row: TrendRow, startMonth: string, endMonth: string): boolean {
  return row.month >= startMonth && row.month <= endMonth;
}

async function fetchRidershipAggregate(input: {
  source: SocrataManifestSource;
  routeId: string;
  isoMonth: string;
  fetcher: SocrataFetch;
}): Promise<{ ridership: number; transfers: number }> {
  const parsedMonth = parseIsoMonth(input.isoMonth);
  const query: SocrataRowsQuery = {
    select: "sum(ridership) as ridership,sum(transfers) as transfers",
    where: [
      `bus_route=${soqlQuote(input.routeId)}`,
      `transit_timestamp >= ${soqlQuote(isoMonthStart(parsedMonth.year, parsedMonth.month))}`,
      `transit_timestamp < ${soqlQuote(nextIsoMonthStart(parsedMonth.year, parsedMonth.month))}`,
    ].join(" AND "),
    limit: 1,
  };
  const rows = await SocrataClient.fromSource(input.source, { fetcher: input.fetcher }).rows(query);
  const parsed = RawRidershipAggregateSchema.parse(rows[0] ?? {});

  return {
    ridership: Math.round((parsed.ridership ?? 0) * 10_000) / 10_000,
    transfers: Math.round((parsed.transfers ?? 0) * 10_000) / 10_000,
  };
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
  const startMonth = isoMonth(options.startYear, options.startMonth);
  const endMonth = isoMonth(options.endYear, options.endMonth);
  const routeFilter = new Set<string>(options.routes.map((route) => z.decode(RouteIdCodec, route)));
  const local = await openLocalPipelineDb(options.dbPath);
  const existingRows = await listRouteMonthTrends(local.db);
  local.sqlite.close();
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, "bus_hourly_ridership_2025");
  const rangeRows = existingRows.filter((row) => inRange(row, startMonth, endMonth));
  const candidates = rangeRows
    .filter((row) => !row.hasRidershipTrend)
    .filter((row) => routeFilter.size === 0 || routeFilter.has(row.routeId))
    .slice(0, options.limit);
  const updates = await mapWithConcurrency(candidates, options.concurrency, async (row) => ({
    row,
    ...(await fetchRidershipAggregate({
      source,
      routeId: row.routeId,
      isoMonth: row.month,
      fetcher: options.fetcher,
    })),
  }));
  const updateByKey = new Map(
    updates.map((update) => [`${update.row.routeId}::${update.row.month}`, update]),
  );
  const rows: TrendRow[] = existingRows.map((row) => {
    const update = updateByKey.get(`${row.routeId}::${row.month}`);
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

  const writeLocal = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteMonthTrends(writeLocal.db, rows);
  } finally {
    writeLocal.sqlite.close();
  }

  return {
    startMonth,
    endMonth,
    attemptedChunkCount: candidates.length,
    updatedRowCount: updates.length,
    remainingRidershipMissingCount,
  };
}

export function backfillRouteRidershipTrendsFromCli(
  args: string[],
): Promise<RidershipBackfillResult> {
  return backfillRouteRidershipTrends(parseCliArgs(args));
}

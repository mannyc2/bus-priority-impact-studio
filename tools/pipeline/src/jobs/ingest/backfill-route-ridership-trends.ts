import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { listRouteMonthTrends, replaceRouteMonthTrends } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient, soqlQuote } from "@bp/sources";
import * as z from "zod";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;

type RidershipBackfillArgs = {
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  routes?: string[];
  limit?: number;
  concurrency?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  workingDir?: string;
  dbPath?: string;
};

type RidershipBackfillResult = {
  startMonth: string;
  endMonth: string;
  summaryPath: string;
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

function parseArgs(args: RidershipBackfillArgs = {}): Required<RidershipBackfillArgs> {
  return {
    startYear: args.startYear ?? 2025,
    startMonth: args.startMonth ?? 1,
    endYear: args.endYear ?? 2026,
    endMonth: args.endMonth ?? 3,
    routes: args.routes ?? [],
    limit: args.limit ?? Number.POSITIVE_INFINITY,
    concurrency: args.concurrency ?? 4,
    fetchedAt: args.fetchedAt ?? new Date(),
    fetcher: args.fetcher ?? fetch,
    workingDir: args.workingDir ?? fromRepoRoot(join("data/working/trends")),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RidershipBackfillArgs {
  const output: RidershipBackfillArgs = {};

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

    if (arg === "--limit" && value !== undefined) {
      output.limit = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--concurrency" && value !== undefined) {
      output.concurrency = Number(value);
      index += 1;
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

function summaryPath(workingDir: string, startMonth: string, endMonth: string): string {
  return join(workingDir, `route-ridership-trend-backfill-${startMonth}_through_${endMonth}.json`);
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
  const summary = {
    schemaVersion,
    startMonth,
    endMonth,
    fetchedAt: options.fetchedAt.toISOString(),
    attemptedChunkCount: candidates.length,
    updatedRowCount: updates.length,
    remainingRidershipMissingCount,
    routeCount: new Set(outputRows.map((row) => row.routeId)).size,
    rowCount: outputRows.length,
    sourceReadiness: {
      ridershipTrends:
        remainingRidershipMissingCount === 0 ? "available" : "partial_chunked_backfill",
    },
    caveats: [
      "Backfill fetches one route/month ridership aggregate per chunk to avoid slow all-route Socrata grouped queries.",
      "Ridership remains route-level and is not allocated to segments or stops.",
    ],
  };

  await mkdir(options.workingDir, { recursive: true });
  const writeLocal = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteMonthTrends(writeLocal.db, rows);
  } finally {
    writeLocal.sqlite.close();
  }
  await writeJson(summaryPath(options.workingDir, startMonth, endMonth), summary);

  return {
    startMonth,
    endMonth,
    summaryPath: summaryPath(options.workingDir, startMonth, endMonth),
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

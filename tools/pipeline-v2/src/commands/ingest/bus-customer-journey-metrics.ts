import type { Database } from "bun:sqlite";
import { isAbsolute, join, relative } from "node:path";
import { replaceBusCustomerJourneyMetricRows } from "@bp/db/local";
import { normalizeBusCustomerJourneyMetricRows } from "@bp/sources/adapters/mta/bus-customer-journey-metrics";
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
import { fromRepoRoot, repoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "bus_customer_journey_metrics";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export type BusCustomerJourneyMetricsRunInputs = {
  local: OpenLocalPipelineDb;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type BusCustomerJourneyMetricsIngestResult = {
  rawPath: string;
  startMonth: string;
  endMonth: string;
  monthCount: number;
  rowCount: number;
  routeCount: number;
};

export function ensureBusCustomerJourneyMetricTable(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_bus_customer_journey_metric (
      month text NOT NULL,
      route_id text NOT NULL,
      borough text NOT NULL,
      trip_type text NOT NULL,
      period text NOT NULL,
      customers real NOT NULL,
      additional_bus_stop_time_minutes real,
      additional_travel_time_minutes real,
      customer_journey_time_minutes real,
      PRIMARY KEY (month, route_id, trip_type, period)
    );
  `);
}

export async function runBusCustomerJourneyMetricsIngest(
  inputs: BusCustomerJourneyMetricsRunInputs,
): Promise<BusCustomerJourneyMetricsIngestResult> {
  const startMonth = isoMonth(inputs.startYear, inputs.startMonth);
  const endMonth = isoMonth(inputs.endYear, inputs.endMonth);
  const months = monthRange(inputs.startYear, inputs.startMonth, inputs.endYear, inputs.endMonth);
  if (months.length === 0) {
    throw new Error(`Invalid month range ${startMonth}..${endMonth}`);
  }

  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(
      join(
        "data/raw/reliability",
        startMonth === endMonth
          ? `bus-customer-journey-metrics-${startMonth}.json`
          : `bus-customer-journey-metrics-${startMonth}_to_${endMonth}.json`,
      ),
    );

  const query: Soda3SoqlQuery = {
    select:
      "month,borough,trip_type,route_id,period,number_of_customers,additional_bus_stop_time,additional_travel_time,customer_journey_time",
    where: [
      `month >= '${isoMonthStart(inputs.startYear, inputs.startMonth)}'`,
      `month < '${nextIsoMonthStart(inputs.endYear, inputs.endMonth)}'`,
      "route_id IS NOT NULL",
      "period IS NOT NULL",
    ].join(" AND "),
    order: "month,route_id,trip_type,period",
  };
  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(source, query, {
      fetcher: inputs.fetcher,
    })),
  ];
  const monthSet = new Set(months.map((month) => month.isoMonth));
  const rows = normalizeBusCustomerJourneyMetricRows(rawRows).filter((row) =>
    monthSet.has(row.month),
  );
  const routeIds = [...new Set(rows.map((row) => row.routeId))].sort();

  ensureBusCustomerJourneyMetricTable(inputs.local.sqlite);

  for (const month of months) {
    await replaceBusCustomerJourneyMetricRows(
      inputs.local.db,
      month.isoMonth,
      rows.filter((row) => row.month === month.isoMonth),
    );
  }
  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { startMonth, endMonth },
    fetchedAt,
    query: { grain: "route_id, trip_type, period", startMonth, endMonth },
    rows: rawRows,
  });

  return {
    rawPath: repoDisplayPath(rawPath),
    startMonth,
    endMonth,
    monthCount: months.length,
    rowCount: rows.length,
    routeCount: routeIds.length,
  };
}

export default defineCommand({
  path: ["ingest", "bus-customer-journey-metrics"],
  summary: "Fetch monthly bus customer journey metrics from Socrata.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(4).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    startMonth: z.string(),
    endMonth: z.string(),
    monthCount: z.number().int().nonnegative(),
    rowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
  }),
  async run({ ctx, input }) {
    return runBusCustomerJourneyMetricsIngest({
      local: localDbFromCtx(ctx),
      startYear: input.options.startYear,
      startMonth: input.options.startMonth,
      endYear: input.options.endYear,
      endMonth: input.options.endMonth,
    });
  },
});

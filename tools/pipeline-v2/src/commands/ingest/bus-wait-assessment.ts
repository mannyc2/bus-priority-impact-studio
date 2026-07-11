import { replaceBusWaitAssessmentRows } from "@bp/db/local";
import { arg, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeBusWaitAssessmentRows } from "@bp/sources/adapters/mta/bus-wait-assessment";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defineSocrataMonthlyIngest } from "../../lib/socrata-monthly-ingest.ts";
import type { SocrataFetch } from "../../lib/soda3.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const sourceId = "bus_wait_assessment";

export type BusWaitAssessmentRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type BusWaitAssessmentIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
  routeCount: number;
};

const runBusWaitAssessmentMonthlyIngest = defineSocrataMonthlyIngest({
  sourceId,
  rawDir: "data/raw/reliability",
  rawFilePrefix: "bus-wait-assessment",
  queryGrain: "route_id, day_type, trip_type, period",
  query: ({ year, month }) => ({
    select:
      "month,borough,day_type,trip_type,route_id,period,number_of_trips_passing_wait,number_of_scheduled_trips,wait_assessment",
    where: [
      `month >= '${isoMonthStart(year, month)}'`,
      `month < '${nextIsoMonthStart(year, month)}'`,
      "route_id IS NOT NULL",
      "period IS NOT NULL",
    ].join(" AND "),
    order: "route_id,day_type,trip_type,period",
  }),
  normalize: ({ rawRows, isoMonth }) =>
    normalizeBusWaitAssessmentRows([...rawRows]).filter((row) => row.month === isoMonth),
  replaceRows: ({ local, isoMonth, rows }) =>
    replaceBusWaitAssessmentRows(local.db, isoMonth, [...rows]),
  summarize: ({ rows }) => ({
    routeCount: new Set(rows.map((row) => row.routeId)).size,
  }),
});

export async function runBusWaitAssessmentIngest(
  inputs: BusWaitAssessmentRunInputs,
): Promise<BusWaitAssessmentIngestResult> {
  return runBusWaitAssessmentMonthlyIngest(inputs);
}

export default defineIngestCommand({
  path: ["ingest", "bus-wait-assessment"],
  summary: "Fetch monthly bus wait assessment rows from Socrata.",
  options: dbOptions.extend({
    year: arg.positiveInt().default(2026).describe("Calendar year"),
    month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
  }),
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
    routeCount: z.number(),
  }),
  operation: "runBusWaitAssessmentIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runBusWaitAssessmentIngest({ local, year, month }),
});

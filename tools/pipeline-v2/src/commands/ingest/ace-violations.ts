import { replaceAceViolationSummaries } from "@bp/db/local";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import { normalizeAceViolationSummaryRows } from "@bp/sources/adapters/mta/ace";
import { Effect } from "effect";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions } from "../../lib/local-db.ts";
import {
  defineSocrataMonthlyIngest,
  type SocrataMonthlyIngestInputs,
} from "../../lib/socrata-monthly-ingest.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const routeIdPattern = /^[A-Z][A-Z0-9+-]*$/;

function hasCanonicalRouteId(row: Record<string, unknown>): boolean {
  const routeId = row["bus_route_id"];
  return routeIdPattern.test(typeof routeId === "string" ? routeId.trim().toUpperCase() : "");
}

export type AceViolationsRunInputs = SocrataMonthlyIngestInputs;
export type AceViolationsIngestResult = {
  rawPath: string;
  isoMonth: string;
  routeCount: number;
  groupedRowCount: number;
  violationCount: number;
  skippedMalformedRouteIdCount: number;
};

const runAceViolationsMonthlyIngest = defineSocrataMonthlyIngest({
  sourceId: "ace_violations",
  rawDir: "data/raw/interventions",
  rawFilePrefix: "ace-violations",
  queryGrain: "bus_route_id, violation_type, violation_status",
  query: ({ year, month }) => ({
    select: "bus_route_id,violation_type,violation_status,count(*) as violation_count",
    where: [
      `first_occurrence >= '${isoMonthStart(year, month)}'`,
      `first_occurrence < '${nextIsoMonthStart(year, month)}'`,
      "bus_route_id IS NOT NULL",
      "violation_type IS NOT NULL",
      "violation_status IS NOT NULL",
    ].join(" AND "),
    group: "bus_route_id,violation_type,violation_status",
    order: "bus_route_id,violation_type,violation_status",
  }),
  normalize: ({ rawRows }) => normalizeAceViolationSummaryRows(rawRows.filter(hasCanonicalRouteId)),
  replaceRows: ({ local, isoMonth, rows }) =>
    replaceAceViolationSummaries(
      local.db,
      isoMonth,
      rows.map((row) => ({ ...row, month: isoMonth })),
    ),
  summarize: ({ rows, rawRows }) => ({
    routeCount: new Set(rows.map((row) => row.routeId)).size,
    groupedRowCount: rows.length,
    violationCount: rows.reduce((sum, row) => sum + row.violationCount, 0),
    skippedMalformedRouteIdCount: rawRows.filter((row) => !hasCanonicalRouteId(row)).length,
  }),
});

export async function runAceViolationsIngest(
  inputs: AceViolationsRunInputs,
): Promise<AceViolationsIngestResult> {
  const { rowCount: _rowCount, ...result } = await runAceViolationsMonthlyIngest(inputs);
  return result;
}

export default defineIngestCommand({
  path: ["ingest", "ace-violations"],
  summary: "Fetch monthly ACE/ABLE violation summaries from Socrata.",
  options: Schema.Struct({
    ...dbOptions.fields,
    ...{
      year: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
        .annotate({ description: "Calendar year" }),
      month: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
        .annotate({ description: "Calendar month, 1-12" }),
    },
  }),
  output: Schema.Struct({
    rawPath: Schema.String,
    isoMonth: Schema.String,
    routeCount: Schema.Number,
    groupedRowCount: Schema.Number,
    violationCount: Schema.Number,
    skippedMalformedRouteIdCount: Schema.Number,
  }),
  operation: "runAceViolationsIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runAceViolationsIngest({ local, year, month }),
});

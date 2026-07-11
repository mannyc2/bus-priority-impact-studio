import { replaceAceViolationSummaries } from "@bp/db/local";
import { arg, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeAceViolationSummaryRows } from "@bp/sources/adapters/mta/ace";
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
  options: dbOptions.extend({
    year: arg.positiveInt().default(2026).describe("Calendar year"),
    month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
  }),
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    routeCount: z.number(),
    groupedRowCount: z.number(),
    violationCount: z.number(),
    skippedMalformedRouteIdCount: z.number(),
  }),
  operation: "runAceViolationsIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runAceViolationsIngest({ local, year, month }),
});

import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { replaceAceViolationSummaries } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeAceViolationSummaryRows,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataRow,
  type SocrataRowsQuery,
  SocrataClient,
} from "@bp/sources";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "ace_violations";
const ROUTE_ID_PATTERN = /^[A-Z][A-Z0-9+-]*$/;

export type AceViolationsRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type AceViolationsIngestResult = {
  rawPath: string;
  isoMonth: string;
  routeCount: number;
  groupedRowCount: number;
  violationCount: number;
  skippedMalformedRouteIdCount: number;
};

export async function runAceViolationsIngest(
  inputs: AceViolationsRunInputs,
): Promise<AceViolationsIngestResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/interventions", `ace-violations-${monthKey}.json`));

  const query: SocrataRowsQuery = {
    select: "bus_route_id,violation_type,violation_status,count(*) as violation_count",
    where: [
      `first_occurrence >= '${isoMonthStart(inputs.year, inputs.month)}'`,
      `first_occurrence < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
      "bus_route_id IS NOT NULL",
      "violation_type IS NOT NULL",
      "violation_status IS NOT NULL",
    ].join(" AND "),
    group: "bus_route_id,violation_type,violation_status",
    order: "bus_route_id,violation_type,violation_status",
  };
  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
  }).rows(query);
  const filteredRawRows = rawRows.filter((row) => {
    const id = typeof row["bus_route_id"] === "string"
      ? row["bus_route_id"].trim().toUpperCase()
      : "";
    return ROUTE_ID_PATTERN.test(id);
  });
  const skippedMalformedRouteIdCount = rawRows.length - filteredRawRows.length;
  const rows = normalizeAceViolationSummaryRows(filteredRawRows);
  const routeIds = [...new Set(rows.map((row) => row.routeId))].sort();
  const violationCount = rows.reduce((sum, row) => sum + row.violationCount, 0);

  await replaceAceViolationSummaries(
    inputs.local.db,
    monthKey,
    rows.map((row) => ({ ...row, month: monthKey })),
  );
  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "bus_route_id, violation_type, violation_status", month: monthKey },
    rows: rawRows,
  });

  return {
    rawPath,
    isoMonth: monthKey,
    routeCount: routeIds.length,
    groupedRowCount: rows.length,
    violationCount,
    skippedMalformedRouteIdCount,
  };
}

export default defineCommand({
  path: ["ingest", "ace-violations"],
  summary: "Fetch monthly ACE/ABLE violation summaries from Socrata.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    routeCount: z.number(),
    groupedRowCount: z.number(),
    violationCount: z.number(),
    skippedMalformedRouteIdCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runAceViolationsIngest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
    });
  },
});

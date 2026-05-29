import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { replaceBusWaitAssessmentRows } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeBusWaitAssessmentRows,
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

export async function runBusWaitAssessmentIngest(
  inputs: BusWaitAssessmentRunInputs,
): Promise<BusWaitAssessmentIngestResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/reliability", `bus-wait-assessment-${monthKey}.json`));

  const query: SocrataRowsQuery = {
    select:
      "month,borough,day_type,trip_type,route_id,period,number_of_trips_passing_wait,number_of_scheduled_trips,wait_assessment",
    where: [
      `month >= '${isoMonthStart(inputs.year, inputs.month)}'`,
      `month < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
      "route_id IS NOT NULL",
      "period IS NOT NULL",
    ].join(" AND "),
    order: "route_id,day_type,trip_type,period",
  };
  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
  }).rows(query);
  const rows = normalizeBusWaitAssessmentRows(rawRows).filter((row) => row.month === monthKey);
  const routeIds = [...new Set(rows.map((row) => row.routeId))].sort();

  await replaceBusWaitAssessmentRows(inputs.local.db, monthKey, rows);
  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "route_id, day_type, trip_type, period", month: monthKey },
    rows: rawRows,
  });

  return { rawPath, isoMonth: monthKey, rowCount: rows.length, routeCount: routeIds.length };
}

export default defineCommand({
  path: ["ingest", "bus-wait-assessment"],
  summary: "Fetch monthly bus wait assessment rows from Socrata.",
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
    rowCount: z.number(),
    routeCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runBusWaitAssessmentIngest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
    });
  },
});

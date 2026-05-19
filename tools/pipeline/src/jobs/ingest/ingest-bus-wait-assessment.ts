import { join } from "node:path";
import { replaceBusWaitAssessmentRows } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeBusWaitAssessmentRows, SocrataClient } from "@bp/sources";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "bus_wait_assessment";

type BusWaitAssessmentIngestArgs = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type BusWaitAssessmentIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
  routeCount: number;
};

function parseCliArgs(args: string[]): BusWaitAssessmentIngestArgs {
  return parseMonthDbCliArgs(args, {} as BusWaitAssessmentIngestArgs);
}

async function fetchBusWaitAssessmentRows(
  source: SocrataManifestSource,
  year: number,
  month: number,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  const query: SocrataRowsQuery = {
    select:
      "month,borough,day_type,trip_type,route_id,period,number_of_trips_passing_wait,number_of_scheduled_trips,wait_assessment",
    where: [
      `month >= '${isoMonthStart(year, month)}'`,
      `month < '${nextIsoMonthStart(year, month)}'`,
      "route_id IS NOT NULL",
      "period IS NOT NULL",
    ].join(" AND "),
    order: "route_id,day_type,trip_type,period",
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestBusWaitAssessment(
  args: BusWaitAssessmentIngestArgs = {},
): Promise<BusWaitAssessmentIngestResult> {
  const options = createMonthContext(args);
  const monthKey = options.isoMonth;
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/reliability"));
  const rawPath = join(rawDir, `bus-wait-assessment-${monthKey}.json`);

  const rawRows = await fetchBusWaitAssessmentRows(
    source,
    options.year,
    options.month,
    args.fetcher,
  );
  const rows = normalizeBusWaitAssessmentRows(rawRows).filter((row) => row.month === monthKey);
  const routeIds = [...new Set(rows.map((row) => row.routeId))].sort();

  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceBusWaitAssessmentRows(local.db, monthKey, rows),
  );

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "route_id, day_type, trip_type, period", month: monthKey },
    rows: rawRows,
  });

  return {
    rawPath,
    isoMonth: monthKey,
    rowCount: rows.length,
    routeCount: routeIds.length,
  };
}

export async function ingestBusWaitAssessmentFromCli(
  args: string[],
): Promise<BusWaitAssessmentIngestResult> {
  return ingestBusWaitAssessment(parseCliArgs(args));
}

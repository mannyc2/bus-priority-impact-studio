import { join } from "node:path";
import { replaceAceViolationSummaries } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeAceViolationSummaryRows, SocrataClient } from "@bp/sources";
import { dbOption, monthOption, parseCliOptions, yearOption } from "../../lib/cli-args.js";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "ace_violations";

type AceViolationIngestArgs = {
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type AceViolationIngestResult = {
  rawPath: string;
  isoMonth: string;
  routeCount: number;
  groupedRowCount: number;
  violationCount: number;
};

function parseCliArgs(args: string[]): AceViolationIngestArgs {
  return parseCliOptions(args, {} as AceViolationIngestArgs, [
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
}

async function fetchAceViolationSummaryRows(
  source: SocrataManifestSource,
  year: number,
  month: number,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  const query: SocrataRowsQuery = {
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
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestAceViolationSummary(
  args: AceViolationIngestArgs = {},
): Promise<AceViolationIngestResult> {
  const year = args.year ?? 2026;
  const month = args.month ?? 3;
  const dbPath = args.dbPath ?? defaultLocalPipelineDbPath();
  const monthKey = isoMonth(year, month);
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const rawPath = join(rawDir, `ace-violations-${monthKey}.json`);
  const rawRows = await fetchAceViolationSummaryRows(source, year, month, args.fetcher);
  const rows = normalizeAceViolationSummaryRows(rawRows);
  const routeIds = [...new Set(rows.map((row) => row.routeId))].sort();
  const violationCount = rows.reduce((sum, row) => sum + row.violationCount, 0);
  await withLocalPipelineDb(dbPath, (local) =>
    replaceAceViolationSummaries(
      local.db,
      monthKey,
      rows.map((row) => ({ ...row, month: monthKey })),
    ),
  );

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: {
      grain: "bus_route_id, violation_type, violation_status",
      month: monthKey,
    },
    rows: rawRows,
  });

  return {
    rawPath,
    isoMonth: monthKey,
    routeCount: routeIds.length,
    groupedRowCount: rows.length,
    violationCount,
  };
}

export async function ingestAceViolationSummaryFromCli(
  args: string[],
): Promise<AceViolationIngestResult> {
  return ingestAceViolationSummary(parseCliArgs(args));
}

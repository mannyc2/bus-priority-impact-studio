import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceAceViolationSummaries } from "@bp/db/local";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeAceViolationSummaryRows, SocrataClient } from "@bp/sources";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
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
  summaryPath: string;
  isoMonth: string;
  routeCount: number;
  groupedRowCount: number;
  violationCount: number;
};

function parseCliArgs(args: string[]): AceViolationIngestArgs {
  const output: AceViolationIngestArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
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
  const workingDir = fromRepoRoot(join("data/working/interventions"));
  const rawPath = join(rawDir, `ace-violations-${monthKey}.json`);
  const summaryPath = join(workingDir, `ace-violations-${monthKey}-summary.json`);
  const rawRows = await fetchAceViolationSummaryRows(source, year, month, args.fetcher);
  const rows = normalizeAceViolationSummaryRows(rawRows);
  const routeIds = [...new Set(rows.map((row) => row.routeId))].sort();
  const violationCount = rows.reduce((sum, row) => sum + row.violationCount, 0);
  const byRoute = routeIds
    .map((routeId) => ({
      routeId,
      violationCount: rows
        .filter((row) => row.routeId === routeId)
        .reduce((sum, row) => sum + row.violationCount, 0),
    }))
    .sort(
      (left, right) =>
        right.violationCount - left.violationCount || left.routeId.localeCompare(right.routeId),
    );
  const summary = {
    schemaVersion,
    sourceId,
    isoMonth: monthKey,
    fetchedAt,
    groupedRowCount: rows.length,
    routeCount: routeIds.length,
    violationCount,
    topRoutes: byRoute.slice(0, 10),
  };
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceAceViolationSummaries(
      local.db,
      monthKey,
      rows.map((row) => ({ ...row, month: monthKey })),
    );
  } finally {
    local.sqlite.close();
  }

  await mkdir(rawDir, { recursive: true });
  await mkdir(workingDir, { recursive: true });
  await Promise.all([
    writeJson(rawPath, {
      schemaVersion,
      sourceId,
      isoMonth: monthKey,
      fetchedAt,
      query: {
        grain: "bus_route_id, violation_type, violation_status",
        month: monthKey,
      },
      rows: rawRows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    rawPath,
    summaryPath,
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

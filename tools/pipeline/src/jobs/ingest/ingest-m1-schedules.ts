import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteSchedules } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, normalizeScheduleTimepointRows, SocrataClient } from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
const sourceId = "bus_schedules_2026";

type ScheduleIngestArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type ScheduleIngestResult = {
  rawPath: string;
  routeId: string;
  isoMonth: string;
  timepointCount: number;
  dayTypes: string[];
  bundles: string[];
};

function parseCliArgs(args: string[]): ScheduleIngestArgs {
  const output: ScheduleIngestArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--route" && value !== undefined) {
      output.routeId = value;
      index += 1;
      continue;
    }

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

async function fetchScheduleRows(
  source: SocrataManifestSource,
  routeId: string,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  const query: SocrataRowsQuery = {
    select:
      "schedule_date,day_type,direction,shape_id,route_id,stop_sequence,stop_id,stop_name,schedule_time,distance_from_start,trip_headsign,block_id,bundle",
    where: [
      `route_id='${routeId}'`,
      "timepoint='1'",
      "direction IS NOT NULL",
      "shape_id IS NOT NULL",
      "stop_id IS NOT NULL",
      "schedule_time IS NOT NULL",
      "block_id IS NOT NULL",
    ].join(" AND "),
    order: "day_type,direction,block_id,schedule_time,stop_sequence",
  };
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

export async function ingestM1Schedules(
  args: ScheduleIngestArgs = {},
): Promise<ScheduleIngestResult> {
  const routeId = z.decode(RouteIdCodec, args.routeId ?? "M1");
  const year = args.year ?? 2026;
  const month = args.month ?? 3;
  const dbPath = args.dbPath ?? defaultLocalPipelineDbPath();
  const monthKey = isoMonth(year, month);
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const key = routeSliceKey(routeId, monthKey);
  const rawDir = fromRepoRoot(join("data/raw/route-slices", key));
  const rawPath = join(rawDir, "bus_schedules_2026.json");
  const rawRows = await fetchScheduleRows(source, routeId, args.fetcher);
  const normalizedRows = normalizeScheduleTimepointRows(rawRows);
  const dayTypes = [...new Set(normalizedRows.map((row) => row.dayType))].sort();
  const bundles = [
    ...new Set(normalizedRows.flatMap((row) => (row.bundle ? [row.bundle] : []))),
  ].sort();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteSchedules(
      local.db,
      routeId,
      monthKey,
      normalizedRows.map((row) => ({ ...row, isoMonth: monthKey })),
    );
  } finally {
    local.sqlite.close();
  }

  await mkdir(rawDir, { recursive: true });
  await writeJson(rawPath, {
    schemaVersion,
    sourceId,
    fetchedAt,
    query: { routeId, timepoint: "1" },
    rows: rawRows,
  });

  return {
    rawPath,
    routeId,
    isoMonth: monthKey,
    timepointCount: normalizedRows.length,
    dayTypes,
    bundles,
  };
}

export async function ingestM1SchedulesFromCli(args: string[]): Promise<ScheduleIngestResult> {
  return ingestM1Schedules(parseCliArgs(args));
}

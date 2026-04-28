import { listRouteHotspots, listRouteSchedules } from "@bp/db/local";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { scheduleComparisons } from "./route-brief-metrics.js";

const schemaVersion = 1;

type ScheduleComparisonArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

type ScheduleComparisonResult = {
  routeId: string;
  isoMonth: string;
  comparisonPath: string;
  scheduledPairCount: number;
  matchedHotspotCount: number;
};

type ScheduleComparisonOptions = Required<ScheduleComparisonArgs>;

function parseBuildArgs(args: ScheduleComparisonArgs): ScheduleComparisonOptions {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): ScheduleComparisonArgs {
  const output: ScheduleComparisonArgs = {};

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

export async function buildM1ScheduleComparison(
  args: ScheduleComparisonArgs = {},
): Promise<ScheduleComparisonResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const local = await openLocalPipelineDb(options.dbPath);
  const [schedules, hotspots] = await Promise.all([
    listRouteSchedules(local.db, options.routeId, month),
    listRouteHotspots(local.db, options.routeId, month),
  ]);
  local.sqlite.close();
  const scheduleComparison = scheduleComparisons(schedules, hotspots);
  const comparison = {
    schemaVersion,
    routeId: options.routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    scheduleFetchedAt: null,
    scheduledPairCount: scheduleComparison.scheduledPairCount,
    hotspotCount: scheduleComparison.hotspotComparisons.length,
    matchedHotspotCount: scheduleComparison.matchedHotspotCount,
    hotspotComparisons: scheduleComparison.hotspotComparisons,
    caveats: [
      "Scheduled travel time is derived by splitting schedule rows into trip-like sequences within block/day/direction groups.",
      "Schedule rows may use representative schedule dates that differ from the observed speed month.",
      "Only hotspot timepoint pairs with exact stop-id and direction matches receive scheduled comparisons.",
    ],
  };

  const comparisonPath = await writeRouteSliceArtifact(
    options.routeId,
    month,
    "schedule-comparison.json",
    comparison,
  );

  return {
    routeId: options.routeId,
    isoMonth: month,
    comparisonPath,
    scheduledPairCount: scheduleComparison.scheduledPairCount,
    matchedHotspotCount: scheduleComparison.matchedHotspotCount,
  };
}

export async function buildM1ScheduleComparisonFromCli(
  args: string[],
): Promise<ScheduleComparisonResult> {
  return buildM1ScheduleComparison(parseCliArgs(args));
}

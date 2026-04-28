import { listRouteHotspots, listRouteSchedules } from "@bp/db/local";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import {
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
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
  return parseCliOptions<ScheduleComparisonArgs>(args, {}, [
    routeOption(),
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
}

export async function buildM1ScheduleComparison(
  args: ScheduleComparisonArgs = {},
): Promise<ScheduleComparisonResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const [schedules, hotspots] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteSchedules(local.db, options.routeId, month),
      listRouteHotspots(local.db, options.routeId, month),
    ]),
  );
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

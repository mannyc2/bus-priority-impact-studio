import {
  type LocalRouteScheduleTimepoint,
  listRouteBriefSummaries,
  listRouteSchedules,
  replaceRouteReliabilityRows,
} from "@bp/db/local";
import { dbOption, monthOption, parseCliOptions, yearOption } from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

const schemaVersion = 1;
const longGapThresholdMinutes = 20;
const shortHeadwayThresholdMinutes = 3;

type RouteReliabilityBaselineArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type ScheduleRow = LocalRouteScheduleTimepoint;

type HeadwayGroup = {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  sampleCount: number;
  medianHeadwayMinutes: number;
  p90HeadwayMinutes: number;
  maxHeadwayMinutes: number;
};

type HeadwayGroupWithIntervals = HeadwayGroup & {
  intervals: number[];
};

type RouteReliabilityBaselineRow = {
  schemaVersion: typeof schemaVersion;
  routeId: string;
  isoMonth: string;
  reliabilityStatus: "scheduled_baseline_only";
  scheduledTimepointCount: number;
  stopHeadwayGroupCount: number;
  headwaySampleCount: number;
  medianScheduledHeadwayMinutes: number | null;
  p90ScheduledHeadwayMinutes: number | null;
  maxScheduledHeadwayMinutes: number | null;
  scheduledShortHeadwayShare: number | null;
  scheduledLongGapShare: number | null;
  topLongGapWindows: HeadwayGroup[];
  sourceStatus: {
    scheduledHeadways: "available";
    observedHeadways: "needs_gtfs_rt_collection";
    bunching: "needs_gtfs_rt_collection";
    waitTimeReliability: "needs_gtfs_rt_collection";
    tripCancellationProxy: "needs_trip_update_history";
  };
};

type RouteReliabilityBaselineResult = {
  isoMonth: string;
  routeCount: number;
  headwaySampleCount: number;
};

function parseBuildArgs(
  args: RouteReliabilityBaselineArgs = {},
): Required<RouteReliabilityBaselineArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteReliabilityBaselineArgs {
  return parseCliOptions(args, {} as RouteReliabilityBaselineArgs, [
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(sortedValues: readonly number[], q: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? null;
  }

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;

  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function groupKey(row: ScheduleRow): string {
  return [row.dayType, row.direction, row.stopId].join("::");
}

function minutesBetween(leftIso: string, rightIso: string): number {
  return (Date.parse(rightIso) - Date.parse(leftIso)) / 60_000;
}

function buildHeadwayGroups(
  routeId: string,
  rows: readonly ScheduleRow[],
): HeadwayGroupWithIntervals[] {
  const groups = new Map<string, ScheduleRow[]>();

  for (const row of rows) {
    const group = groups.get(groupKey(row)) ?? [];
    group.push(row);
    groups.set(groupKey(row), group);
  }

  const output: HeadwayGroupWithIntervals[] = [];
  for (const groupRows of groups.values()) {
    const uniqueTimes = [...new Set(groupRows.map((row) => row.scheduleTime))].sort();
    const intervals = uniqueTimes
      .slice(1)
      .map((time, index) => minutesBetween(uniqueTimes[index] ?? time, time))
      .filter((value) => value > 0 && value <= 240)
      .sort((left, right) => left - right);

    if (intervals.length === 0) {
      continue;
    }

    const firstRow = groupRows[0];
    output.push({
      routeId,
      dayType: firstRow?.dayType ?? "",
      direction: firstRow?.direction ?? "",
      stopId: firstRow?.stopId ?? "",
      stopName: firstRow?.stopName ?? null,
      sampleCount: intervals.length,
      intervals,
      medianHeadwayMinutes: round(quantile(intervals, 0.5) ?? 0),
      p90HeadwayMinutes: round(quantile(intervals, 0.9) ?? 0),
      maxHeadwayMinutes: round(Math.max(...intervals)),
    });
  }

  return output;
}

function routeBaseline(
  routeId: string,
  month: string,
  schedules: readonly ScheduleRow[],
): RouteReliabilityBaselineRow {
  const headwayGroupsWithIntervals = buildHeadwayGroups(routeId, schedules);
  const samples = headwayGroupsWithIntervals
    .flatMap((group) => group.intervals)
    .sort((left, right) => left - right);
  const headwayGroups: HeadwayGroup[] = headwayGroupsWithIntervals.map(
    ({ intervals: _intervals, ...group }) => group,
  );
  const headwaySampleCount = samples.length;
  const shortGroupCount = headwayGroups.filter(
    (group) => group.medianHeadwayMinutes <= shortHeadwayThresholdMinutes,
  ).length;
  const longGroupCount = headwayGroups.filter(
    (group) => group.p90HeadwayMinutes >= longGapThresholdMinutes,
  ).length;

  return {
    schemaVersion,
    routeId,
    isoMonth: month,
    reliabilityStatus: "scheduled_baseline_only",
    scheduledTimepointCount: schedules.length,
    stopHeadwayGroupCount: headwayGroups.length,
    headwaySampleCount,
    medianScheduledHeadwayMinutes: samples.length === 0 ? null : round(quantile(samples, 0.5) ?? 0),
    p90ScheduledHeadwayMinutes: samples.length === 0 ? null : round(quantile(samples, 0.9) ?? 0),
    maxScheduledHeadwayMinutes:
      headwayGroups.length === 0
        ? null
        : round(Math.max(...headwayGroups.map((group) => group.maxHeadwayMinutes))),
    scheduledShortHeadwayShare:
      headwayGroups.length === 0 ? null : round(shortGroupCount / headwayGroups.length),
    scheduledLongGapShare:
      headwayGroups.length === 0 ? null : round(longGroupCount / headwayGroups.length),
    topLongGapWindows: headwayGroups
      .sort((left, right) => {
        if (left.p90HeadwayMinutes !== right.p90HeadwayMinutes) {
          return right.p90HeadwayMinutes - left.p90HeadwayMinutes;
        }

        return right.maxHeadwayMinutes - left.maxHeadwayMinutes;
      })
      .slice(0, 5),
    sourceStatus: {
      scheduledHeadways: "available",
      observedHeadways: "needs_gtfs_rt_collection",
      bunching: "needs_gtfs_rt_collection",
      waitTimeReliability: "needs_gtfs_rt_collection",
      tripCancellationProxy: "needs_trip_update_history",
    },
  };
}

export async function buildRouteReliabilityBaseline(
  args: RouteReliabilityBaselineArgs = {},
): Promise<RouteReliabilityBaselineResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const readLocal = await openLocalPipelineDb(options.dbPath);
  let rows: RouteReliabilityBaselineRow[];
  try {
    const builtRoutes = await listRouteBriefSummaries(readLocal.db, month);
    rows = await Promise.all(
      builtRoutes.map(async (route) =>
        routeBaseline(
          route.routeId,
          month,
          await listRouteSchedules(readLocal.db, route.routeId, month),
        ),
      ),
    );
  } finally {
    readLocal.sqlite.close();
  }
  const writeLocal = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteReliabilityRows(writeLocal.db, month, {
      baselines: rows.map((row) => ({
        routeId: row.routeId,
        month: row.isoMonth,
        reliabilityStatus: row.reliabilityStatus,
        scheduledTimepointCount: row.scheduledTimepointCount,
        stopHeadwayGroupCount: row.stopHeadwayGroupCount,
        headwaySampleCount: row.headwaySampleCount,
        medianScheduledHeadwayMinutes: row.medianScheduledHeadwayMinutes,
        p90ScheduledHeadwayMinutes: row.p90ScheduledHeadwayMinutes,
        maxScheduledHeadwayMinutes: row.maxScheduledHeadwayMinutes,
        scheduledShortHeadwayShare: row.scheduledShortHeadwayShare,
        scheduledLongGapShare: row.scheduledLongGapShare,
      })),
      gapWindows: rows.flatMap((row) =>
        row.topLongGapWindows.map((window, index) => ({
          routeId: row.routeId,
          month: row.isoMonth,
          windowRank: index + 1,
          dayType: window.dayType,
          directionId: window.direction,
          stopId: window.stopId,
          stopName: window.stopName,
          sampleCount: window.sampleCount,
          medianHeadwayMinutes: window.medianHeadwayMinutes,
          p90HeadwayMinutes: window.p90HeadwayMinutes,
          maxHeadwayMinutes: window.maxHeadwayMinutes,
        })),
      ),
      sourceStatuses: rows.flatMap((row) =>
        Object.entries(row.sourceStatus).map(([sourceId, status]) => ({
          routeId: row.routeId,
          month: row.isoMonth,
          sourceScope: "reliability",
          sourceId,
          status,
          rowCount: null,
          snapshotId: null,
          note: null,
        })),
      ),
    });
  } finally {
    writeLocal.sqlite.close();
  }

  return {
    isoMonth: month,
    routeCount: rows.length,
    headwaySampleCount: rows.reduce((sum, row) => sum + row.headwaySampleCount, 0),
  };
}

export async function buildRouteReliabilityBaselineFromCli(
  args: string[],
): Promise<RouteReliabilityBaselineResult> {
  return buildRouteReliabilityBaseline(parseCliArgs(args));
}

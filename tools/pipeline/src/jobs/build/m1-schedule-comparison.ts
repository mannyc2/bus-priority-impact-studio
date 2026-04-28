import {
  type LocalRouteScheduleTimepoint,
  listRouteHotspots,
  listRouteSchedules,
} from "@bp/db/local";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

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

type PairAccumulator = {
  routeId: string;
  direction: string;
  fromStopId: string;
  fromStopName?: string;
  toStopId: string;
  toStopName?: string;
  scheduledTravelTimes: number[];
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

function pairKey(direction: string, fromStopId: string, toStopId: string): string {
  return `${direction}:${fromStopId}:${toStopId}`;
}

function groupKey(row: LocalRouteScheduleTimepoint): string {
  return [row.scheduleDate, row.dayType, row.direction, row.blockId].join(":");
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);

  return Math.round(value * 10) / 10;
}

function buildScheduledPairs(rows: LocalRouteScheduleTimepoint[]): Map<string, PairAccumulator> {
  const groups = new Map<string, LocalRouteScheduleTimepoint[]>();

  for (const row of rows) {
    const rowsForGroup = groups.get(groupKey(row)) ?? [];
    rowsForGroup.push(row);
    groups.set(groupKey(row), rowsForGroup);
  }

  const pairs = new Map<string, PairAccumulator>();

  for (const rowsForGroup of groups.values()) {
    rowsForGroup.sort((left, right) => {
      const timeCompare = left.scheduleTime.localeCompare(right.scheduleTime);
      if (timeCompare !== 0) {
        return timeCompare;
      }

      return left.stopSequence - right.stopSequence;
    });

    let currentTrip: LocalRouteScheduleTimepoint[] = [];
    let previousSequence = -1;

    for (const row of rowsForGroup) {
      if (currentTrip.length > 0 && row.stopSequence <= previousSequence) {
        addTripPairs(currentTrip, pairs);
        currentTrip = [];
      }

      currentTrip.push(row);
      previousSequence = row.stopSequence;
    }

    addTripPairs(currentTrip, pairs);
  }

  return pairs;
}

function addTripPairs(
  tripRows: LocalRouteScheduleTimepoint[],
  pairs: Map<string, PairAccumulator>,
): void {
  for (let index = 0; index < tripRows.length - 1; index += 1) {
    const from = tripRows[index];
    const to = tripRows[index + 1];
    if (from === undefined || to === undefined) {
      continue;
    }

    const travelTimeMinutes =
      (Date.parse(to.scheduleTime) - Date.parse(from.scheduleTime)) / 60_000;
    if (travelTimeMinutes <= 0 || travelTimeMinutes > 180) {
      continue;
    }

    const key = pairKey(from.direction, from.stopId, to.stopId);
    let accumulator = pairs.get(key);
    if (accumulator === undefined) {
      accumulator = {
        routeId: from.routeId,
        direction: from.direction,
        fromStopId: from.stopId,
        toStopId: to.stopId,
        scheduledTravelTimes: [],
      };

      if (from.stopName !== undefined) {
        accumulator.fromStopName = from.stopName;
      }
      if (to.stopName !== undefined) {
        accumulator.toStopName = to.stopName;
      }
    }

    accumulator.scheduledTravelTimes.push(travelTimeMinutes);
    pairs.set(key, accumulator);
  }
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
  const scheduledPairs = buildScheduledPairs(schedules);
  const hotspotComparisons = hotspots.map((hotspot) => {
    const pair = scheduledPairs.get(
      pairKey(hotspot.direction, hotspot.timepointStopId, hotspot.nextTimepointStopId),
    );
    const scheduledMedianTravelTimeMinutes =
      pair === undefined ? null : median(pair.scheduledTravelTimes);
    const observedMinusScheduledMinutes =
      scheduledMedianTravelTimeMinutes === null
        ? null
        : Math.round(
            (hotspot.weightedAverageTravelTimeMinutes - scheduledMedianTravelTimeMinutes) * 10,
          ) / 10;

    return {
      segmentId: hotspot.segmentId,
      direction: hotspot.direction,
      from: hotspot.timepointStopName,
      to: hotspot.nextTimepointStopName,
      observedTravelTimeMinutes: hotspot.weightedAverageTravelTimeMinutes,
      scheduledMedianTravelTimeMinutes,
      observedMinusScheduledMinutes,
      scheduledSampleCount: pair?.scheduledTravelTimes.length ?? 0,
      observedBusTripCount: hotspot.busTripCount,
      observedSpeedMph: hotspot.weightedAverageSpeedMph,
      hotspotScore: hotspot.hotspotScore,
      riderImpactScore: hotspot.riderImpactScore ?? null,
    };
  });
  const matchedHotspotCount = hotspotComparisons.filter(
    (comparison) => comparison.scheduledMedianTravelTimeMinutes !== null,
  ).length;
  const comparison = {
    schemaVersion,
    routeId: options.routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    scheduleFetchedAt: null,
    scheduledPairCount: scheduledPairs.size,
    hotspotCount: hotspotComparisons.length,
    matchedHotspotCount,
    hotspotComparisons,
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
    scheduledPairCount: scheduledPairs.size,
    matchedHotspotCount,
  };
}

export async function buildM1ScheduleComparisonFromCli(
  args: string[],
): Promise<ScheduleComparisonResult> {
  return buildM1ScheduleComparison(parseCliArgs(args));
}

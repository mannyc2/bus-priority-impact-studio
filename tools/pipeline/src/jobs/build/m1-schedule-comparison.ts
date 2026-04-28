import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NormalizedScheduleTimepointSchema } from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const SchedulesArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: z.literal("bus_schedules_2026"),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    fetchedAt: z.iso.datetime(),
    rows: z.array(NormalizedScheduleTimepointSchema),
  })
  .strict();

const HotspotSchema = z
  .object({
    segmentId: z.string().min(1),
    direction: z.string().min(1),
    timepointStopId: z.string().min(1),
    timepointStopName: z.string().min(1),
    nextTimepointStopId: z.string().min(1),
    nextTimepointStopName: z.string().min(1),
    weightedAverageTravelTimeMinutes: z.number().nonnegative(),
    weightedAverageSpeedMph: z.number().nonnegative(),
    busTripCount: z.number().int().nonnegative(),
    hotspotScore: z.number().int().min(0).max(100),
    riderImpactScore: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();

const HotspotsArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    result: z
      .object({
        routeId: z.string().min(1),
        isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
        hotspots: z.array(HotspotSchema),
      })
      .passthrough(),
  })
  .passthrough();

type ScheduleComparisonArgs = {
  routeId?: string;
  year?: number;
  month?: number;
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

function parseBuildArgs(args: ScheduleComparisonArgs): Required<ScheduleComparisonArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
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

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function pairKey(direction: string, fromStopId: string, toStopId: string): string {
  return `${direction}:${fromStopId}:${toStopId}`;
}

function groupKey(row: z.output<typeof NormalizedScheduleTimepointSchema>): string {
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

function buildScheduledPairs(
  rows: z.output<typeof NormalizedScheduleTimepointSchema>[],
): Map<string, PairAccumulator> {
  const groups = new Map<string, z.output<typeof NormalizedScheduleTimepointSchema>[]>();

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

    let currentTrip: z.output<typeof NormalizedScheduleTimepointSchema>[] = [];
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
  tripRows: z.output<typeof NormalizedScheduleTimepointSchema>[],
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
  const key = routeSliceKey(options.routeId, month);
  const workingDir = fromRepoRoot(join("data/working/route-slices", key));
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const comparisonPath = join(artifactDir, "schedule-comparison.json");
  const schedules = SchedulesArtifactSchema.parse(
    await Bun.file(join(workingDir, "schedules.json")).json(),
  );
  const hotspotsArtifact = HotspotsArtifactSchema.parse(
    await Bun.file(join(artifactDir, "hotspots.json")).json(),
  );
  const scheduledPairs = buildScheduledPairs(schedules.rows);
  const hotspotComparisons = hotspotsArtifact.result.hotspots.map((hotspot) => {
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
    routeId: schedules.routeId,
    analysisPeriod: schedules.isoMonth,
    generatedAt: new Date().toISOString(),
    scheduleFetchedAt: schedules.fetchedAt,
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

  await mkdir(artifactDir, { recursive: true });
  await writeJson(comparisonPath, comparison);

  return {
    routeId: schedules.routeId,
    isoMonth: schedules.isoMonth,
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

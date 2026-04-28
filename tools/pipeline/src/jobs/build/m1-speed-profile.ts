import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NormalizedSegmentSpeedSchema } from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;
const slowSpeedThresholdMph = 8;

const SegmentSpeedArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(NormalizedSegmentSpeedSchema),
  })
  .strict();

type SpeedProfileArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
};

type SpeedProfileResult = {
  routeId: string;
  isoMonth: string;
  profilePath: string;
  directionCount: number;
  daypartCount: number;
  slowWindowCount: number;
};

type SpeedRow = z.output<typeof NormalizedSegmentSpeedSchema>;

type SpeedAccumulator = {
  observationCount: number;
  busTripCount: number;
  weightedSpeedSum: number;
  weightedTravelTimeSum: number;
  slowObservationCount: number;
  segmentIds: Set<string>;
};

function parseBuildArgs(args: SpeedProfileArgs): Required<SpeedProfileArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
  };
}

function parseCliArgs(args: string[]): SpeedProfileArgs {
  const output: SpeedProfileArgs = {};

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

    if (arg === "--limit" && value !== undefined) {
      output.limit = Number(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function daypart(hourOfDay: number): string {
  if (hourOfDay >= 6 && hourOfDay <= 9) {
    return "AM peak";
  }
  if (hourOfDay >= 10 && hourOfDay <= 15) {
    return "Midday";
  }
  if (hourOfDay >= 16 && hourOfDay <= 19) {
    return "PM peak";
  }
  if (hourOfDay >= 20 && hourOfDay <= 23) {
    return "Evening";
  }

  return "Overnight";
}

function segmentId(row: SpeedRow): string {
  return [row.direction, row.stopOrder, row.timepointStopId, row.nextTimepointStopId].join(":");
}

function createAccumulator(): SpeedAccumulator {
  return {
    observationCount: 0,
    busTripCount: 0,
    weightedSpeedSum: 0,
    weightedTravelTimeSum: 0,
    slowObservationCount: 0,
    segmentIds: new Set(),
  };
}

function addRow(accumulator: SpeedAccumulator, row: SpeedRow): void {
  if (row.busTripCount <= 0) {
    return;
  }

  accumulator.observationCount += 1;
  accumulator.busTripCount += row.busTripCount;
  accumulator.weightedSpeedSum += row.averageRoadSpeedMph * row.busTripCount;
  accumulator.weightedTravelTimeSum += row.averageTravelTimeMinutes * row.busTripCount;
  accumulator.segmentIds.add(segmentId(row));
  if (row.averageRoadSpeedMph < slowSpeedThresholdMph) {
    accumulator.slowObservationCount += 1;
  }
}

function summarizeAccumulator(accumulator: SpeedAccumulator) {
  return {
    observationCount: accumulator.observationCount,
    busTripCount: accumulator.busTripCount,
    segmentCount: accumulator.segmentIds.size,
    weightedAverageSpeedMph: round(accumulator.weightedSpeedSum / accumulator.busTripCount),
    weightedAverageTravelTimeMinutes: round(
      accumulator.weightedTravelTimeSum / accumulator.busTripCount,
    ),
    slowObservationShare: round(accumulator.slowObservationCount / accumulator.observationCount),
  };
}

function addToGroup(groups: Map<string, SpeedAccumulator>, key: string, row: SpeedRow): void {
  const accumulator = groups.get(key) ?? createAccumulator();
  addRow(accumulator, row);
  groups.set(key, accumulator);
}

export async function buildM1SpeedProfile(
  args: SpeedProfileArgs = {},
): Promise<SpeedProfileResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const workingDir = fromRepoRoot(join("data/working/route-slices", key));
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const profilePath = join(artifactDir, "speed-profile.json");
  const speeds = SegmentSpeedArtifactSchema.parse(
    await Bun.file(join(workingDir, "segment-speeds.json")).json(),
  );
  const directionGroups = new Map<string, SpeedAccumulator>();
  const daypartGroups = new Map<string, SpeedAccumulator>();
  const dayHourGroups = new Map<string, SpeedAccumulator>();

  for (const row of speeds.rows) {
    addToGroup(directionGroups, row.direction, row);
    addToGroup(daypartGroups, `${row.direction}:${daypart(row.hourOfDay)}`, row);
    addToGroup(dayHourGroups, `${row.dayOfWeek}:${row.hourOfDay}`, row);
  }

  const directionProfiles = [...directionGroups.entries()]
    .map(([direction, accumulator]) => ({
      direction,
      ...summarizeAccumulator(accumulator),
    }))
    .sort((left, right) => left.direction.localeCompare(right.direction));
  const daypartProfiles = [...daypartGroups.entries()]
    .map(([key, accumulator]) => {
      const [direction, part] = key.split(":");

      return {
        direction: direction ?? "",
        daypart: part ?? "",
        ...summarizeAccumulator(accumulator),
      };
    })
    .sort(
      (left, right) =>
        left.direction.localeCompare(right.direction) || left.daypart.localeCompare(right.daypart),
    );
  const slowestDayHourWindows = [...dayHourGroups.entries()]
    .map(([key, accumulator]) => {
      const [dayOfWeek, hourOfDay] = key.split(":");

      return {
        dayOfWeek: dayOfWeek ?? "",
        hourOfDay: Number(hourOfDay),
        ...summarizeAccumulator(accumulator),
      };
    })
    .sort((left, right) => {
      if (left.weightedAverageSpeedMph !== right.weightedAverageSpeedMph) {
        return left.weightedAverageSpeedMph - right.weightedAverageSpeedMph;
      }

      return right.busTripCount - left.busTripCount;
    })
    .slice(0, options.limit);
  const profile = {
    schemaVersion,
    routeId: speeds.routeId,
    analysisPeriod: speeds.isoMonth,
    generatedAt: new Date().toISOString(),
    slowSpeedThresholdMph,
    observationCount: speeds.rows.length,
    directionProfiles,
    daypartProfiles,
    slowestDayHourWindows,
    caveats: [
      "Speed profiles aggregate MTA segment-speed timepoint observations by direction, daypart, and day/hour.",
      "Slow-window shares count observation rows below 8 mph; they are not headway reliability measures.",
    ],
  };

  await mkdir(artifactDir, { recursive: true });
  await writeJson(profilePath, profile);

  return {
    routeId: speeds.routeId,
    isoMonth: speeds.isoMonth,
    profilePath,
    directionCount: directionProfiles.length,
    daypartCount: daypartProfiles.length,
    slowWindowCount: slowestDayHourWindows.length,
  };
}

export async function buildM1SpeedProfileFromCli(args: string[]): Promise<SpeedProfileResult> {
  return buildM1SpeedProfile(parseCliArgs(args));
}

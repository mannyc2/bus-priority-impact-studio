import { listRouteSegmentSpeeds } from "@bp/db/local";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { groupedSpeedProfiles, slowSpeedThresholdMph } from "./route-brief-metrics.js";

const schemaVersion = 1;

type SpeedProfileArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type SpeedProfileResult = {
  routeId: string;
  isoMonth: string;
  profilePath: string;
  directionCount: number;
  daypartCount: number;
  slowWindowCount: number;
};

type SpeedProfileOptions = Required<SpeedProfileArgs>;

function parseBuildArgs(args: SpeedProfileArgs): SpeedProfileOptions {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
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

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

export async function buildM1SpeedProfile(
  args: SpeedProfileArgs = {},
): Promise<SpeedProfileResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const local = await openLocalPipelineDb(options.dbPath);
  const rows = await listRouteSegmentSpeeds(local.db, options.routeId, month);
  local.sqlite.close();
  const speedProfile = groupedSpeedProfiles(rows);
  const slowestDayHourWindows = speedProfile.slowestDayHourWindows.slice(0, options.limit);
  const profile = {
    schemaVersion,
    routeId: options.routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    slowSpeedThresholdMph,
    observationCount: rows.length,
    directionProfiles: speedProfile.directionProfiles,
    daypartProfiles: speedProfile.daypartProfiles,
    slowestDayHourWindows,
    caveats: [
      "Speed profiles aggregate MTA segment-speed timepoint observations by direction, daypart, and day/hour.",
      "Slow-window shares count observation rows below 8 mph; they are not headway reliability measures.",
    ],
  };

  const profilePath = await writeRouteSliceArtifact(
    options.routeId,
    month,
    "speed-profile.json",
    profile,
  );

  return {
    routeId: options.routeId,
    isoMonth: month,
    profilePath,
    directionCount: speedProfile.directionProfiles.length,
    daypartCount: speedProfile.daypartProfiles.length,
    slowWindowCount: slowestDayHourWindows.length,
  };
}

export async function buildM1SpeedProfileFromCli(args: string[]): Promise<SpeedProfileResult> {
  return buildM1SpeedProfile(parseCliArgs(args));
}

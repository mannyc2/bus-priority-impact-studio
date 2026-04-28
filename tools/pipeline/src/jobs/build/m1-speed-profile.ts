import { listRouteSegmentSpeeds } from "@bp/db/local";
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
  return parseCliOptions<SpeedProfileArgs>(args, {}, [
    routeOption(),
    yearOption(),
    monthOption(),
    {
      flags: ["--limit"],
      apply: (output, value) => {
        output.limit = Number(value);
      },
    },
    dbOption(fromCliPath),
  ]);
}

export async function buildM1SpeedProfile(
  args: SpeedProfileArgs = {},
): Promise<SpeedProfileResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const rows = await withLocalPipelineDb(options.dbPath, (local) =>
    listRouteSegmentSpeeds(local.db, options.routeId, month),
  );
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

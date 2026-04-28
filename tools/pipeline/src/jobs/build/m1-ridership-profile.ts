import { listRouteHourlyRidership, listRouteSegmentSpeeds } from "@bp/db/local";
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
import { ridershipProfiles } from "./route-brief-metrics.js";

const schemaVersion = 1;

type RidershipProfileArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type RidershipProfileResult = {
  routeId: string;
  isoMonth: string;
  profilePath: string;
  ridershipWindowCount: number;
  slowCrowdedWindowCount: number;
};

type RidershipProfileOptions = Required<RidershipProfileArgs>;

function parseBuildArgs(args: RidershipProfileArgs): RidershipProfileOptions {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RidershipProfileArgs {
  return parseCliOptions<RidershipProfileArgs>(args, {}, [
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

export async function buildM1RidershipProfile(
  args: RidershipProfileArgs = {},
): Promise<RidershipProfileResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const [ridershipRows, speedRows] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteHourlyRidership(local.db, options.routeId, month),
      listRouteSegmentSpeeds(local.db, options.routeId, month),
    ]),
  );
  const ridershipProfile = ridershipProfiles(ridershipRows, speedRows, options.limit);
  const profile = {
    schemaVersion,
    routeId: options.routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    ridershipWindowCount: ridershipProfile.ridershipWindowCount,
    speedWindowCount: ridershipProfile.speedWindowCount,
    totalRidership: ridershipProfile.totalRidership,
    totalTransfers: ridershipProfile.totalTransfers,
    peakRidershipWindow: ridershipProfile.peakRidershipWindow,
    topRidershipWindows: ridershipProfile.topRidershipWindows,
    slowCrowdedWindows: ridershipProfile.slowCrowdedWindows,
    caveats: [
      "Ridership windows are route-level hourly totals, not segment-level passenger loads.",
      "Slow crowded windows combine route-level ridership with route timepoint speed observations for the same day and hour.",
    ],
  };

  const profilePath = await writeRouteSliceArtifact(
    options.routeId,
    month,
    "ridership-profile.json",
    profile,
  );

  return {
    routeId: options.routeId,
    isoMonth: month,
    profilePath,
    ridershipWindowCount: ridershipRows.length,
    slowCrowdedWindowCount: ridershipProfile.slowCrowdedWindows.length,
  };
}

export async function buildM1RidershipProfileFromCli(
  args: string[],
): Promise<RidershipProfileResult> {
  return buildM1RidershipProfile(parseCliArgs(args));
}

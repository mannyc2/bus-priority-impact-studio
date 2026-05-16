import { listRouteHourlyRidership, listRouteSegmentSpeeds } from "@bp/db/local";
import type { CliOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createRouteMonthContext, parseRouteMonthDbCliArgs } from "../../lib/route-job.js";
import { groupedSpeedProfiles, ridershipProfiles } from "./route-brief-metrics.js";

type RouteProfileArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

export type RidershipProfileResult = {
  routeId: string;
  isoMonth: string;
  ridershipWindowCount: number;
  slowCrowdedWindowCount: number;
};

export type SpeedProfileResult = {
  routeId: string;
  isoMonth: string;
  directionCount: number;
  daypartCount: number;
  slowWindowCount: number;
};

function parseBuildArgs(args: RouteProfileArgs) {
  return {
    ...createRouteMonthContext(args),
    limit: args.limit ?? 10,
  };
}

function parseCliArgs(args: string[]): RouteProfileArgs {
  return parseRouteMonthDbCliArgs(args, {} as RouteProfileArgs, [
    {
      flags: ["--limit"],
      apply: (output, value) => {
        output.limit = Number(value);
      },
    },
  ] satisfies readonly CliOption<RouteProfileArgs>[]);
}

export async function buildRouteRidershipProfile(
  args: RouteProfileArgs = {},
): Promise<RidershipProfileResult> {
  const options = parseBuildArgs(args);
  const [ridershipRows, speedRows] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteHourlyRidership(local.db, options.routeId, options.isoMonth),
      listRouteSegmentSpeeds(local.db, options.routeId, options.isoMonth),
    ]),
  );
  const profile = ridershipProfiles(ridershipRows, speedRows, options.limit);

  return {
    routeId: options.routeId,
    isoMonth: options.isoMonth,
    ridershipWindowCount: ridershipRows.length,
    slowCrowdedWindowCount: profile.slowCrowdedWindows.length,
  };
}

export async function buildRouteRidershipProfileFromCli(
  args: string[],
): Promise<RidershipProfileResult> {
  return buildRouteRidershipProfile(parseCliArgs(args));
}

export async function buildRouteSpeedProfile(
  args: RouteProfileArgs = {},
): Promise<SpeedProfileResult> {
  const options = parseBuildArgs(args);
  const rows = await withLocalPipelineDb(options.dbPath, (local) =>
    listRouteSegmentSpeeds(local.db, options.routeId, options.isoMonth),
  );
  const speedProfile = groupedSpeedProfiles(rows);
  const slowestDayHourWindows = speedProfile.slowestDayHourWindows.slice(0, options.limit);

  return {
    routeId: options.routeId,
    isoMonth: options.isoMonth,
    directionCount: speedProfile.directionProfiles.length,
    daypartCount: speedProfile.daypartProfiles.length,
    slowWindowCount: slowestDayHourWindows.length,
  };
}

export async function buildRouteSpeedProfileFromCli(args: string[]): Promise<SpeedProfileResult> {
  return buildRouteSpeedProfile(parseCliArgs(args));
}

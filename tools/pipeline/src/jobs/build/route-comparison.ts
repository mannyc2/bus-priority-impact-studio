import {
  listRouteBriefSummaries,
  listRouteScorecards,
  replaceRouteComparisonRanks,
} from "@bp/db/local";
import { numberOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type RouteComparisonArgs = {
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type RouteComparisonResult = {
  isoMonth: string;
  routeCount: number;
  worstRouteId: string | null;
};

function parseBuildArgs(args: RouteComparisonArgs = {}): Required<RouteComparisonArgs> & {
  isoMonth: string;
} {
  return {
    ...createMonthContext(args),
    limit: args.limit ?? 10,
  };
}

function parseCliArgs(args: string[]): RouteComparisonArgs {
  return parseMonthDbCliArgs(args, {} as RouteComparisonArgs, [
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
  ]);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function buildRouteComparison(
  args: RouteComparisonArgs = {},
): Promise<RouteComparisonResult> {
  const options = parseBuildArgs(args);
  const [briefs, scorecards] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteBriefSummaries(local.db, options.isoMonth),
      listRouteScorecards(local.db, options.isoMonth),
    ]),
  );
  const scorecardsByRoute = new Map(scorecards.map((row) => [row.routeId, row]));
  const routeRows = briefs.map((brief) => {
    const scorecard = scorecardsByRoute.get(brief.routeId);

    return {
      routeId: brief.routeId,
      coverageStatus: scorecard?.coverageStatus ?? "no_observed_speed",
      routeScore: brief.routeScore,
      averageSpeedMph: brief.averageSpeedMph,
      hotspotCount: brief.hotspotCount,
      totalRidership: brief.totalRidership,
      totalTransfers: brief.totalTransfers,
      scheduleMatchRate: round(brief.scheduleMatchRate),
      aceActiveDuringAnalysisPeriod: brief.aceActive,
      aceViolationCount: brief.aceViolationCount,
      busLaneMatchedLaneCount: brief.busLaneMatchedLaneCount,
    };
  });
  const rankedRoutes = routeRows
    .filter((route) => route.coverageStatus === "full")
    .sort((left, right) => {
      if (left.routeScore !== right.routeScore) {
        return left.routeScore - right.routeScore;
      }

      return left.averageSpeedMph - right.averageSpeedMph;
    })
    .slice(0, options.limit);
  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteComparisonRanks(
      local.db,
      options.isoMonth,
      rankedRoutes.map((route, index) => ({
        month: options.isoMonth,
        rank: index + 1,
        routeId: route.routeId,
        routeScore: route.routeScore,
        averageSpeedMph: route.averageSpeedMph,
        totalRidership: route.totalRidership,
        aceViolationCount: route.aceViolationCount,
        busLaneMatchedLaneCount: route.busLaneMatchedLaneCount,
      })),
    ),
  );

  return {
    isoMonth: options.isoMonth,
    routeCount: routeRows.length,
    worstRouteId: rankedRoutes[0]?.routeId ?? null,
  };
}

export async function buildRouteComparisonFromCli(args: string[]): Promise<RouteComparisonResult> {
  return buildRouteComparison(parseCliArgs(args));
}

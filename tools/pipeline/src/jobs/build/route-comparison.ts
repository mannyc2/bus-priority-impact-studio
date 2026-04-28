import {
  listRouteBriefSummaries,
  listRouteScorecards,
  replaceRouteComparisonRanks,
} from "@bp/db/local";
import {
  dbOption,
  monthOption,
  numberOption,
  parseCliOptions,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

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

function parseBuildArgs(args: RouteComparisonArgs = {}): Required<RouteComparisonArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteComparisonArgs {
  return parseCliOptions(args, {} as RouteComparisonArgs, [
    yearOption(),
    monthOption(),
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
    dbOption(fromCliPath),
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
  const month = isoMonth(options.year, options.month);
  const readLocal = await openLocalPipelineDb(options.dbPath);
  const [briefs, scorecards] = await Promise.all([
    listRouteBriefSummaries(readLocal.db, month),
    listRouteScorecards(readLocal.db, month),
  ]);
  readLocal.sqlite.close();
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
  const writeLocal = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteComparisonRanks(
      writeLocal.db,
      month,
      rankedRoutes.map((route, index) => ({
        month,
        rank: index + 1,
        routeId: route.routeId,
        routeScore: route.routeScore,
        averageSpeedMph: route.averageSpeedMph,
        totalRidership: route.totalRidership,
        aceViolationCount: route.aceViolationCount,
        busLaneMatchedLaneCount: route.busLaneMatchedLaneCount,
      })),
    );
  } finally {
    writeLocal.sqlite.close();
  }

  return {
    isoMonth: month,
    routeCount: routeRows.length,
    worstRouteId: rankedRoutes[0]?.routeId ?? null,
  };
}

export async function buildRouteComparisonFromCli(args: string[]): Promise<RouteComparisonResult> {
  return buildRouteComparison(parseCliArgs(args));
}

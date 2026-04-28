import { join } from "node:path";
import {
  listRouteBriefSummaries,
  listRouteScorecards,
  replaceRouteComparisonRanks,
} from "@bp/db/local";
import { writeArtifact } from "../../lib/artifact-store.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

type RouteComparisonArgs = {
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type RouteComparisonResult = {
  isoMonth: string;
  comparisonPath: string;
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
  const output: RouteComparisonArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

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

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function buildRouteComparison(
  args: RouteComparisonArgs = {},
): Promise<RouteComparisonResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const comparisonPath = join(batchDir, "route-comparison.json");
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
  const comparison = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    routeCount: routeRows.length,
    rankingMethod:
      "Routes with observed speed coverage are sorted ascending by deterministic route score, then ascending by average speed.",
    rankedRoutes,
    caveats: [
      "Route comparison uses only routes included in the batch summary for the analysis period.",
      "Routes without observed speed coverage stay buildable and queryable, but are excluded from cross-route ranking.",
      "Scores are prioritization heuristics and should not be interpreted as official route grades.",
      "ACE and bus-lane fields are overlays, not causal estimates of intervention effect.",
    ],
  };

  await writeArtifact(batchDir, comparisonPath, comparison);
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
    comparisonPath,
    routeCount: routeRows.length,
    worstRouteId: rankedRoutes[0]?.routeId ?? null,
  };
}

export async function buildRouteComparisonFromCli(args: string[]): Promise<RouteComparisonResult> {
  return buildRouteComparison(parseCliArgs(args));
}

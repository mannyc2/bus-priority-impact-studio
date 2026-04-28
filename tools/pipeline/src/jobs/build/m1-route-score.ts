import { calculateRouteScore } from "@bp/analytics";
import { getRouteHotspotSummary } from "@bp/db/local";
import { type RouteCoverageStatusSchema, RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

type RouteScoreBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

type RouteScoreBuildResult = {
  routeId: string;
  isoMonth: string;
  scorecardPath: string;
  routeScore: number;
  coverageStatus: z.output<typeof RouteCoverageStatusSchema>;
  averageSpeedMph: number;
  hotspotCount: number;
};

function parseBuildArgs(args: RouteScoreBuildArgs): Required<RouteScoreBuildArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteScoreBuildArgs {
  const output: RouteScoreBuildArgs = {};

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

export async function buildM1RouteScore(
  args: RouteScoreBuildArgs = {},
): Promise<RouteScoreBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const local = await openLocalPipelineDb(options.dbPath);
  const summary = await getRouteHotspotSummary(local.db, options.routeId, month);
  local.sqlite.close();
  if (summary === null) {
    throw new Error(`No hotspot summary found for ${options.routeId} ${month}`);
  }
  const routeId = z.decode(RouteIdCodec, summary.routeId);
  const coverageStatus = summary.observationCount > 0 ? "full" : "no_observed_speed";
  const scorecard = calculateRouteScore({
    routeId,
    month: summary.isoMonth,
    coverageStatus,
    averageSpeedMph: summary.routeWeightedAverageSpeedMph,
    hotspotCount: summary.hotspotCount,
    citations: [
      {
        sourceId: "mta_bus_route_segment_speeds",
        title: "MTA Bus Route Segment Speeds",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds/kufs-yh3x",
        verifiedAt: summary.generatedAt,
      },
      {
        sourceId: "mta_bus_hourly_ridership",
        title: "MTA Bus Hourly Ridership",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-Beginning-2020/wujg-7c2s",
        verifiedAt: summary.generatedAt,
      },
    ],
  });

  const scorecardPath = await writeRouteSliceArtifact(
    options.routeId,
    month,
    "route-scorecard.json",
    scorecard,
  );

  return {
    routeId: scorecard.routeId,
    isoMonth: scorecard.month,
    scorecardPath,
    routeScore: scorecard.routeScore,
    coverageStatus: scorecard.coverageStatus,
    averageSpeedMph: scorecard.averageSpeedMph,
    hotspotCount: scorecard.hotspotCount,
  };
}

export async function buildM1RouteScoreFromCli(args: string[]): Promise<RouteScoreBuildResult> {
  return buildM1RouteScore(parseCliArgs(args));
}

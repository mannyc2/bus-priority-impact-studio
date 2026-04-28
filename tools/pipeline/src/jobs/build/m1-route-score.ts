import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { calculateRouteScore } from "@bp/analytics";
import { type RouteCoverageStatusSchema, RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const HotspotSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    routeWeightedAverageSpeedMph: z.number().nonnegative(),
    hotspotCount: z.number().int().nonnegative(),
    observationCount: z.number().int().nonnegative(),
    ridershipWeighted: z.boolean(),
    ridershipWindowCount: z.number().int().nonnegative(),
    ridershipExposure: z.number().nonnegative().optional(),
  })
  .passthrough();

type RouteScoreBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
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

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

export async function buildM1RouteScore(
  args: RouteScoreBuildArgs = {},
): Promise<RouteScoreBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const summaryPath = join(artifactDir, "summary.json");
  const scorecardPath = join(artifactDir, "route-scorecard.json");
  const summary = HotspotSummarySchema.parse(await Bun.file(summaryPath).json());
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

  await mkdir(artifactDir, { recursive: true });
  await writeJson(scorecardPath, scorecard);

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

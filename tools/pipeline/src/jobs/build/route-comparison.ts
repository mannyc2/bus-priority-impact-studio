import { join } from "node:path";
import { replaceRouteComparisonRanks } from "@bp/db/local";
import * as z from "zod";
import { readArtifact, writeArtifact } from "../../lib/artifact-store.js";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const BatchSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    routeCount: z.number().int().nonnegative(),
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
          segmentSpeedRows: z.number().int().nonnegative(),
          ridershipWindows: z.number().int().nonnegative(),
          scheduleTimepoints: z.number().int().nonnegative(),
          hotspotCount: z.number().int().nonnegative(),
          routeScore: z.number().int().nonnegative(),
          artifactCount: z.number().int().nonnegative(),
          manifestPath: z.string().min(1),
        })
        .strict(),
    ),
  })
  .passthrough();

const RouteBriefInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    metrics: z
      .object({
        routeScore: z.number().int().nonnegative(),
        coverageStatus: z.enum(["full", "no_observed_speed"]).optional(),
        observedSpeedAvailable: z.boolean().optional(),
        averageSpeedMph: z.number().nonnegative(),
        hotspotCount: z.number().int().nonnegative(),
        segmentCount: z.number().int().nonnegative(),
        observationCount: z.number().int().nonnegative(),
        busTripCount: z.number().int().nonnegative(),
        ridershipWindowCount: z.number().int().nonnegative(),
        totalRidership: z.number().nonnegative(),
        totalTransfers: z.number().nonnegative(),
        scheduledPairCount: z.number().int().nonnegative(),
        scheduleMatchedHotspotCount: z.number().int().nonnegative(),
      })
      .passthrough(),
    interventionStatus: z
      .object({
        aceRouteMatched: z.boolean(),
        aceActiveDuringAnalysisPeriod: z.boolean(),
        aceViolationCount: z.number().int().nonnegative(),
        aceViolationGroupedRowCount: z.number().int().nonnegative(),
        busLaneMatchedLaneCount: z.number().int().nonnegative(),
        busLaneMatchedStreetCount: z.number().int().nonnegative(),
      })
      .passthrough(),
    ridershipProfile: z
      .object({
        peakRidershipWindow: z.unknown().nullable(),
        slowCrowdedWindows: z.array(z.unknown()),
      })
      .passthrough(),
    speedProfile: z
      .object({
        directionProfiles: z.array(z.unknown()),
        daypartProfiles: z.array(z.unknown()),
        slowestDayHourWindows: z.array(z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

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

function firstObjectField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") {
    return null;
  }

  return (value as Record<string, unknown>)[key] ?? null;
}

export async function buildRouteComparison(
  args: RouteComparisonArgs = {},
): Promise<RouteComparisonResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const comparisonPath = join(batchDir, "route-comparison.json");
  const batch = await readArtifact(join(batchDir, "batch-summary.json"), BatchSummarySchema);
  const routeRows = await Promise.all(
    batch.routes.map(async (route) => {
      const briefPath = fromRepoRoot(
        join(
          "data/artifacts/route-slices",
          routeSliceKey(route.routeId, month),
          "route-brief-input.json",
        ),
      );
      const brief = await readArtifact(briefPath, RouteBriefInputSchema);
      const scheduleMatchRate =
        brief.metrics.hotspotCount === 0
          ? 0
          : brief.metrics.scheduleMatchedHotspotCount / brief.metrics.hotspotCount;

      return {
        routeId: route.routeId,
        coverageStatus:
          brief.metrics.coverageStatus ??
          (brief.metrics.observedSpeedAvailable === false ? "no_observed_speed" : "full"),
        routeScore: brief.metrics.routeScore,
        averageSpeedMph: brief.metrics.averageSpeedMph,
        hotspotCount: brief.metrics.hotspotCount,
        segmentCount: brief.metrics.segmentCount,
        observationCount: brief.metrics.observationCount,
        busTripCount: brief.metrics.busTripCount,
        totalRidership: brief.metrics.totalRidership,
        totalTransfers: brief.metrics.totalTransfers,
        scheduledPairCount: brief.metrics.scheduledPairCount,
        scheduleMatchedHotspotCount: brief.metrics.scheduleMatchedHotspotCount,
        scheduleMatchRate: round(scheduleMatchRate),
        aceActiveDuringAnalysisPeriod: brief.interventionStatus.aceActiveDuringAnalysisPeriod,
        aceViolationCount: brief.interventionStatus.aceViolationCount,
        busLaneMatchedLaneCount: brief.interventionStatus.busLaneMatchedLaneCount,
        busLaneMatchedStreetCount: brief.interventionStatus.busLaneMatchedStreetCount,
        peakRidershipDay: firstObjectField(brief.ridershipProfile.peakRidershipWindow, "dayOfWeek"),
        peakRidershipHour: firstObjectField(
          brief.ridershipProfile.peakRidershipWindow,
          "hourOfDay",
        ),
        peakRidership: firstObjectField(brief.ridershipProfile.peakRidershipWindow, "ridership"),
        slowCrowdedWindowCount: brief.ridershipProfile.slowCrowdedWindows.length,
        slowestDayHourWindow: brief.speedProfile.slowestDayHourWindows[0] ?? null,
        artifactCount: route.artifactCount,
      };
    }),
  );
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
  const local = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteComparisonRanks(
      local.db,
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
    local.sqlite.close();
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

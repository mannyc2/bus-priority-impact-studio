import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { RouteScorecardSchema } from "@bp/domain";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const SegmentHotspotSummarySchema = z
  .object({
    segmentId: z.string().min(1),
    direction: z.string().min(1),
    stopOrder: z.number().int().nonnegative(),
    timepointStopName: z.string().min(1),
    nextTimepointStopName: z.string().min(1),
    observationCount: z.number().int().nonnegative(),
    busTripCount: z.number().int().nonnegative(),
    weightedAverageSpeedMph: z.number().nonnegative(),
    weightedAverageTravelTimeMinutes: z.number().nonnegative(),
    averageRoadDistanceMiles: z.number().nonnegative(),
    slowWindowShare: z.number().min(0).max(1),
    hotspotScore: z.number().int().min(0).max(100),
    ridershipExposure: z.number().nonnegative().optional(),
    riderImpactScore: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();

const HotspotSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    routeWeightedAverageSpeedMph: z.number().nonnegative(),
    observationCount: z.number().int().nonnegative(),
    busTripCount: z.number().int().nonnegative(),
    ridershipWeighted: z.boolean(),
    ridershipWindowCount: z.number().int().nonnegative(),
    ridershipMatchedObservationCount: z.number().int().nonnegative(),
    ridershipExposure: z.number().nonnegative(),
    segmentCount: z.number().int().nonnegative(),
    hotspotCount: z.number().int().nonnegative(),
    topHotspots: z.array(SegmentHotspotSummarySchema),
  })
  .strict();

const InterventionOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    sources: z.array(
      z
        .object({
          sourceId: z.string().min(1),
          title: z.string().min(1),
          url: z.url(),
          verifiedAt: z.iso.datetime(),
        })
        .strict(),
    ),
    ace: z
      .object({
        routeMatched: z.boolean(),
        routeMatchCount: z.number().int().nonnegative(),
        activeDuringAnalysisPeriod: z.boolean(),
        activePrograms: z.array(z.unknown()),
        futurePrograms: z.array(z.unknown()),
      })
      .strict(),
    violations: z
      .object({
        analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
        routeViolationCount: z.number().int().nonnegative(),
        groupedRowCount: z.number().int().nonnegative(),
        violationTypeCounts: z.array(z.unknown()),
      })
      .strict(),
    caveats: z.array(z.string().min(1)),
  })
  .strict();

const BusLaneOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    matchedLaneCount: z.number().int().nonnegative(),
    matchedStreetCount: z.number().int().nonnegative(),
    matchedStreets: z.array(z.string().min(1)),
    sources: z.array(
      z
        .object({
          sourceId: z.string().min(1),
          title: z.string().min(1),
          url: z.url(),
          verifiedAt: z.iso.datetime(),
        })
        .strict(),
    ),
    caveats: z.array(z.string().min(1)),
  })
  .passthrough();

const ScheduleComparisonSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    scheduleFetchedAt: z.iso.datetime(),
    scheduledPairCount: z.number().int().nonnegative(),
    hotspotCount: z.number().int().nonnegative(),
    matchedHotspotCount: z.number().int().nonnegative(),
    hotspotComparisons: z.array(z.unknown()),
    caveats: z.array(z.string().min(1)),
  })
  .strict();

const RidershipProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    ridershipWindowCount: z.number().int().nonnegative(),
    speedWindowCount: z.number().int().nonnegative(),
    totalRidership: z.number().nonnegative(),
    totalTransfers: z.number().nonnegative(),
    peakRidershipWindow: z.unknown().nullable(),
    topRidershipWindows: z.array(z.unknown()),
    slowCrowdedWindows: z.array(z.unknown()),
    caveats: z.array(z.string().min(1)),
  })
  .strict();

const SpeedProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    slowSpeedThresholdMph: z.number().positive(),
    observationCount: z.number().int().nonnegative(),
    directionProfiles: z.array(z.unknown()),
    daypartProfiles: z.array(z.unknown()),
    slowestDayHourWindows: z.array(z.unknown()),
    caveats: z.array(z.string().min(1)),
  })
  .strict();

type RouteBriefBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  topSegmentLimit?: number;
};

type RouteBriefBuildResult = {
  routeId: string;
  isoMonth: string;
  briefInputPath: string;
  topSegmentCount: number;
};

function parseBuildArgs(args: RouteBriefBuildArgs): Required<RouteBriefBuildArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    topSegmentLimit: args.topSegmentLimit ?? 5,
  };
}

function parseCliArgs(args: string[]): RouteBriefBuildArgs {
  const output: RouteBriefBuildArgs = {};

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

    if (arg === "--top-segments" && value !== undefined) {
      output.topSegmentLimit = Number(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function pct(value: number): number {
  return Math.round(value * 1000) / 10;
}

export async function buildM1RouteBriefInput(
  args: RouteBriefBuildArgs = {},
): Promise<RouteBriefBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const summary = HotspotSummarySchema.parse(
    await Bun.file(join(artifactDir, "summary.json")).json(),
  );
  const scorecard = RouteScorecardSchema.parse(
    await Bun.file(join(artifactDir, "route-scorecard.json")).json(),
  );
  const interventionOverlay = InterventionOverlaySchema.parse(
    await Bun.file(join(artifactDir, "intervention-overlay.json")).json(),
  );
  const busLaneOverlay = BusLaneOverlaySchema.parse(
    await Bun.file(join(artifactDir, "bus-lane-overlay.json")).json(),
  );
  const scheduleComparison = ScheduleComparisonSchema.parse(
    await Bun.file(join(artifactDir, "schedule-comparison.json")).json(),
  );
  const ridershipProfile = RidershipProfileSchema.parse(
    await Bun.file(join(artifactDir, "ridership-profile.json")).json(),
  );
  const speedProfile = SpeedProfileSchema.parse(
    await Bun.file(join(artifactDir, "speed-profile.json")).json(),
  );
  const topSegments = summary.topHotspots.slice(0, options.topSegmentLimit).map((hotspot) => ({
    segmentId: hotspot.segmentId,
    direction: hotspot.direction,
    stopOrder: hotspot.stopOrder,
    from: hotspot.timepointStopName,
    to: hotspot.nextTimepointStopName,
    weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
    weightedAverageTravelTimeMinutes: hotspot.weightedAverageTravelTimeMinutes,
    averageRoadDistanceMiles: hotspot.averageRoadDistanceMiles,
    slowWindowPercent: pct(hotspot.slowWindowShare),
    busTripCount: hotspot.busTripCount,
    observationCount: hotspot.observationCount,
    hotspotScore: hotspot.hotspotScore,
    riderImpactScore: hotspot.riderImpactScore ?? null,
    ridershipExposure: hotspot.ridershipExposure ?? null,
  }));
  const briefInput = {
    schemaVersion: 1,
    routeId: summary.routeId,
    analysisPeriod: summary.isoMonth,
    generatedAt: new Date().toISOString(),
    sourceArtifactGeneratedAt: summary.generatedAt,
    metrics: {
      routeScore: scorecard.routeScore,
      coverageStatus: scorecard.coverageStatus,
      observedSpeedAvailable: scorecard.coverageStatus === "full",
      averageSpeedMph: scorecard.averageSpeedMph,
      hotspotCount: scorecard.hotspotCount,
      segmentCount: summary.segmentCount,
      observationCount: summary.observationCount,
      busTripCount: summary.busTripCount,
      ridershipWeighted: summary.ridershipWeighted,
      ridershipWindowCount: summary.ridershipWindowCount,
      ridershipMatchedObservationCount: summary.ridershipMatchedObservationCount,
      ridershipExposure: summary.ridershipExposure,
      totalRidership: ridershipProfile.totalRidership,
      totalTransfers: ridershipProfile.totalTransfers,
      scheduledPairCount: scheduleComparison.scheduledPairCount,
      scheduleMatchedHotspotCount: scheduleComparison.matchedHotspotCount,
    },
    ridershipProfile: {
      peakRidershipWindow: ridershipProfile.peakRidershipWindow,
      topRidershipWindows: ridershipProfile.topRidershipWindows,
      slowCrowdedWindows: ridershipProfile.slowCrowdedWindows,
    },
    speedProfile: {
      slowSpeedThresholdMph: speedProfile.slowSpeedThresholdMph,
      directionProfiles: speedProfile.directionProfiles,
      daypartProfiles: speedProfile.daypartProfiles,
      slowestDayHourWindows: speedProfile.slowestDayHourWindows,
    },
    interventionStatus: {
      aceRouteMatched: interventionOverlay.ace.routeMatched,
      aceActiveDuringAnalysisPeriod: interventionOverlay.ace.activeDuringAnalysisPeriod,
      aceRouteMatchCount: interventionOverlay.ace.routeMatchCount,
      aceActiveProgramCount: interventionOverlay.ace.activePrograms.length,
      aceFutureProgramCount: interventionOverlay.ace.futurePrograms.length,
      aceViolationCount: interventionOverlay.violations.routeViolationCount,
      aceViolationGroupedRowCount: interventionOverlay.violations.groupedRowCount,
      busLaneMatchedLaneCount: busLaneOverlay.matchedLaneCount,
      busLaneMatchedStreetCount: busLaneOverlay.matchedStreetCount,
      busLaneMatchedStreets: busLaneOverlay.matchedStreets,
    },
    topSegments,
    scheduleComparisons: scheduleComparison.hotspotComparisons,
    caveats: [
      "Route score is a deterministic prioritization heuristic, not an official MTA grade.",
      ...(scorecard.coverageStatus === "full"
        ? []
        : [
            "No observed segment-speed rows were available for this route and month; speed and hotspot metrics are placeholders, not measured performance.",
          ]),
      "Ridership exposure is joined at route/day/hour level; it is not segment-level passenger load.",
      ...interventionOverlay.caveats,
      ...busLaneOverlay.caveats,
      ...scheduleComparison.caveats,
      ...ridershipProfile.caveats,
      ...speedProfile.caveats,
      "The current artifact does not include service-alert or causal intervention overlays.",
      "The hotspot summary is limited to the selected route and month.",
    ],
    sources: [...scorecard.citations, ...interventionOverlay.sources, ...busLaneOverlay.sources],
  };
  const briefInputPath = join(artifactDir, "route-brief-input.json");

  await mkdir(artifactDir, { recursive: true });
  await writeJson(briefInputPath, briefInput);

  return {
    routeId: summary.routeId,
    isoMonth: summary.isoMonth,
    briefInputPath,
    topSegmentCount: topSegments.length,
  };
}

export async function buildM1RouteBriefInputFromCli(
  args: string[],
): Promise<RouteBriefBuildResult> {
  return buildM1RouteBriefInput(parseCliArgs(args));
}

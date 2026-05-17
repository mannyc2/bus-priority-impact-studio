import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LocalCorridor,
  LocalCorridorArtifact,
  LocalCorridorHotspot,
  LocalCorridorMonthSummary,
  LocalCorridorRouteMember,
  LocalGtfsRtCollectionRun,
  LocalGtfsRtFeedSnapshot,
  LocalObservedHeadwaySample,
  LocalRouteArtifact,
  LocalRouteBriefSummary,
  LocalRouteCatalogEntry,
  LocalRouteHotspot,
  LocalRouteInterventionComparison,
  LocalRouteObservedReliabilitySummary,
  LocalRouteReliabilityBaseline,
} from "@bp/db/local";
import {
  listCorridorHotspots,
  listCorridorMonthSummaries,
  listCorridorRouteMembers,
  listCorridors,
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listObservedHeadwaySamples,
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteHotspots,
  listRouteInterventionComparisons,
  listRouteObservedReliabilitySummaries,
  listRouteReliabilityBaselines,
  replaceCorridorArtifacts,
  replaceRouteArtifactsForMonth,
} from "@bp/db/local";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

const schemaVersion = 1;
const topHotspotLimit = 5;
const topObservedWindowLimit = 5;
const artifactNames = ["brief.json", "brief.md", "brief.html"] as const;

type BriefArtifactName = (typeof artifactNames)[number];

type BriefArtifactsArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
};

type BriefArtifactsResult = {
  isoMonth: string;
  routeBriefCount: number;
  corridorBriefCount: number;
  routeArtifactCount: number;
  corridorArtifactCount: number;
  totalByteLength: number;
};

type SourceRef = {
  sourceId: string;
  title: string;
  url: string | null;
  sourceDate: string;
};

type BriefFile = {
  name: BriefArtifactName;
  artifactKey: string;
  contentType: string;
  content: string;
};

type WrittenBriefFile = Omit<BriefFile, "content"> & {
  byteLength: number;
  sha256: string;
};

type RouteBriefContext = {
  summary: LocalRouteBriefSummary;
  catalog: LocalRouteCatalogEntry | null;
  hotspots: LocalRouteHotspot[];
  reliability: LocalRouteObservedReliabilitySummary | null;
  reliabilityCollection: RouteReliabilityCollection | null;
  reliabilityWindows: RouteObservedReliabilityWindows;
  scheduledReliability: LocalRouteReliabilityBaseline | null;
  interventions: LocalRouteInterventionComparison[];
  generatedAt: string;
};

type CorridorBriefContext = {
  corridor: LocalCorridor;
  summary: LocalCorridorMonthSummary;
  members: LocalCorridorRouteMember[];
  hotspots: LocalCorridorHotspot[];
  generatedAt: string;
};

type BriefData = {
  routes: RouteBriefContext[];
  corridors: CorridorBriefContext[];
};

type RouteReliabilityCollection = {
  run: LocalGtfsRtCollectionRun;
  feedSnapshots: LocalGtfsRtFeedSnapshot[];
};

type ObservedReliabilityWindow = {
  rank: number;
  dayOfWeek: string;
  hourOfDay: number;
  directionId: number | null;
  stopId: string;
  sampleCount: number;
  medianObservedHeadwayMinutes: number | null;
  p90ObservedHeadwayMinutes: number | null;
  maxObservedHeadwayMinutes: number | null;
  observedBunchingShare: number | null;
  observedLongGapShare: number | null;
  expectedWaitMinutes: number | null;
  excessWaitMinutes: number | null;
};

type RouteObservedReliabilityWindows = {
  topLongGapWindows: ObservedReliabilityWindow[];
  topBunchingWindows: ObservedReliabilityWindow[];
};

type WindowGroupKey = {
  routeId: string;
  dayOfWeek: string;
  hourOfDay: number;
  directionId: number | null;
  stopId: string;
};

type WindowGroup = WindowGroupKey & {
  samples: LocalObservedHeadwaySample[];
};

const nycWindowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  hour: "2-digit",
  hourCycle: "h23",
});

function parseCliArgs(args: string[]): BriefArtifactsArgs {
  return parseMonthDbCliArgs(args, {} as BriefArtifactsArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
  ]);
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(sortedValues: readonly number[], q: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? null;
  }

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;

  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function expectedWaitMinutes(headwayMinutes: readonly number[]): number | null {
  const sum = headwayMinutes.reduce((total, value) => total + value, 0);
  if (sum <= 0) {
    return null;
  }

  return round(headwayMinutes.reduce((total, value) => total + value ** 2, 0) / (2 * sum));
}

function monthTimeBounds(isoMonth: string): { startSeconds: number; endSeconds: number } {
  const [yearValue, monthValue] = isoMonth.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);

  return {
    startSeconds: Date.UTC(year, month - 1, 1, 0, 0, 0) / 1000,
    endSeconds: Date.UTC(year, month, 1, 0, 0, 0) / 1000,
  };
}

function isSampleInMonth(sample: LocalObservedHeadwaySample, isoMonth: string): boolean {
  const bounds = monthTimeBounds(isoMonth);

  return (
    sample.observedTimestamp >= bounds.startSeconds && sample.observedTimestamp < bounds.endSeconds
  );
}

function localWindowParts(timestampSeconds: number): { dayOfWeek: string; hourOfDay: number } {
  const parts = nycWindowFormatter.formatToParts(new Date(timestampSeconds * 1000));
  const dayOfWeek = parts.find((part) => part.type === "weekday")?.value ?? "Unknown";
  const hourValue = parts.find((part) => part.type === "hour")?.value ?? "0";

  return {
    dayOfWeek,
    hourOfDay: Number(hourValue),
  };
}

function windowGroupKey(input: WindowGroupKey): string {
  return [
    input.routeId,
    input.dayOfWeek,
    input.hourOfDay,
    input.directionId ?? "unknown",
    input.stopId,
  ].join("::");
}

function observedWindow(input: {
  group: WindowGroup;
  rank: number;
  reliability: LocalRouteObservedReliabilitySummary;
}): ObservedReliabilityWindow {
  const headwayMinutes = input.group.samples
    .map((sample) => sample.headwayMinutes)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const sampleCount = headwayMinutes.length;
  const expectedWait = expectedWaitMinutes(headwayMinutes);

  return {
    rank: input.rank,
    dayOfWeek: input.group.dayOfWeek,
    hourOfDay: input.group.hourOfDay,
    directionId: input.group.directionId,
    stopId: input.group.stopId,
    sampleCount,
    medianObservedHeadwayMinutes:
      sampleCount === 0 ? null : round(quantile(headwayMinutes, 0.5) ?? null),
    p90ObservedHeadwayMinutes:
      sampleCount === 0 ? null : round(quantile(headwayMinutes, 0.9) ?? null),
    maxObservedHeadwayMinutes: sampleCount === 0 ? null : round(Math.max(...headwayMinutes)),
    observedBunchingShare:
      sampleCount === 0 || input.reliability.bunchingThresholdMinutes === null
        ? null
        : round(
            headwayMinutes.filter(
              (headway) => headway <= (input.reliability.bunchingThresholdMinutes ?? 0),
            ).length / sampleCount,
            4,
          ),
    observedLongGapShare:
      sampleCount === 0 || input.reliability.longGapThresholdMinutes === null
        ? null
        : round(
            headwayMinutes.filter(
              (headway) => headway >= (input.reliability.longGapThresholdMinutes ?? 0),
            ).length / sampleCount,
            4,
          ),
    expectedWaitMinutes: expectedWait,
    excessWaitMinutes:
      expectedWait === null || input.reliability.scheduledExpectedWaitMinutes === null
        ? null
        : round(expectedWait - input.reliability.scheduledExpectedWaitMinutes),
  };
}

function buildObservedReliabilityWindows(input: {
  reliability: LocalRouteObservedReliabilitySummary;
  samples: readonly LocalObservedHeadwaySample[];
}): RouteObservedReliabilityWindows {
  const groups = new Map<string, WindowGroup>();
  for (const sample of input.samples.filter(
    (row) =>
      row.routeId === input.reliability.routeId && isSampleInMonth(row, input.reliability.month),
  )) {
    const parts = localWindowParts(sample.observedTimestamp);
    const keyParts = {
      routeId: sample.routeId,
      dayOfWeek: parts.dayOfWeek,
      hourOfDay: parts.hourOfDay,
      directionId: sample.directionId,
      stopId: sample.stopId,
    };
    const key = windowGroupKey(keyParts);
    const group = groups.get(key) ?? { ...keyParts, samples: [] };
    group.samples.push(sample);
    groups.set(key, group);
  }

  const windows = [...groups.values()].map((group) =>
    observedWindow({ group, rank: 0, reliability: input.reliability }),
  );
  const topLongGapWindows = [...windows]
    .sort((left, right) => {
      if ((left.p90ObservedHeadwayMinutes ?? -1) !== (right.p90ObservedHeadwayMinutes ?? -1)) {
        return (right.p90ObservedHeadwayMinutes ?? -1) - (left.p90ObservedHeadwayMinutes ?? -1);
      }
      if ((left.maxObservedHeadwayMinutes ?? -1) !== (right.maxObservedHeadwayMinutes ?? -1)) {
        return (right.maxObservedHeadwayMinutes ?? -1) - (left.maxObservedHeadwayMinutes ?? -1);
      }

      return right.sampleCount - left.sampleCount;
    })
    .slice(0, topObservedWindowLimit)
    .map((window, index) => ({ ...window, rank: index + 1 }));
  const topBunchingWindows = [...windows]
    .sort((left, right) => {
      if ((left.observedBunchingShare ?? -1) !== (right.observedBunchingShare ?? -1)) {
        return (right.observedBunchingShare ?? -1) - (left.observedBunchingShare ?? -1);
      }
      if (left.sampleCount !== right.sampleCount) {
        return right.sampleCount - left.sampleCount;
      }

      return (
        (left.medianObservedHeadwayMinutes ?? Number.POSITIVE_INFINITY) -
        (right.medianObservedHeadwayMinutes ?? Number.POSITIVE_INFINITY)
      );
    })
    .slice(0, topObservedWindowLimit)
    .map((window, index) => ({ ...window, rank: index + 1 }));

  return {
    topLongGapWindows,
    topBunchingWindows,
  };
}

function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) {
    return "not available";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "not available";
  }

  return `${formatNumber(value * 100, 1)}%`;
}

function comparisonRouteIds(value: string | null): string[] {
  if (value === null) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid route intervention comparison route IDs");
  }

  return parsed;
}

function elapsedSeconds(input: { startedAt: string; endedAt: string | null }): number | null {
  if (input.endedAt === null) {
    return null;
  }

  const startedAt = Date.parse(input.startedAt);
  const endedAt = Date.parse(input.endedAt);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) {
    return null;
  }

  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}

function requestedFeedTypes(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .sort();
}

function collectionWindowJson(collection: RouteReliabilityCollection | null) {
  if (collection === null) {
    return null;
  }

  return {
    runId: collection.run.runId,
    startedAt: collection.run.startedAt,
    endedAt: collection.run.endedAt,
    requestedDurationSeconds: collection.run.requestedDurationSeconds,
    elapsedSeconds: elapsedSeconds(collection.run),
    sampleSeconds: collection.run.sampleSeconds,
    requestedFeedTypes: requestedFeedTypes(collection.run.requestedFeedTypes),
    snapshotCount: collection.run.snapshotCount,
    successCount: collection.run.successCount,
    failureCount: collection.run.failureCount,
    successfulVehiclePositionSnapshotCount: collection.feedSnapshots.filter(
      (snapshot) => snapshot.feedType === "vehicle_positions" && snapshot.status === "ok",
    ).length,
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function routeBriefKey(routeId: string, month: string, name: BriefArtifactName): string {
  return join("briefs/routes", routeId.toLowerCase(), month, name);
}

function corridorBriefKey(corridorId: string, month: string, name: BriefArtifactName): string {
  return join("briefs/corridors", slug(corridorId), month, name);
}

function sourceRefs(input: {
  month: string;
  includeGtfsRt: boolean;
  includeInterventions: boolean;
  includeBusLanes: boolean;
}): SourceRef[] {
  const sources: SourceRef[] = [
    {
      sourceId: "mta_bus_route_segment_speeds",
      title: "MTA Bus Route Segment Speeds",
      url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds/kufs-yh3x",
      sourceDate: input.month,
    },
    {
      sourceId: "mta_bus_hourly_ridership",
      title: "MTA Bus Hourly Ridership",
      url: "https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-Beginning-2020/wujg-7c2s",
      sourceDate: input.month,
    },
    {
      sourceId: "mta_bus_schedules",
      title: "MTA Bus Schedules",
      url: "https://data.ny.gov/Transportation/MTA-Bus-Timepoint-Schedules-Beginning-January-2025/6f44-r2x3",
      sourceDate: input.month,
    },
  ];

  if (input.includeGtfsRt) {
    sources.push({
      sourceId: "mta_bus_time_gtfs_rt",
      title: "MTA Bus Time GTFS-RT",
      url: "https://www.mta.info/developers",
      sourceDate: input.month,
    });
  }
  if (input.includeInterventions) {
    sources.push({
      sourceId: "mta_ace_routes",
      title: "MTA Bus Automated Camera Enforced Routes",
      url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y",
      sourceDate: input.month,
    });
  }
  if (input.includeBusLanes) {
    sources.push({
      sourceId: "nyc_dot_bus_lanes_local_streets",
      title: "NYC DOT Bus Lanes - Local Streets",
      url: "https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3",
      sourceDate: input.month,
    });
  }

  return sources;
}

function routeTitle(input: RouteBriefContext): string {
  const routeName = input.catalog?.routeLongName;
  if (routeName === null || routeName === undefined || routeName.length === 0) {
    return `Route ${input.summary.routeId}`;
  }

  return `Route ${input.summary.routeId}: ${routeName}`;
}

function routeJson(input: RouteBriefContext) {
  const routeSources = sourceRefs({
    month: input.summary.month,
    includeGtfsRt: input.reliability !== null,
    includeInterventions: input.interventions.length > 0,
    includeBusLanes: input.summary.busLaneMatchedLaneCount > 0,
  });

  return {
    schemaVersion,
    artifactKind: "route_brief",
    routeId: input.summary.routeId,
    month: input.summary.month,
    title: routeTitle(input),
    generatedAt: input.generatedAt,
    sourceDates: {
      analysisMonth: input.summary.month,
      observedReliabilityRunId: input.reliability?.runId ?? null,
    },
    metrics: {
      routeScore: input.summary.routeScore,
      averageSpeedMph: input.summary.averageSpeedMph,
      hotspotCount: input.summary.hotspotCount,
      totalRidership: input.summary.totalRidership,
      totalTransfers: input.summary.totalTransfers,
      aceActive: input.summary.aceActive,
      aceViolationCount: input.summary.aceViolationCount,
      busLaneMatchedLaneCount: input.summary.busLaneMatchedLaneCount,
      scheduleMatchRate: round(input.summary.scheduleMatchRate, 4),
    },
    observedReliability:
      input.reliability === null
        ? null
        : {
            status: input.reliability.reliabilityStatus,
            sampleCount: input.reliability.sampleCount,
            stopCount: input.reliability.stopCount,
            directionCount: input.reliability.directionCount,
            medianObservedHeadwayMinutes: input.reliability.medianObservedHeadwayMinutes,
            p90ObservedHeadwayMinutes: input.reliability.p90ObservedHeadwayMinutes,
            observedBunchingShare: input.reliability.observedBunchingShare,
            observedLongGapShare: input.reliability.observedLongGapShare,
            expectedWaitMinutes: input.reliability.expectedWaitMinutes,
            excessWaitMinutes: input.reliability.excessWaitMinutes,
            collectionWindow: collectionWindowJson(input.reliabilityCollection),
            windows: input.reliabilityWindows,
          },
    scheduledReliability:
      input.scheduledReliability === null
        ? null
        : {
            status: input.scheduledReliability.reliabilityStatus,
            medianScheduledHeadwayMinutes: input.scheduledReliability.medianScheduledHeadwayMinutes,
            p90ScheduledHeadwayMinutes: input.scheduledReliability.p90ScheduledHeadwayMinutes,
            scheduledShortHeadwayShare: input.scheduledReliability.scheduledShortHeadwayShare,
            scheduledLongGapShare: input.scheduledReliability.scheduledLongGapShare,
          },
    interventionComparisons: input.interventions.map((row) => ({
      eventId: row.eventId,
      interventionType: row.interventionType,
      evaluationLevel: row.evaluationLevel,
      comparisonStatus: row.comparisonStatus,
      preWindow: [row.preStartMonth, row.preEndMonth],
      postWindow: [row.postStartMonth, row.postEndMonth],
      speedDeltaMph: row.speedDeltaMph,
      ridershipDelta: row.ridershipDelta,
      comparisonRouteCount: row.comparisonRouteCount,
      comparisonRouteIds: comparisonRouteIds(row.comparisonRouteIds),
      comparisonSpeedDeltaMph: row.comparisonSpeedDeltaMph,
      adjustedSpeedDeltaMph: row.adjustedSpeedDeltaMph,
      comparisonRidershipDelta: row.comparisonRidershipDelta,
      adjustedRidershipDelta: row.adjustedRidershipDelta,
      caveat: row.caveat,
    })),
    topHotspots: input.hotspots.slice(0, topHotspotLimit).map((hotspot) => ({
      rank: hotspot.hotspotRank ?? null,
      fromStopName: hotspot.timepointStopName,
      toStopName: hotspot.nextTimepointStopName,
      direction: hotspot.direction,
      weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
      hotspotScore: hotspot.hotspotScore,
      riderImpactScore: hotspot.riderImpactScore ?? null,
    })),
    caveats: [
      "Route score is a deterministic prioritization heuristic, not an official MTA grade.",
      "Observed reliability depends on the collected GTFS-RT sample window and should be interpreted with the sample count.",
      "Intervention comparisons are labeled by evaluation level; descriptive before/after rows are not causal estimates.",
      "Bus-lane and ACE context is route-level unless a more precise segment match is stated.",
    ],
    sources: routeSources,
  };
}

function routeMarkdown(input: RouteBriefContext): string {
  const body = routeJson(input);
  const hotspotLines =
    body.topHotspots.length === 0
      ? ["- No ranked hotspot segments are available for this route/month."]
      : body.topHotspots.map(
          (hotspot) =>
            `- ${hotspot.fromStopName} to ${hotspot.toStopName}: ${formatNumber(hotspot.weightedAverageSpeedMph)} mph, hotspot score ${hotspot.hotspotScore}`,
        );
  const interventionLines =
    body.interventionComparisons.length === 0
      ? ["- No intervention comparison rows are available for this route/month."]
      : body.interventionComparisons.map(
          (row) =>
            `- ${row.interventionType}: ${row.comparisonStatus}, ${row.evaluationLevel}, speed delta ${formatNumber(row.speedDeltaMph)} mph, adjusted delta ${formatNumber(row.adjustedSpeedDeltaMph)} mph.`,
        );
  const reliabilityLines =
    body.observedReliability === null
      ? ["- No observed GTFS-RT reliability summary is available."]
      : [
          `- ${body.observedReliability.status}: ${body.observedReliability.sampleCount} samples, median headway ${formatNumber(body.observedReliability.medianObservedHeadwayMinutes)} minutes, bunching ${formatPercent(body.observedReliability.observedBunchingShare)}, long gaps ${formatPercent(body.observedReliability.observedLongGapShare)}.`,
          body.observedReliability.collectionWindow === null
            ? "- GTFS-RT collection window metadata is unavailable for this reliability run."
            : `- GTFS-RT run ${body.observedReliability.collectionWindow.runId}: ${formatNumber(body.observedReliability.collectionWindow.elapsedSeconds, 0)} seconds collected at ${body.observedReliability.collectionWindow.sampleSeconds}s cadence, ${body.observedReliability.collectionWindow.successfulVehiclePositionSnapshotCount} successful vehicle-position snapshots.`,
          ...body.observedReliability.windows.topLongGapWindows.map(
            (window) =>
              `- Long-gap window ${window.rank}: ${window.dayOfWeek} ${window.hourOfDay}:00 at stop ${window.stopId}, p90 headway ${formatNumber(window.p90ObservedHeadwayMinutes)} minutes from ${window.sampleCount} samples.`,
          ),
          ...body.observedReliability.windows.topBunchingWindows.map(
            (window) =>
              `- Bunching window ${window.rank}: ${window.dayOfWeek} ${window.hourOfDay}:00 at stop ${window.stopId}, bunching ${formatPercent(window.observedBunchingShare)} from ${window.sampleCount} samples.`,
          ),
        ];

  return [
    `# ${body.title}`,
    "",
    `Analysis month: ${body.month}`,
    `Generated at: ${body.generatedAt}`,
    "",
    "## Key Metrics",
    "",
    `- Route score: ${body.metrics.routeScore}`,
    `- Average speed: ${formatNumber(body.metrics.averageSpeedMph)} mph`,
    `- Hotspots: ${body.metrics.hotspotCount}`,
    `- Total ridership: ${formatNumber(body.metrics.totalRidership, 0)}`,
    `- Total transfers: ${formatNumber(body.metrics.totalTransfers, 0)}`,
    `- Schedule match rate: ${formatPercent(body.metrics.scheduleMatchRate)}`,
    "",
    "## Observed Reliability",
    "",
    ...reliabilityLines,
    "",
    "## Intervention Context",
    "",
    ...interventionLines,
    "",
    "## Top Hotspots",
    "",
    ...hotspotLines,
    "",
    "## Caveats",
    "",
    ...body.caveats.map((caveat) => `- ${caveat}`),
    "",
    "## Sources",
    "",
    ...body.sources.map((source) => `- ${source.title} (${source.sourceDate})`),
    "",
  ].join("\n");
}

function corridorJson(input: CorridorBriefContext) {
  return {
    schemaVersion,
    artifactKind: "corridor_brief",
    corridorId: input.corridor.corridorId,
    corridorName: input.corridor.corridorName,
    month: input.summary.month,
    title: `${input.corridor.corridorName} Corridor`,
    generatedAt: input.generatedAt,
    sourceDates: {
      analysisMonth: input.summary.month,
      derivationMethod: input.corridor.derivationMethod,
    },
    metrics: {
      routeCount: input.summary.routeCount,
      assignedRouteCount: input.summary.assignedRouteCount,
      ambiguousRouteCount: input.summary.ambiguousRouteCount,
      unassignedRouteCount: input.summary.unassignedRouteCount,
      totalRidership: input.summary.totalRidership,
      totalTransfers: input.summary.totalTransfers,
      weightedAverageSpeedMph: input.summary.weightedAverageSpeedMph,
      hotspotCount: input.summary.hotspotCount,
      observedReliabilityRouteCount: input.summary.observedReliabilityRouteCount,
      insufficientReliabilityRouteCount: input.summary.insufficientReliabilityRouteCount,
      interventionComparisonCount: input.summary.interventionComparisonCount,
      evaluatedInterventionComparisonCount: input.summary.evaluatedInterventionComparisonCount,
    },
    routeMembers: input.members.map((member) => ({
      routeId: member.routeId,
      assignmentStatus: member.assignmentStatus,
      assignmentReason: member.assignmentReason,
      stopCount: member.stopCount,
      matchedStopCount: member.matchedStopCount,
      hotspotCount: member.hotspotCount,
      matchedSegmentCount: member.matchedSegmentCount,
      segmentEvidenceScore: member.segmentEvidenceScore,
      totalRidership: member.totalRidership,
      averageSpeedMph: member.averageSpeedMph,
    })),
    topHotspots: input.hotspots.slice(0, topHotspotLimit).map((hotspot) => ({
      rank: hotspot.corridorHotspotRank,
      routeId: hotspot.routeId,
      fromStopName: hotspot.fromStopName,
      toStopName: hotspot.toStopName,
      weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
      hotspotScore: hotspot.hotspotScore,
      riderImpactScore: hotspot.riderImpactScore,
    })),
    caveats: [
      "The current corridor model is a deterministic primary-street and hotspot-segment grouping, not a final shape-based corridor definition.",
      "Corridor metrics are rollups of route-level and hotspot-level evidence for the analysis month.",
      "Intervention context is counted from route-level comparison rows until corridor-specific event matching is added.",
    ],
    sources: [
      ...sourceRefs({
        month: input.summary.month,
        includeGtfsRt: input.summary.observedReliabilityRouteCount > 0,
        includeInterventions: input.summary.interventionComparisonCount > 0,
        includeBusLanes: false,
      }),
      {
        sourceId: "pipeline_corridor_model",
        title: "Bus Priority Impact Studio corridor model",
        url: null,
        sourceDate: input.generatedAt,
      },
    ],
  };
}

function corridorMarkdown(input: CorridorBriefContext): string {
  const body = corridorJson(input);
  const routeLines =
    body.routeMembers.length === 0
      ? ["- No route members are assigned."]
      : body.routeMembers.map(
          (member) =>
            `- ${member.routeId}: ${member.assignmentStatus}, ${formatNumber(member.averageSpeedMph)} mph, ${formatNumber(member.totalRidership, 0)} riders.`,
        );
  const hotspotLines =
    body.topHotspots.length === 0
      ? ["- No ranked corridor hotspots are available."]
      : body.topHotspots.map(
          (hotspot) =>
            `- ${hotspot.routeId} ${hotspot.fromStopName} to ${hotspot.toStopName}: ${formatNumber(hotspot.weightedAverageSpeedMph)} mph, hotspot score ${hotspot.hotspotScore}.`,
        );

  return [
    `# ${body.title}`,
    "",
    `Analysis month: ${body.month}`,
    `Generated at: ${body.generatedAt}`,
    "",
    "## Key Metrics",
    "",
    `- Routes: ${body.metrics.routeCount}`,
    `- Total ridership: ${formatNumber(body.metrics.totalRidership, 0)}`,
    `- Weighted average speed: ${formatNumber(body.metrics.weightedAverageSpeedMph)} mph`,
    `- Hotspots: ${body.metrics.hotspotCount}`,
    `- Observed reliability route count: ${body.metrics.observedReliabilityRouteCount}`,
    `- Intervention comparisons: ${body.metrics.interventionComparisonCount}`,
    "",
    "## Route Members",
    "",
    ...routeLines,
    "",
    "## Top Hotspots",
    "",
    ...hotspotLines,
    "",
    "## Caveats",
    "",
    ...body.caveats.map((caveat) => `- ${caveat}`),
    "",
    "## Sources",
    "",
    ...body.sources.map((source) => `- ${source.title} (${source.sourceDate})`),
    "",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage(title: string, markdown: string): string {
  const lines = markdown.split("\n");
  const body = lines
    .map((line) => {
      if (line.startsWith("# ")) {
        return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }
      if (line.startsWith("- ")) {
        return `<li>${escapeHtml(line.slice(2))}</li>`;
      }
      if (line.length === 0) {
        return "";
      }

      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function routeFiles(input: RouteBriefContext): BriefFile[] {
  const json = routeJson(input);
  const markdown = routeMarkdown(input);
  const html = htmlPage(json.title, markdown);

  return [
    {
      name: "brief.json",
      artifactKey: routeBriefKey(input.summary.routeId, input.summary.month, "brief.json"),
      contentType: "application/json",
      content: `${JSON.stringify(json, null, 2)}\n`,
    },
    {
      name: "brief.md",
      artifactKey: routeBriefKey(input.summary.routeId, input.summary.month, "brief.md"),
      contentType: "text/markdown; charset=utf-8",
      content: markdown,
    },
    {
      name: "brief.html",
      artifactKey: routeBriefKey(input.summary.routeId, input.summary.month, "brief.html"),
      contentType: "text/html; charset=utf-8",
      content: html,
    },
  ];
}

function corridorFiles(input: CorridorBriefContext): BriefFile[] {
  const json = corridorJson(input);
  const markdown = corridorMarkdown(input);
  const html = htmlPage(json.title, markdown);

  return [
    {
      name: "brief.json",
      artifactKey: corridorBriefKey(input.corridor.corridorId, input.summary.month, "brief.json"),
      contentType: "application/json",
      content: `${JSON.stringify(json, null, 2)}\n`,
    },
    {
      name: "brief.md",
      artifactKey: corridorBriefKey(input.corridor.corridorId, input.summary.month, "brief.md"),
      contentType: "text/markdown; charset=utf-8",
      content: markdown,
    },
    {
      name: "brief.html",
      artifactKey: corridorBriefKey(input.corridor.corridorId, input.summary.month, "brief.html"),
      contentType: "text/html; charset=utf-8",
      content: html,
    },
  ];
}

async function writeBriefFile(file: BriefFile, artifactRoot: string): Promise<WrittenBriefFile> {
  const path = join(artifactRoot, file.artifactKey);
  const bytes = new TextEncoder().encode(file.content);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, bytes);

  return {
    name: file.name,
    artifactKey: file.artifactKey,
    contentType: file.contentType,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function readBriefData(args: {
  dbPath: string;
  month: string;
  generatedAt: string;
}): Promise<BriefData> {
  return withLocalPipelineDb(args.dbPath, async (local) => {
    const [
      routeSummaries,
      routeCatalog,
      observedReliability,
      scheduledReliability,
      interventionComparisons,
      collectionRuns,
      corridors,
      corridorSummaries,
      corridorMembers,
      corridorHotspots,
    ] = await Promise.all([
      listRouteBriefSummaries(local.db, args.month),
      listRouteCatalog(local.db),
      listRouteObservedReliabilitySummaries(local.db, args.month),
      listRouteReliabilityBaselines(local.db, args.month),
      listRouteInterventionComparisons(local.db, args.month),
      listGtfsRtCollectionRuns(local.db),
      listCorridors(local.db),
      listCorridorMonthSummaries(local.db, args.month),
      listCorridorRouteMembers(local.db, args.month),
      listCorridorHotspots(local.db, args.month),
    ]);
    const catalogByRoute = new Map(routeCatalog.map((row) => [row.routeId, row]));
    const reliabilityByRoute = new Map(observedReliability.map((row) => [row.routeId, row]));
    const scheduledByRoute = new Map(scheduledReliability.map((row) => [row.routeId, row]));
    const collectionRunIds = new Set(observedReliability.map((row) => row.runId));
    const collectionByRun = new Map(
      collectionRuns
        .filter((row) => collectionRunIds.has(row.runId))
        .map((row) => [row.runId, row]),
    );
    const feedSnapshotsByRun = new Map<string, LocalGtfsRtFeedSnapshot[]>();
    await Promise.all(
      [...collectionRunIds].map(async (runId) => {
        feedSnapshotsByRun.set(runId, await listGtfsRtFeedSnapshots(local.db, runId));
      }),
    );
    const observedSamplesByRun = new Map<string, LocalObservedHeadwaySample[]>();
    await Promise.all(
      [...collectionRunIds].map(async (runId) => {
        observedSamplesByRun.set(runId, await listObservedHeadwaySamples(local.db, runId));
      }),
    );
    const interventionsByRoute = new Map<string, LocalRouteInterventionComparison[]>();
    for (const row of interventionComparisons) {
      const group = interventionsByRoute.get(row.routeId) ?? [];
      group.push(row);
      interventionsByRoute.set(row.routeId, group);
    }

    const routes: RouteBriefContext[] = [];
    for (const summary of routeSummaries.filter((row) => row.publicVisible)) {
      const reliability = reliabilityByRoute.get(summary.routeId) ?? null;
      const collection = reliability === null ? undefined : collectionByRun.get(reliability.runId);
      routes.push({
        summary,
        catalog: catalogByRoute.get(summary.routeId) ?? null,
        hotspots: await listRouteHotspots(local.db, summary.routeId, args.month),
        reliability,
        reliabilityCollection:
          reliability === null || collection === undefined
            ? null
            : {
                run: collection,
                feedSnapshots: feedSnapshotsByRun.get(reliability.runId) ?? [],
              },
        reliabilityWindows:
          reliability === null
            ? { topLongGapWindows: [], topBunchingWindows: [] }
            : buildObservedReliabilityWindows({
                reliability,
                samples: observedSamplesByRun.get(reliability.runId) ?? [],
              }),
        scheduledReliability: scheduledByRoute.get(summary.routeId) ?? null,
        interventions: interventionsByRoute.get(summary.routeId) ?? [],
        generatedAt: args.generatedAt,
      });
    }

    const corridorsById = new Map(corridors.map((row) => [row.corridorId, row]));
    const membersByCorridor = new Map<string, LocalCorridorRouteMember[]>();
    for (const row of corridorMembers) {
      const group = membersByCorridor.get(row.corridorId) ?? [];
      group.push(row);
      membersByCorridor.set(row.corridorId, group);
    }
    const hotspotsByCorridor = new Map<string, LocalCorridorHotspot[]>();
    for (const row of corridorHotspots) {
      const group = hotspotsByCorridor.get(row.corridorId) ?? [];
      group.push(row);
      hotspotsByCorridor.set(row.corridorId, group);
    }

    return {
      routes,
      corridors: corridorSummaries.map((summary) => {
        const corridor = corridorsById.get(summary.corridorId);
        if (corridor === undefined) {
          throw new Error(`Missing corridor row for ${summary.corridorId}`);
        }

        return {
          corridor,
          summary,
          members: membersByCorridor.get(summary.corridorId) ?? [],
          hotspots: hotspotsByCorridor.get(summary.corridorId) ?? [],
          generatedAt: args.generatedAt,
        };
      }),
    };
  });
}

export async function buildBriefArtifacts(
  args: BriefArtifactsArgs = {},
): Promise<BriefArtifactsResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const data = await readBriefData({
    dbPath: options.dbPath,
    month: options.isoMonth,
    generatedAt,
  });
  const routeArtifacts: LocalRouteArtifact[] = [];
  const corridorArtifacts: LocalCorridorArtifact[] = [];

  for (const route of data.routes) {
    for (const artifact of routeFiles(route)) {
      const written = await writeBriefFile(artifact, artifactRoot);
      routeArtifacts.push({
        routeId: route.summary.routeId,
        month: route.summary.month,
        artifactName: written.name,
        artifactKey: written.artifactKey,
        contentType: written.contentType,
        byteLength: written.byteLength,
        sha256: written.sha256,
      });
    }
  }

  for (const corridor of data.corridors) {
    for (const artifact of corridorFiles(corridor)) {
      const written = await writeBriefFile(artifact, artifactRoot);
      corridorArtifacts.push({
        corridorId: corridor.summary.corridorId,
        month: corridor.summary.month,
        artifactName: written.name,
        artifactKey: written.artifactKey,
        contentType: written.contentType,
        byteLength: written.byteLength,
        sha256: written.sha256,
      });
    }
  }

  await withLocalPipelineDb(options.dbPath, async (local) => {
    await replaceRouteArtifactsForMonth(local.db, options.isoMonth, routeArtifacts);
    await replaceCorridorArtifacts(local.db, options.isoMonth, corridorArtifacts);
  });

  return {
    isoMonth: options.isoMonth,
    routeBriefCount: data.routes.length,
    corridorBriefCount: data.corridors.length,
    routeArtifactCount: routeArtifacts.length,
    corridorArtifactCount: corridorArtifacts.length,
    totalByteLength: [...routeArtifacts, ...corridorArtifacts].reduce(
      (sum, artifact) => sum + artifact.byteLength,
      0,
    ),
  };
}

export function buildBriefArtifactsFromCli(args: string[]): Promise<BriefArtifactsResult> {
  return buildBriefArtifacts(parseCliArgs(args));
}

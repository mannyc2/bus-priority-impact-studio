import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  LocalCorridor,
  LocalCorridorHotspot,
  LocalCorridorInterventionContext,
  LocalCorridorMonthSummary,
  LocalCorridorRouteMember,
  LocalGtfsRtCollectionRun,
  LocalGtfsRtFeedSnapshot,
  LocalObservedHeadwaySample,
  LocalRouteBriefSummary,
  LocalRouteCatalogEntry,
  LocalRouteHotspot,
  LocalRouteInterventionComparison,
  LocalRouteObservedReliabilitySummary,
  LocalRouteReliabilityBaseline,
} from "@bp/db/local";

export const routeBriefArtifactSchemaVersion = 1;
export const routeBriefArtifactNames = ["brief.json", "brief.md", "brief.html"] as const;

export type BriefArtifactName = (typeof routeBriefArtifactNames)[number];

export type BriefSourceRef = {
  sourceId: string;
  title: string;
  url: string | null;
  sourceDate: string;
};

export type BriefFile = {
  name: BriefArtifactName;
  artifactKey: string;
  contentType: string;
  content: string;
};

export type BriefFileMetadata = Omit<BriefFile, "content"> & {
  byteLength: number;
  sha256: string;
};

export type RouteReliabilityCollection = {
  run: LocalGtfsRtCollectionRun;
  feedSnapshots: LocalGtfsRtFeedSnapshot[];
};

export type ObservedReliabilityWindow = {
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

export type RouteObservedReliabilityWindows = {
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

export type RouteBriefArtifactContext = {
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

export type CorridorBriefArtifactContext = {
  corridor: LocalCorridor;
  summary: LocalCorridorMonthSummary;
  members: LocalCorridorRouteMember[];
  hotspots: LocalCorridorHotspot[];
  interventionContext: LocalCorridorInterventionContext[];
  generatedAt: string;
};

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

const nycWindowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  hour: "2-digit",
  hourCycle: "h23",
});

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

function normalizeRouteIdText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, "$1$2");
}

function canonicalRouteId(value: unknown, routeUniverse: ReadonlySet<string>): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : null;
  if (raw === null || raw.length === 0) return null;
  if (routeUniverse.has(raw)) return raw;

  const normalized = normalizeRouteIdText(raw);
  if (normalized === null) return null;
  return routeUniverse.has(normalized) ? normalized : normalized;
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

export function buildObservedReliabilityWindows(input: {
  reliability: LocalRouteObservedReliabilitySummary;
  samples: readonly LocalObservedHeadwaySample[];
  limit?: number;
}): RouteObservedReliabilityWindows {
  const groups = new Map<string, WindowGroup>();
  const routeUniverse = new Set([input.reliability.routeId]);
  for (const sample of input.samples.filter(
    (row) =>
      canonicalRouteId(row.routeId, routeUniverse) === input.reliability.routeId &&
      isSampleInMonth(row, input.reliability.month),
  )) {
    const parts = localWindowParts(sample.observedTimestamp);
    const keyParts = {
      routeId: input.reliability.routeId,
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

  const limit = input.limit ?? 5;
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
    .slice(0, limit)
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
    .slice(0, limit)
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

export function routeBriefKey(routeId: string, month: string, name: BriefArtifactName): string {
  return join("briefs/routes", routeId.toLowerCase(), month, name);
}

export function corridorBriefKey(
  corridorId: string,
  month: string,
  name: BriefArtifactName,
): string {
  return join("briefs/corridors", slug(corridorId), month, name);
}

export function briefSourceRefs(input: {
  month: string;
  includeGtfsRt: boolean;
  includeInterventions: boolean;
  includeBusLanes: boolean;
}): BriefSourceRef[] {
  const sources: BriefSourceRef[] = [
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

function routeTitle(input: RouteBriefArtifactContext): string {
  const routeName = input.catalog?.routeLongName;
  if (routeName === null || routeName === undefined || routeName.length === 0) {
    return `Route ${input.summary.routeId}`;
  }

  return `Route ${input.summary.routeId}: ${routeName}`;
}

export function routeBriefJson(input: RouteBriefArtifactContext) {
  const routeSources = briefSourceRefs({
    month: input.summary.month,
    includeGtfsRt: input.reliability !== null,
    includeInterventions: input.interventions.length > 0,
    includeBusLanes: input.summary.busLaneMatchedLaneCount > 0,
  });

  return {
    schemaVersion: routeBriefArtifactSchemaVersion,
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
    topHotspots: input.hotspots.slice(0, 5).map((hotspot) => ({
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

export function routeBriefMarkdown(input: RouteBriefArtifactContext): string {
  const body = routeBriefJson(input);
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

export function corridorBriefJson(input: CorridorBriefArtifactContext) {
  return {
    schemaVersion: routeBriefArtifactSchemaVersion,
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
    topHotspots: input.hotspots.slice(0, 5).map((hotspot) => ({
      rank: hotspot.corridorHotspotRank,
      routeId: hotspot.routeId,
      fromStopName: hotspot.fromStopName,
      toStopName: hotspot.toStopName,
      weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
      hotspotScore: hotspot.hotspotScore,
      riderImpactScore: hotspot.riderImpactScore,
    })),
    interventionContext: input.interventionContext.map((context) => ({
      rank: context.contextRank,
      routeId: context.routeId,
      eventId: context.eventId,
      interventionType: context.interventionType,
      sourceId: context.sourceId,
      program: context.program,
      implementationMonth: context.implementationMonth,
      eventStatus: context.eventStatus,
      evaluationLevel: context.evaluationLevel,
      comparisonStatus: context.comparisonStatus,
      speedDeltaMph: context.speedDeltaMph,
      adjustedSpeedDeltaMph: context.adjustedSpeedDeltaMph,
      ridershipDelta: context.ridershipDelta,
      adjustedRidershipDelta: context.adjustedRidershipDelta,
      comparisonRouteCount: context.comparisonRouteCount,
      caveat: context.caveat,
    })),
    caveats: [
      "The corridor model is a deterministic hotspot-segment grouping; segment-backed memberships are reviewed against GTFS route-shape geometry but are not official corridor definitions.",
      "Corridor metrics are rollups of route-level and hotspot-level evidence for the analysis month.",
      "Intervention context is matched to corridors through route membership; source-gap rows identify missing implementation dates.",
    ],
    sources: [
      ...briefSourceRefs({
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

export function corridorBriefMarkdown(input: CorridorBriefArtifactContext): string {
  const body = corridorBriefJson(input);
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
  const interventionLines =
    body.interventionContext.length === 0
      ? ["- No corridor intervention context rows are available."]
      : body.interventionContext.map(
          (context) =>
            `- ${context.routeId} ${context.program}: ${context.comparisonStatus}, ${context.evaluationLevel}, speed delta ${formatNumber(context.speedDeltaMph)} mph, adjusted delta ${formatNumber(context.adjustedSpeedDeltaMph)} mph.`,
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
    "## Intervention Context",
    "",
    ...interventionLines,
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

export function briefHtmlPage(title: string, markdown: string): string {
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

export function routeBriefFiles(input: RouteBriefArtifactContext): BriefFile[] {
  const json = routeBriefJson(input);
  const markdown = routeBriefMarkdown(input);
  const html = briefHtmlPage(json.title, markdown);

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

export function corridorBriefFiles(input: CorridorBriefArtifactContext): BriefFile[] {
  const json = corridorBriefJson(input);
  const markdown = corridorBriefMarkdown(input);
  const html = briefHtmlPage(json.title, markdown);

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

export function briefFileMetadata(file: BriefFile): BriefFileMetadata {
  const bytes = new TextEncoder().encode(file.content);
  return {
    name: file.name,
    artifactKey: file.artifactKey,
    contentType: file.contentType,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

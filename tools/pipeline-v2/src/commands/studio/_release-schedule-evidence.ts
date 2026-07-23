import type { LocalRouteHotspot, LocalRouteScheduleTimepoint } from "@bp/db/local";
import { scheduleComparisons } from "../../lib/route-briefs/index.ts";
import type {
  RouteBriefInputArtifact,
  RouteBriefSegment,
} from "./_release-types.ts";

function finiteSegmentNumber(
  routeId: string,
  segmentId: string,
  label: string,
  value: number | null | undefined,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Cannot refresh schedule evidence for ${routeId} segment ${segmentId}: ${label} is missing.`,
    );
  }
  return value;
}

function segmentAsHotspot(segment: RouteBriefSegment): LocalRouteHotspot {
  const [routeId, isoMonth, serializedDirection, serializedStopOrder, fromStopId, toStopId] =
    segment.segmentId.split(":");
  const stopOrder = Number(serializedStopOrder);
  if (
    routeId === undefined ||
    isoMonth === undefined ||
    serializedDirection === undefined ||
    fromStopId === undefined ||
    toStopId === undefined ||
    !Number.isInteger(stopOrder) ||
    serializedDirection !== segment.direction
  ) {
    throw new Error(`Cannot refresh schedule evidence for malformed segment ${segment.segmentId}.`);
  }

  const riderImpactScore = segment.riderImpactScore;
  const ridershipExposure = segment.ridershipExposure;
  return {
    routeId,
    isoMonth,
    segmentId: segment.segmentId,
    direction: segment.direction,
    stopOrder,
    timepointStopId: fromStopId,
    timepointStopName: segment.from ?? "",
    nextTimepointStopId: toStopId,
    nextTimepointStopName: segment.to ?? "",
    observationCount: finiteSegmentNumber(
      routeId,
      segment.segmentId,
      "observationCount",
      segment.observationCount,
    ),
    busTripCount: finiteSegmentNumber(
      routeId,
      segment.segmentId,
      "busTripCount",
      segment.busTripCount,
    ),
    weightedAverageSpeedMph: finiteSegmentNumber(
      routeId,
      segment.segmentId,
      "weightedAverageSpeedMph",
      segment.weightedAverageSpeedMph,
    ),
    weightedAverageTravelTimeMinutes: finiteSegmentNumber(
      routeId,
      segment.segmentId,
      "weightedAverageTravelTimeMinutes",
      segment.weightedAverageTravelTimeMinutes,
    ),
    averageRoadDistanceMiles: finiteSegmentNumber(
      routeId,
      segment.segmentId,
      "averageRoadDistanceMiles",
      segment.averageRoadDistanceMiles,
    ),
    slowWindowShare:
      finiteSegmentNumber(
        routeId,
        segment.segmentId,
        "slowWindowPercent",
        segment.slowWindowPercent,
      ) / 100,
    speedSeverity: 0,
    hotspotScore: finiteSegmentNumber(
      routeId,
      segment.segmentId,
      "hotspotScore",
      segment.hotspotScore,
    ),
    ...(typeof ridershipExposure === "number" && Number.isFinite(ridershipExposure)
      ? { ridershipExposure }
      : {}),
    ...(typeof riderImpactScore === "number" && Number.isFinite(riderImpactScore)
      ? { riderImpactScore }
      : {}),
  };
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function refreshHourlyPassengerDelay(
  segment: RouteBriefSegment,
  scheduledMedianTravelTimeMinutes: number | null,
): RouteBriefSegment {
  const hourlyPassengerDelay = segment.hourlyPassengerDelay?.map((row) => {
    const observedMinusScheduledMinutes =
      row.observedTravelTimeMinutes === null || scheduledMedianTravelTimeMinutes === null
        ? null
        : round(row.observedTravelTimeMinutes - scheduledMedianTravelTimeMinutes);
    const riderDelayHours =
      observedMinusScheduledMinutes === null ||
      observedMinusScheduledMinutes <= 0 ||
      row.averageServiceDayRouteRidership === null
        ? 0
        : round((observedMinusScheduledMinutes * row.averageServiceDayRouteRidership) / 60);
    return {
      ...row,
      scheduledMedianTravelTimeMinutes,
      observedMinusScheduledMinutes,
      riderDelayHours,
    };
  });
  return {
    ...segment,
    ...(hourlyPassengerDelay === undefined ? {} : { hourlyPassengerDelay }),
  };
}

export function refreshRouteBriefScheduleEvidence(
  artifact: RouteBriefInputArtifact,
  schedules: readonly LocalRouteScheduleTimepoint[],
): RouteBriefInputArtifact {
  const segments = artifact.segments ?? artifact.topSegments ?? [];
  if (segments.length === 0 || schedules.length === 0) return artifact;

  const result = scheduleComparisons(schedules, segments.map(segmentAsHotspot));
  const comparisonsBySegment = new Map(
    result.hotspotComparisons.map((comparison) => [comparison.segmentId, comparison]),
  );
  const refreshSegments = (rows: RouteBriefSegment[]) =>
    rows.map((segment) =>
      refreshHourlyPassengerDelay(
        segment,
        comparisonsBySegment.get(segment.segmentId)?.scheduledMedianTravelTimeMinutes ?? null,
      ),
    );

  return {
    ...artifact,
    metrics: {
      ...artifact.metrics,
      scheduledPairCount: result.scheduledPairCount,
      scheduleMatchedHotspotCount: result.matchedHotspotCount,
    },
    ...(artifact.segments === undefined
      ? {}
      : { segments: refreshSegments(artifact.segments) }),
    ...(artifact.topSegments === undefined
      ? {}
      : { topSegments: refreshSegments(artifact.topSegments) }),
    scheduleComparisons: result.hotspotComparisons,
  };
}

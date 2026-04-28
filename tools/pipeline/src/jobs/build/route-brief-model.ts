import { calculateRouteScore, classifyPublicRouteVisibility } from "@bp/analytics";
import type {
  LocalAceRoute,
  LocalAceViolationSummary,
  LocalBusLane,
  LocalRouteCatalogEntry,
  LocalRouteHotspot,
  LocalRouteHotspotSummary,
  LocalRouteHourlyRidership,
  LocalRouteScheduleTimepoint,
  LocalRouteSegmentSpeed,
  LocalRouteStop,
} from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import {
  groupedSpeedProfiles,
  matchedBusLanes,
  monthEndIso,
  ridershipProfiles,
  scheduleComparisons,
  slowSpeedThresholdMph,
} from "./route-brief-metrics.js";

export type RouteBriefInputRows = {
  summary: LocalRouteHotspotSummary;
  hotspots: LocalRouteHotspot[];
  speedRows: LocalRouteSegmentSpeed[];
  ridershipRows: LocalRouteHourlyRidership[];
  schedules: LocalRouteScheduleTimepoint[];
  acePrograms: LocalAceRoute[];
  aceViolations: LocalAceViolationSummary[];
  busLanes: LocalBusLane[];
  stops: LocalRouteStop[];
  catalog: LocalRouteCatalogEntry[];
};

export type RouteBriefModelInput = {
  rows: RouteBriefInputRows;
  year: number;
  month: number;
  topSegmentLimit: number;
};

function pct(value: number): number {
  return Math.round(value * 1000) / 10;
}

function optionalNumber(value: number | null | undefined): number | null {
  return value ?? null;
}

export function buildRouteBriefModel(input: RouteBriefModelInput) {
  const {
    summary,
    hotspots,
    speedRows,
    ridershipRows,
    schedules,
    acePrograms,
    aceViolations,
    busLanes,
    stops,
    catalog,
  } = input.rows;
  const coverageStatus = summary.observationCount > 0 ? "full" : "no_observed_speed";
  const scorecard = calculateRouteScore({
    routeId: z.decode(RouteIdCodec, summary.routeId),
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
  const speedProfile = groupedSpeedProfiles(speedRows);
  const ridershipProfile = ridershipProfiles(ridershipRows, speedRows);
  const scheduleComparison = scheduleComparisons(schedules, hotspots);
  const analysisPeriodEnd = monthEndIso(input.year, input.month);
  const activeAcePrograms = acePrograms.filter(
    (program) => program.implementationDate <= analysisPeriodEnd,
  );
  const futureAcePrograms = acePrograms.filter(
    (program) => program.implementationDate > analysisPeriodEnd,
  );
  const routeViolationCount = aceViolations.reduce((sum, row) => sum + row.violationCount, 0);
  const matchedLanes = matchedBusLanes(busLanes, stops);
  const matchedStreets = [...new Set(matchedLanes.map((lane) => lane.street))].sort();
  const topSegments = hotspots.slice(0, input.topSegmentLimit).map((hotspot) => ({
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
      slowSpeedThresholdMph,
      directionProfiles: speedProfile.directionProfiles,
      daypartProfiles: speedProfile.daypartProfiles,
      slowestDayHourWindows: speedProfile.slowestDayHourWindows,
    },
    interventionStatus: {
      aceRouteMatched: acePrograms.length > 0,
      aceActiveDuringAnalysisPeriod: activeAcePrograms.length > 0,
      aceRouteMatchCount: acePrograms.length,
      aceActiveProgramCount: activeAcePrograms.length,
      aceFutureProgramCount: futureAcePrograms.length,
      aceViolationCount: routeViolationCount,
      aceViolationGroupedRowCount: aceViolations.length,
      busLaneMatchedLaneCount: matchedLanes.length,
      busLaneMatchedStreetCount: matchedStreets.length,
      busLaneMatchedStreets: matchedStreets,
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
      "ACE route matching is route-level only; this does not prove segment-level camera coverage.",
      "Bus-lane overlay is based on street/proximity matching and should not be interpreted as exact route-segment coverage.",
      "Scheduled travel time is derived by splitting schedule rows into trip-like sequences within block/day/direction groups.",
      "Ridership windows are route-level hourly totals, not segment-level passenger loads.",
      "Speed profiles aggregate MTA segment-speed timepoint observations by direction, daypart, and day/hour.",
      "The current artifact does not include service-alert or causal intervention overlays.",
      "The hotspot summary is limited to the selected route and month.",
    ],
    sources: [
      ...scorecard.citations,
      {
        sourceId: "ace_routes",
        title: "MTA Bus Automated Camera Enforced Routes",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y",
        verifiedAt: summary.generatedAt,
      },
      {
        sourceId: "nyc_dot_bus_lanes_local_streets",
        title: "NYC DOT Bus Lanes - Local Streets",
        url: "https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3",
        verifiedAt: summary.generatedAt,
      },
    ],
  };
  const scheduleMatchRate =
    scorecard.hotspotCount === 0
      ? 0
      : scheduleComparison.matchedHotspotCount / scorecard.hotspotCount;
  const catalogRow = catalog.find((row) => row.routeId === summary.routeId);
  const visibility = classifyPublicRouteVisibility({
    routeId: summary.routeId,
    routeLongName: catalogRow?.routeLongName ?? null,
    routeTypes: catalogRow?.routeTypes ?? [],
    shapeCount: catalogRow?.shapeCount ?? 0,
    coverageStatus: scorecard.coverageStatus,
  });
  const peakWindow = ridershipProfile.peakRidershipWindow;
  const slowestWindow = speedProfile.slowestDayHourWindows[0] ?? null;

  return {
    briefInput,
    scorecard,
    routeScorecardRow: {
      routeId: summary.routeId,
      month: summary.isoMonth,
      routeScore: scorecard.routeScore,
      coverageStatus: scorecard.coverageStatus,
      averageSpeedMph: scorecard.averageSpeedMph,
      hotspotCount: scorecard.hotspotCount,
    },
    routeBriefRows: {
      summary: {
        routeId: summary.routeId,
        month: summary.isoMonth,
        routeScore: scorecard.routeScore,
        publicVisible: visibility.publicVisible,
        publicVisibilityReason: visibility.reason,
        averageSpeedMph: scorecard.averageSpeedMph,
        hotspotCount: scorecard.hotspotCount,
        totalRidership: ridershipProfile.totalRidership,
        totalTransfers: ridershipProfile.totalTransfers,
        aceActive: activeAcePrograms.length > 0,
        aceViolationCount: routeViolationCount,
        busLaneMatchedLaneCount: matchedLanes.length,
        scheduleMatchRate,
      },
      peakWindows:
        peakWindow === null
          ? []
          : [
              {
                routeId: summary.routeId,
                month: summary.isoMonth,
                windowRank: 1,
                dayOfWeek: peakWindow.dayOfWeek,
                hourOfDay: peakWindow.hourOfDay,
                ridership: optionalNumber(peakWindow.ridership),
                transfers: optionalNumber(peakWindow.transfers),
                matchedObservationCount: optionalNumber(peakWindow.matchedObservationCount),
                busTripCount: optionalNumber(peakWindow.busTripCount),
                weightedAverageSpeedMph: optionalNumber(peakWindow.weightedAverageSpeedMph),
                slowObservationShare: optionalNumber(peakWindow.slowObservationShare),
              },
            ],
      slowestWindows:
        slowestWindow === null
          ? []
          : [
              {
                routeId: summary.routeId,
                month: summary.isoMonth,
                windowRank: 1,
                dayOfWeek: slowestWindow.dayOfWeek,
                hourOfDay: slowestWindow.hourOfDay,
                observationCount: optionalNumber(slowestWindow.observationCount),
                busTripCount: optionalNumber(slowestWindow.busTripCount),
                segmentCount: optionalNumber(slowestWindow.segmentCount),
                weightedAverageSpeedMph: optionalNumber(slowestWindow.weightedAverageSpeedMph),
                weightedAverageTravelTimeMinutes: optionalNumber(
                  slowestWindow.weightedAverageTravelTimeMinutes,
                ),
                slowObservationShare: optionalNumber(slowestWindow.slowObservationShare),
              },
            ],
    },
    routeId: summary.routeId,
    isoMonth: summary.isoMonth,
    routeScore: scorecard.routeScore,
    topSegmentCount: topSegments.length,
  };
}

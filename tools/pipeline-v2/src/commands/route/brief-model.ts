import type { SegmentHotspot, SegmentSpeedObservation } from "@bp/analytics";
import {
  calculateRouteScore,
  classifyPublicRouteVisibility,
  detectSegmentHotspots,
} from "@bp/analytics";
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
import {
  aceInterventionSummary,
  groupedSpeedProfiles,
  matchedBusLanes,
  ridershipProfiles,
  scheduleComparisons,
  segmentHourlySlowWindowBins,
  slowSpeedThresholdMph,
} from "./brief-metrics.ts";

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

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function optionalNumber(value: number | null | undefined): number | null {
  return value ?? null;
}

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type DayOfWeek = (typeof dayNames)[number];

type RouteBriefSegment = {
  segmentId: string;
  direction: string;
  stopOrder?: number;
  from?: string;
  to?: string;
  weightedAverageSpeedMph?: number;
  weightedAverageTravelTimeMinutes?: number;
  averageRoadDistanceMiles?: number;
  slowWindowPercent?: number;
  busTripCount?: number;
  observationCount?: number;
  hotspotScore?: number;
  riderImpactScore?: number | null;
  ridershipExposure?: number | null;
  hourlySlowWindowBins?: number[];
  hourlyPassengerDelay?: RouteBriefHourlyPassengerDelay[];
  stopBoardings?: null;
  segmentBoardings?: null;
};

type RouteBriefHourlyBoardingBin = {
  hourOfDay: number;
  boardings: number;
  transfers: number;
  serviceDayCount: number;
};

type RouteBriefHourlyBoardings = {
  sourceId: "mta_bus_hourly_ridership";
  sourceLabel: "MTA Bus Hourly Ridership";
  window: string;
  dayType: "weekday_average";
  bins: RouteBriefHourlyBoardingBin[];
};

type RouteBriefTopStopBoardings = {
  coverage: "available" | "not_available";
  sourceId: string | null;
  sourceLabel: string | null;
  window: string | null;
  unavailableReason: string | null;
  stops: Array<{
    rank: number;
    stopId: string;
    stopName: string;
    direction: "NB" | "SB" | "EB" | "WB" | null;
    averageDailyBoardings: number;
  }>;
};

export type RouteBriefHourlyPassengerDelay = {
  dayOfWeek: DayOfWeek;
  hourOfDay: number;
  observedTravelTimeMinutes: number | null;
  scheduledMedianTravelTimeMinutes: number | null;
  observedMinusScheduledMinutes: number | null;
  monthlyRouteRidership: number | null;
  serviceDayCount: number | null;
  averageServiceDayRouteRidership: number | null;
  stopBoardings: null;
  segmentBoardings: null;
  riderDelayHours: number;
};

export type RouteBriefSegmentUniverse = {
  segmentUniverse: {
    grain: "all_observed_timepoint_segments";
    segmentCount: number;
    source: "mta_bus_segment_speeds";
    ridershipDenominator: "average_service_day_route_hourly_ridership";
    serviceDayRidershipCoverage: "available";
    stopBoardingsCoverage: "not_available";
    segmentBoardingsCoverage: "not_available";
    hourlyRiderDelayCoverage: "available";
    caveats: string[];
  };
  segments: RouteBriefSegment[];
  scheduleComparisons: ReturnType<typeof scheduleComparisons>["hotspotComparisons"];
  scheduledPairCount: number;
  matchedSegmentCount: number;
};

function ridershipKey(dayOfWeek: string, hourOfDay: number): string {
  return `${dayOfWeek}:${hourOfDay}`;
}

function segmentIdFromSpeedRow(row: LocalRouteSegmentSpeed): string {
  return [
    row.routeId,
    row.isoMonth,
    row.direction,
    row.stopOrder,
    row.timepointStopId,
    row.nextTimepointStopId,
  ].join(":");
}

function segmentOrder(left: SegmentHotspot, right: SegmentHotspot): number {
  return (
    left.direction.localeCompare(right.direction) ||
    left.stopOrder - right.stopOrder ||
    left.timepointStopId.localeCompare(right.timepointStopId) ||
    left.nextTimepointStopId.localeCompare(right.nextTimepointStopId)
  );
}

function addRidershipToSpeedRows(
  rows: readonly LocalRouteSegmentSpeed[],
  ridershipRows: readonly LocalRouteHourlyRidership[],
): SegmentSpeedObservation[] {
  const ridershipByWindow = new Map(
    ridershipRows.map((row) => [ridershipKey(row.dayOfWeek, row.hourOfDay), row]),
  );

  return rows.map((row) => {
    const ridership = ridershipByWindow.get(ridershipKey(row.dayOfWeek, row.hourOfDay));
    if (ridership === undefined) {
      return row;
    }

    return {
      ...row,
      ridership: ridership.ridership,
      transfers: ridership.transfers,
    };
  });
}

function weekdayCountsInMonth(year: number, month: number): Map<string, number> {
  const counts = new Map(dayNames.map((day) => [day, 0]));
  const date = new Date(Date.UTC(year, month - 1, 1));
  while (date.getUTCMonth() === month - 1) {
    const dayName = dayNames[date.getUTCDay()];
    if (dayName !== undefined) {
      counts.set(dayName, (counts.get(dayName) ?? 0) + 1);
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return counts;
}

const weekdayNames = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

function isoMonthString(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function routeHourlyBoardings(input: {
  ridershipRows: readonly LocalRouteHourlyRidership[];
  year: number;
  month: number;
}): RouteBriefHourlyBoardings | null {
  const weekdayCounts = weekdayCountsInMonth(input.year, input.month);
  const bins = Array.from({ length: 24 }, (_, hourOfDay) => ({
    hourOfDay,
    ridership: 0,
    transfers: 0,
    serviceDayCount: 0,
  }));

  for (const row of input.ridershipRows) {
    if (!weekdayNames.has(row.dayOfWeek)) continue;
    const bin = bins[row.hourOfDay];
    const serviceDayCount = weekdayCounts.get(row.dayOfWeek) ?? 0;
    if (bin === undefined || serviceDayCount <= 0) continue;
    bin.ridership += row.ridership;
    bin.transfers += row.transfers;
    bin.serviceDayCount += serviceDayCount;
  }

  if (bins.every((bin) => bin.serviceDayCount === 0)) {
    return null;
  }

  return {
    sourceId: "mta_bus_hourly_ridership",
    sourceLabel: "MTA Bus Hourly Ridership",
    window: `${isoMonthString(input.year, input.month)} · weekday average`,
    dayType: "weekday_average",
    bins: bins.map((bin) => ({
      hourOfDay: bin.hourOfDay,
      boardings: bin.serviceDayCount === 0 ? 0 : round(bin.ridership / bin.serviceDayCount),
      transfers: bin.serviceDayCount === 0 ? 0 : round(bin.transfers / bin.serviceDayCount),
      serviceDayCount: bin.serviceDayCount,
    })),
  };
}

function unavailableTopStopBoardings(): RouteBriefTopStopBoardings {
  return {
    coverage: "not_available",
    sourceId: null,
    sourceLabel: null,
    window: null,
    unavailableReason:
      "Stop-level boarding counts require an APC or equivalent stop-level boarding source.",
    stops: [],
  };
}

type SegmentHourStats = {
  observationCount: number;
  busTripCount: number;
  weightedTravelTimeSum: number;
};

function speedWindowKey(segmentId: string, dayOfWeek: string, hourOfDay: number): string {
  return `${segmentId}:${dayOfWeek}:${hourOfDay}`;
}

function segmentHourStats(rows: readonly LocalRouteSegmentSpeed[]): Map<string, SegmentHourStats> {
  const stats = new Map<string, SegmentHourStats>();
  for (const row of rows) {
    if (row.busTripCount <= 0) continue;
    const key = speedWindowKey(segmentIdFromSpeedRow(row), row.dayOfWeek, row.hourOfDay);
    const accumulator = stats.get(key) ?? {
      observationCount: 0,
      busTripCount: 0,
      weightedTravelTimeSum: 0,
    };
    accumulator.observationCount += 1;
    accumulator.busTripCount += row.busTripCount;
    accumulator.weightedTravelTimeSum += row.averageTravelTimeMinutes * row.busTripCount;
    stats.set(key, accumulator);
  }
  return stats;
}

function hourlyPassengerDelayRows(input: {
  segment: SegmentHotspot;
  comparison: ReturnType<typeof scheduleComparisons>["hotspotComparisons"][number] | undefined;
  speedStats: ReadonlyMap<string, SegmentHourStats>;
  ridershipByWindow: ReadonlyMap<string, LocalRouteHourlyRidership>;
  weekdayCounts: ReadonlyMap<string, number>;
}): RouteBriefHourlyPassengerDelay[] {
  return dayNames.flatMap((dayOfWeek) =>
    Array.from({ length: 24 }, (_, hourOfDay) => {
      const stats = input.speedStats.get(
        speedWindowKey(input.segment.segmentId, dayOfWeek, hourOfDay),
      );
      const observedTravelTimeMinutes =
        stats === undefined || stats.busTripCount <= 0
          ? null
          : round(stats.weightedTravelTimeSum / stats.busTripCount, 4);
      const scheduledMedianTravelTimeMinutes =
        input.comparison?.scheduledMedianTravelTimeMinutes ?? null;
      const observedMinusScheduledMinutes =
        observedTravelTimeMinutes === null || scheduledMedianTravelTimeMinutes === null
          ? null
          : round(observedTravelTimeMinutes - scheduledMedianTravelTimeMinutes, 4);
      const ridership = input.ridershipByWindow.get(ridershipKey(dayOfWeek, hourOfDay));
      const serviceDayCount = input.weekdayCounts.get(dayOfWeek) ?? null;
      const averageServiceDayRouteRidership =
        ridership === undefined || serviceDayCount === null || serviceDayCount <= 0
          ? null
          : round(ridership.ridership / serviceDayCount, 4);
      const riderDelayHours =
        observedMinusScheduledMinutes === null ||
        observedMinusScheduledMinutes <= 0 ||
        averageServiceDayRouteRidership === null
          ? 0
          : round((observedMinusScheduledMinutes * averageServiceDayRouteRidership) / 60, 4);

      return {
        dayOfWeek,
        hourOfDay,
        observedTravelTimeMinutes,
        scheduledMedianTravelTimeMinutes,
        observedMinusScheduledMinutes,
        monthlyRouteRidership: ridership?.ridership ?? null,
        serviceDayCount,
        averageServiceDayRouteRidership,
        stopBoardings: null,
        segmentBoardings: null,
        riderDelayHours,
      };
    }),
  );
}

function toRouteBriefSegment(input: {
  segment: SegmentHotspot;
  hourlySlowWindowBins: ReadonlyMap<string, number[]>;
  hourlyPassengerDelay: RouteBriefHourlyPassengerDelay[];
}): RouteBriefSegment {
  return {
    segmentId: input.segment.segmentId,
    direction: input.segment.direction,
    stopOrder: input.segment.stopOrder,
    from: input.segment.timepointStopName,
    to: input.segment.nextTimepointStopName,
    weightedAverageSpeedMph: input.segment.weightedAverageSpeedMph,
    weightedAverageTravelTimeMinutes: input.segment.weightedAverageTravelTimeMinutes,
    averageRoadDistanceMiles: input.segment.averageRoadDistanceMiles,
    slowWindowPercent: pct(input.segment.slowWindowShare),
    busTripCount: input.segment.busTripCount,
    observationCount: input.segment.observationCount,
    hotspotScore: input.segment.hotspotScore,
    riderImpactScore: input.segment.riderImpactScore ?? null,
    ridershipExposure: input.segment.ridershipExposure ?? null,
    hourlySlowWindowBins:
      input.hourlySlowWindowBins.get(input.segment.segmentId) ??
      Array.from({ length: 24 }, () => 0),
    hourlyPassengerDelay: input.hourlyPassengerDelay,
    stopBoardings: null,
    segmentBoardings: null,
  };
}

export function buildRouteBriefSegmentUniverse(input: {
  speedRows: readonly LocalRouteSegmentSpeed[];
  ridershipRows: readonly LocalRouteHourlyRidership[];
  schedules: readonly LocalRouteScheduleTimepoint[];
  year: number;
  month: number;
}): RouteBriefSegmentUniverse {
  const observations = addRidershipToSpeedRows(input.speedRows, input.ridershipRows);
  if (observations.length === 0) {
    return {
      segmentUniverse: {
        grain: "all_observed_timepoint_segments",
        segmentCount: 0,
        source: "mta_bus_segment_speeds",
        ridershipDenominator: "average_service_day_route_hourly_ridership",
        serviceDayRidershipCoverage: "available",
        stopBoardingsCoverage: "not_available",
        segmentBoardingsCoverage: "not_available",
        hourlyRiderDelayCoverage: "available",
        caveats: [
          "No observed segment-speed rows were available for this route/month, so no observed timepoint segment universe could be emitted.",
          "MTA public hourly ridership is route/hour grain; stop-level and segment-level boarding counts are not present in the public source.",
        ],
      },
      segments: [],
      scheduleComparisons: [],
      scheduledPairCount: 0,
      matchedSegmentCount: 0,
    };
  }

  const detected = detectSegmentHotspots(observations, { limit: Number.MAX_SAFE_INTEGER });
  const segments = [...detected.segments].sort(segmentOrder);
  const comparisons = scheduleComparisons(input.schedules, segments);
  const comparisonsBySegment = new Map(
    comparisons.hotspotComparisons.map((comparison) => [comparison.segmentId, comparison]),
  );
  const speedStats = segmentHourStats(input.speedRows);
  const ridershipByWindow = new Map(
    input.ridershipRows.map((row) => [ridershipKey(row.dayOfWeek, row.hourOfDay), row]),
  );
  const weekdayCounts = weekdayCountsInMonth(input.year, input.month);
  const hourlySlowWindowBins = segmentHourlySlowWindowBins(input.speedRows);

  return {
    segmentUniverse: {
      grain: "all_observed_timepoint_segments",
      segmentCount: segments.length,
      source: "mta_bus_segment_speeds",
      ridershipDenominator: "average_service_day_route_hourly_ridership",
      serviceDayRidershipCoverage: "available",
      stopBoardingsCoverage: "not_available",
      segmentBoardingsCoverage: "not_available",
      hourlyRiderDelayCoverage: "available",
      caveats: [
        "Segment universe covers all observed MTA timepoint-to-timepoint speed segments for the route/month.",
        "Hourly passenger-delay rows use average service-day route/hour ridership; MTA public hourly ridership is not stop-level or segment-level load.",
        "Stop-level and segment-level boarding counts remain null until an APC or equivalent boarding source is available.",
      ],
    },
    segments: segments.map((segment) =>
      toRouteBriefSegment({
        segment,
        hourlySlowWindowBins,
        hourlyPassengerDelay: hourlyPassengerDelayRows({
          segment,
          comparison: comparisonsBySegment.get(segment.segmentId),
          speedStats,
          ridershipByWindow,
          weekdayCounts,
        }),
      }),
    ),
    scheduleComparisons: comparisons.hotspotComparisons,
    scheduledPairCount: comparisons.scheduledPairCount,
    matchedSegmentCount: comparisons.matchedHotspotCount,
  };
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
    routeId: summary.routeId as unknown as Parameters<typeof calculateRouteScore>[0]["routeId"],
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
  const hourlySlowWindowBins = segmentHourlySlowWindowBins(speedRows);
  const ridershipProfile = ridershipProfiles(ridershipRows, speedRows);
  const hourlyBoardings = routeHourlyBoardings({
    ridershipRows,
    year: input.year,
    month: input.month,
  });
  const segmentUniverse = buildRouteBriefSegmentUniverse({
    speedRows,
    ridershipRows,
    schedules,
    year: input.year,
    month: input.month,
  });
  const scheduleComparison = {
    scheduledPairCount: segmentUniverse.scheduledPairCount,
    matchedHotspotCount: segmentUniverse.matchedSegmentCount,
    hotspotComparisons: segmentUniverse.scheduleComparisons,
  };
  const ace = aceInterventionSummary({
    acePrograms,
    aceViolations,
    year: input.year,
    month: input.month,
  });
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
    hourlySlowWindowBins:
      hourlySlowWindowBins.get(hotspot.segmentId) ?? Array.from({ length: 24 }, () => 0),
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
      hourlyBoardings,
      topStopBoardings: unavailableTopStopBoardings(),
    },
    speedProfile: {
      slowSpeedThresholdMph,
      directionProfiles: speedProfile.directionProfiles,
      daypartProfiles: speedProfile.daypartProfiles,
      slowestDayHourWindows: speedProfile.slowestDayHourWindows,
    },
    interventionStatus: {
      aceRouteMatched: acePrograms.length > 0,
      aceActiveDuringAnalysisPeriod: ace.activePrograms.length > 0,
      aceRouteMatchCount: acePrograms.length,
      aceActiveProgramCount: ace.activePrograms.length,
      aceFutureProgramCount: ace.futurePrograms.length,
      aceViolationCount: ace.routeViolationCount,
      aceViolationGroupedRowCount: aceViolations.length,
      busLaneMatchedLaneCount: matchedLanes.length,
      busLaneMatchedStreetCount: matchedStreets.length,
      busLaneMatchedStreets: matchedStreets,
    },
    segmentUniverse: segmentUniverse.segmentUniverse,
    segments: segmentUniverse.segments,
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
      "Hourly passenger-delay rows use average service-day route/hour ridership; stop-level and segment-level boarding counts are null until an APC or equivalent source is available.",
      "ACE route matching is route-level only; this does not prove segment-level camera coverage.",
      "Bus-lane overlay is based on street plus proximity matching and should not be interpreted as exact route-segment coverage.",
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
    ridershipWindowCount: summary.ridershipWindowCount,
    totalRidership: ridershipProfile.totalRidership,
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
        aceActive: ace.activePrograms.length > 0,
        aceViolationCount: ace.routeViolationCount,
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

import { calculateRouteScore, classifyPublicRouteVisibility } from "@bp/analytics";
import {
  getRouteHotspotSummary,
  type LocalBusLane,
  type LocalRouteHourlyRidership,
  type LocalRouteScheduleTimepoint,
  type LocalRouteSegmentSpeed,
  listAceRoutesForRoute,
  listAceViolationSummariesForRoute,
  listBusLanes,
  listRouteCatalog,
  listRouteHotspots,
  listRouteHourlyRidership,
  listRouteSchedules,
  listRouteSegmentSpeeds,
  listRouteStops,
  replaceRouteBriefRows,
  replaceRouteScorecard,
} from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

const slowSpeedThresholdMph = 8;
const busLaneProximityThresholdMeters = 150;

type RouteBriefBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  topSegmentLimit?: number;
  dbPath?: string;
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
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
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

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
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

function optionalNumber(value: number | null | undefined): number | null {
  return value ?? null;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function daypart(hourOfDay: number): string {
  if (hourOfDay >= 6 && hourOfDay <= 9) {
    return "AM peak";
  }
  if (hourOfDay >= 10 && hourOfDay <= 15) {
    return "Midday";
  }
  if (hourOfDay >= 16 && hourOfDay <= 19) {
    return "PM peak";
  }
  if (hourOfDay >= 20 && hourOfDay <= 23) {
    return "Evening";
  }

  return "Overnight";
}

function windowKey(dayOfWeek: string, hourOfDay: number): string {
  return `${dayOfWeek}:${hourOfDay}`;
}

type SpeedAccumulator = {
  observationCount: number;
  busTripCount: number;
  weightedSpeedSum: number;
  weightedTravelTimeSum: number;
  slowObservationCount: number;
  segmentIds: Set<string>;
};

function createSpeedAccumulator(): SpeedAccumulator {
  return {
    observationCount: 0,
    busTripCount: 0,
    weightedSpeedSum: 0,
    weightedTravelTimeSum: 0,
    slowObservationCount: 0,
    segmentIds: new Set(),
  };
}

function addSpeedRow(accumulator: SpeedAccumulator, row: LocalRouteSegmentSpeed): void {
  if (row.busTripCount <= 0) {
    return;
  }

  accumulator.observationCount += 1;
  accumulator.busTripCount += row.busTripCount;
  accumulator.weightedSpeedSum += row.averageRoadSpeedMph * row.busTripCount;
  accumulator.weightedTravelTimeSum += row.averageTravelTimeMinutes * row.busTripCount;
  accumulator.segmentIds.add(
    [row.direction, row.stopOrder, row.timepointStopId, row.nextTimepointStopId].join(":"),
  );
  if (row.averageRoadSpeedMph < slowSpeedThresholdMph) {
    accumulator.slowObservationCount += 1;
  }
}

function summarizeSpeedAccumulator(accumulator: SpeedAccumulator) {
  return {
    observationCount: accumulator.observationCount,
    busTripCount: accumulator.busTripCount,
    segmentCount: accumulator.segmentIds.size,
    weightedAverageSpeedMph: round(accumulator.weightedSpeedSum / accumulator.busTripCount),
    weightedAverageTravelTimeMinutes: round(
      accumulator.weightedTravelTimeSum / accumulator.busTripCount,
    ),
    slowObservationShare: round(accumulator.slowObservationCount / accumulator.observationCount),
  };
}

function groupedSpeedProfiles(rows: LocalRouteSegmentSpeed[]) {
  const directionGroups = new Map<string, SpeedAccumulator>();
  const daypartGroups = new Map<string, SpeedAccumulator>();
  const dayHourGroups = new Map<string, SpeedAccumulator>();

  for (const row of rows) {
    for (const [groups, key] of [
      [directionGroups, row.direction],
      [daypartGroups, `${row.direction}:${daypart(row.hourOfDay)}`],
      [dayHourGroups, windowKey(row.dayOfWeek, row.hourOfDay)],
    ] as const) {
      const accumulator = groups.get(key) ?? createSpeedAccumulator();
      addSpeedRow(accumulator, row);
      groups.set(key, accumulator);
    }
  }

  return {
    directionProfiles: [...directionGroups.entries()]
      .map(([direction, accumulator]) => ({ direction, ...summarizeSpeedAccumulator(accumulator) }))
      .sort((left, right) => left.direction.localeCompare(right.direction)),
    daypartProfiles: [...daypartGroups.entries()]
      .map(([key, accumulator]) => {
        const [direction, part] = key.split(":");
        return {
          direction: direction ?? "",
          daypart: part ?? "",
          ...summarizeSpeedAccumulator(accumulator),
        };
      })
      .sort(
        (left, right) =>
          left.direction.localeCompare(right.direction) ||
          left.daypart.localeCompare(right.daypart),
      ),
    slowestDayHourWindows: [...dayHourGroups.entries()]
      .map(([key, accumulator]) => {
        const [dayOfWeek, hourOfDay] = key.split(":");
        return {
          dayOfWeek: dayOfWeek ?? "",
          hourOfDay: Number(hourOfDay),
          ...summarizeSpeedAccumulator(accumulator),
        };
      })
      .sort((left, right) => {
        if (left.weightedAverageSpeedMph !== right.weightedAverageSpeedMph) {
          return left.weightedAverageSpeedMph - right.weightedAverageSpeedMph;
        }
        return right.busTripCount - left.busTripCount;
      }),
  };
}

function speedByWindow(
  rows: LocalRouteSegmentSpeed[],
): Map<string, ReturnType<typeof summarizeSpeedAccumulator>> {
  const groups = new Map<string, SpeedAccumulator>();
  for (const row of rows) {
    const key = windowKey(row.dayOfWeek, row.hourOfDay);
    const accumulator = groups.get(key) ?? createSpeedAccumulator();
    addSpeedRow(accumulator, row);
    groups.set(key, accumulator);
  }

  return new Map(
    [...groups.entries()].map(([key, accumulator]) => [
      key,
      summarizeSpeedAccumulator(accumulator),
    ]),
  );
}

function ridershipProfiles(
  ridershipRows: LocalRouteHourlyRidership[],
  speedRows: LocalRouteSegmentSpeed[],
) {
  const speedSummaries = speedByWindow(speedRows);
  const windowProfiles = ridershipRows.map((row) => {
    const speed = speedSummaries.get(windowKey(row.dayOfWeek, row.hourOfDay));
    return {
      dayOfWeek: row.dayOfWeek,
      hourOfDay: row.hourOfDay,
      ridership: row.ridership,
      transfers: row.transfers,
      matchedObservationCount: speed?.observationCount ?? 0,
      busTripCount: speed?.busTripCount ?? 0,
      weightedAverageSpeedMph: speed?.weightedAverageSpeedMph ?? null,
      slowObservationShare: speed?.slowObservationShare ?? null,
    };
  });
  const topRidershipWindows = [...windowProfiles]
    .sort((left, right) => right.ridership - left.ridership || left.hourOfDay - right.hourOfDay)
    .slice(0, 10);
  const slowCrowdedWindows = [...windowProfiles]
    .filter((window) => window.weightedAverageSpeedMph !== null)
    .sort((left, right) => {
      const leftSlowRiders = left.ridership * (left.slowObservationShare ?? 0);
      const rightSlowRiders = right.ridership * (right.slowObservationShare ?? 0);
      return rightSlowRiders - leftSlowRiders || right.ridership - left.ridership;
    })
    .slice(0, 10);

  return {
    ridershipWindowCount: ridershipRows.length,
    speedWindowCount: speedSummaries.size,
    totalRidership: round(ridershipRows.reduce((sum, row) => sum + row.ridership, 0)),
    totalTransfers: round(ridershipRows.reduce((sum, row) => sum + row.transfers, 0)),
    peakRidershipWindow: topRidershipWindows[0] ?? null,
    topRidershipWindows,
    slowCrowdedWindows,
  };
}

function schedulePairKey(direction: string, fromStopId: string, toStopId: string): string {
  return `${direction}:${fromStopId}:${toStopId}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Math.round(value * 10) / 10;
}

function scheduleComparisons(
  schedules: LocalRouteScheduleTimepoint[],
  hotspots: Awaited<ReturnType<typeof listRouteHotspots>>,
) {
  const pairs = new Map<string, number[]>();
  const scheduleGroups = new Map<string, LocalRouteScheduleTimepoint[]>();

  for (const row of schedules) {
    const key = [row.scheduleDate, row.dayType, row.direction, row.blockId].join(":");
    const group = scheduleGroups.get(key) ?? [];
    group.push(row);
    scheduleGroups.set(key, group);
  }

  for (const groupRows of scheduleGroups.values()) {
    const sorted = [...groupRows].sort(
      (left, right) =>
        left.scheduleTime.localeCompare(right.scheduleTime) ||
        left.stopSequence - right.stopSequence,
    );
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const from = sorted[index];
      const to = sorted[index + 1];
      if (from === undefined || to === undefined || to.stopSequence <= from.stopSequence) {
        continue;
      }
      const travelTimeMinutes =
        (Date.parse(to.scheduleTime) - Date.parse(from.scheduleTime)) / 60_000;
      if (travelTimeMinutes <= 0 || travelTimeMinutes > 180) {
        continue;
      }
      const key = schedulePairKey(from.direction, from.stopId, to.stopId);
      const values = pairs.get(key) ?? [];
      values.push(travelTimeMinutes);
      pairs.set(key, values);
    }
  }

  const hotspotComparisons = hotspots.map((hotspot) => {
    const scheduledTravelTimes = pairs.get(
      schedulePairKey(hotspot.direction, hotspot.timepointStopId, hotspot.nextTimepointStopId),
    );
    const scheduledMedianTravelTimeMinutes =
      scheduledTravelTimes === undefined ? null : median(scheduledTravelTimes);
    return {
      segmentId: hotspot.segmentId,
      direction: hotspot.direction,
      from: hotspot.timepointStopName,
      to: hotspot.nextTimepointStopName,
      observedTravelTimeMinutes: hotspot.weightedAverageTravelTimeMinutes,
      scheduledMedianTravelTimeMinutes,
      observedMinusScheduledMinutes:
        scheduledMedianTravelTimeMinutes === null
          ? null
          : round(hotspot.weightedAverageTravelTimeMinutes - scheduledMedianTravelTimeMinutes, 1),
      scheduledSampleCount: scheduledTravelTimes?.length ?? 0,
      observedBusTripCount: hotspot.busTripCount,
      observedSpeedMph: hotspot.weightedAverageSpeedMph,
      hotspotScore: hotspot.hotspotScore,
      riderImpactScore: hotspot.riderImpactScore ?? null,
    };
  });

  return {
    scheduledPairCount: pairs.size,
    matchedHotspotCount: hotspotComparisons.filter(
      (comparison) => comparison.scheduledMedianTravelTimeMinutes !== null,
    ).length,
    hotspotComparisons,
  };
}

type Coordinate = { longitude: number; latitude: number };

function normalizeStreetName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\bAV\b/g, "AVENUE")
    .replace(/\bAVE\b/g, "AVENUE")
    .replace(/\bST\b/g, "STREET")
    .replace(/\bBLVD\b/g, "BOULEVARD")
    .replace(/\bRD\b/g, "ROAD")
    .replace(/\s+/g, " ")
    .trim();
}

function routeStreetFromStopName(stopName: string): string {
  return normalizeStreetName(stopName.split("/")[0] ?? stopName);
}

function metersBetween(left: Coordinate, right: Coordinate): number {
  const latitudeMeters = (left.latitude - right.latitude) * 111_320;
  const longitudeMeters =
    (left.longitude - right.longitude) *
    111_320 *
    Math.cos(((left.latitude + right.latitude) / 2 / 180) * Math.PI);
  return Math.sqrt(latitudeMeters ** 2 + longitudeMeters ** 2);
}

function minDistanceMeters(laneCoordinates: Coordinate[], stopCoordinates: Coordinate[]): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (const laneCoordinate of laneCoordinates) {
    for (const stopCoordinate of stopCoordinates) {
      minDistance = Math.min(minDistance, metersBetween(laneCoordinate, stopCoordinate));
    }
  }
  return minDistance;
}

function matchedBusLanes(
  busLanes: LocalBusLane[],
  stops: Awaited<ReturnType<typeof listRouteStops>>,
) {
  const stopCoordinates = stops.map((stop) => ({
    longitude: stop.longitude,
    latitude: stop.latitude,
  }));
  const routeStreets = new Set(stops.map((stop) => routeStreetFromStopName(stop.stopName)));
  return busLanes.filter((lane) => {
    if (lane.borough !== "MAN") {
      return false;
    }
    const laneStreet = normalizeStreetName(lane.street);
    const laneFacility = normalizeStreetName(lane.facility);
    return (
      routeStreets.has(laneStreet) ||
      routeStreets.has(laneFacility) ||
      minDistanceMeters(lane.coordinates, stopCoordinates) <= busLaneProximityThresholdMeters
    );
  });
}

function monthEndIso(year: number, month: number): string {
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  return new Date(nextMonthStart.getTime() - 1).toISOString();
}

export async function buildM1RouteBriefInput(
  args: RouteBriefBuildArgs = {},
): Promise<RouteBriefBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const local = await openLocalPipelineDb(options.dbPath);
  const dbRows = await (async () => {
    try {
      const summary = await getRouteHotspotSummary(local.db, options.routeId, month);
      if (summary === null) {
        throw new Error(`No hotspot summary found for ${options.routeId} ${month}`);
      }
      const [
        hotspots,
        speedRows,
        ridershipRows,
        schedules,
        acePrograms,
        aceViolations,
        busLanes,
        stops,
        catalog,
      ] = await Promise.all([
        listRouteHotspots(local.db, options.routeId, month),
        listRouteSegmentSpeeds(local.db, options.routeId, month),
        listRouteHourlyRidership(local.db, options.routeId, month),
        listRouteSchedules(local.db, options.routeId, month),
        listAceRoutesForRoute(local.db, options.routeId),
        listAceViolationSummariesForRoute(local.db, options.routeId, month),
        listBusLanes(local.db),
        listRouteStops(local.db, options.routeId, month),
        listRouteCatalog(local.db),
      ]);
      return {
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
      };
    } finally {
      local.sqlite.close();
    }
  })();
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
  } = dbRows;
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
  const analysisPeriodEnd = monthEndIso(options.year, options.month);
  const activeAcePrograms = acePrograms.filter(
    (program) => program.implementationDate <= analysisPeriodEnd,
  );
  const futureAcePrograms = acePrograms.filter(
    (program) => program.implementationDate > analysisPeriodEnd,
  );
  const routeViolationCount = aceViolations.reduce((sum, row) => sum + row.violationCount, 0);
  const matchedLanes = matchedBusLanes(busLanes, stops);
  const matchedStreets = [...new Set(matchedLanes.map((lane) => lane.street))].sort();
  const topSegments = hotspots.slice(0, options.topSegmentLimit).map((hotspot) => ({
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
  const briefInputPath = await writeRouteSliceArtifact(
    options.routeId,
    month,
    "route-brief-input.json",
    briefInput,
  );
  const scheduleMatchRate =
    scorecard.hotspotCount === 0
      ? 0
      : scheduleComparison.matchedHotspotCount / scorecard.hotspotCount;
  const writeLocal = await openLocalPipelineDb(options.dbPath);
  try {
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

    await replaceRouteScorecard(writeLocal.db, {
      routeId: summary.routeId,
      month: summary.isoMonth,
      routeScore: scorecard.routeScore,
      coverageStatus: scorecard.coverageStatus,
      averageSpeedMph: scorecard.averageSpeedMph,
      hotspotCount: scorecard.hotspotCount,
    });
    await replaceRouteBriefRows(writeLocal.db, {
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
    });
  } finally {
    writeLocal.sqlite.close();
  }

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

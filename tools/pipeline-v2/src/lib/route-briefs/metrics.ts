import type {
  LocalAceRoute,
  LocalAceViolationSummary,
  LocalBusLane,
  LocalRouteHotspot,
  LocalRouteHourlyRidership,
  LocalRouteScheduleTimepoint,
  LocalRouteSegmentSpeed,
  LocalRouteStop,
} from "@bp/db/local";

export const slowSpeedThresholdMph = 8;
export const busLaneProximityThresholdMeters = 150;
export const busLaneStreetMatchThresholdMeters = 400;

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

function segmentKey(row: LocalRouteSegmentSpeed): string {
  return [
    row.routeId,
    row.isoMonth,
    row.direction,
    row.stopOrder,
    row.timepointStopId,
    row.nextTimepointStopId,
  ].join(":");
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
  accumulator.segmentIds.add(segmentKey(row));
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

export function groupedSpeedProfiles(rows: readonly LocalRouteSegmentSpeed[]) {
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

type SegmentHourAccumulator = {
  observationCount: number;
  slowObservationCount: number;
};

function emptyHourlyAccumulator(): SegmentHourAccumulator[] {
  return Array.from({ length: 24 }, () => ({
    observationCount: 0,
    slowObservationCount: 0,
  }));
}

export function segmentHourlySlowWindowBins(
  rows: readonly LocalRouteSegmentSpeed[],
): Map<string, number[]> {
  const segmentHours = new Map<string, SegmentHourAccumulator[]>();

  for (const row of rows) {
    if (row.busTripCount <= 0 || row.hourOfDay < 0 || row.hourOfDay > 23) {
      continue;
    }

    const bins = segmentHours.get(segmentKey(row)) ?? emptyHourlyAccumulator();
    const bin = bins[row.hourOfDay];
    if (bin === undefined) {
      continue;
    }

    bin.observationCount += 1;
    if (row.averageRoadSpeedMph < slowSpeedThresholdMph) {
      bin.slowObservationCount += 1;
    }
    segmentHours.set(segmentKey(row), bins);
  }

  return new Map(
    [...segmentHours.entries()].map(([key, bins]) => [
      key,
      bins.map((bin) =>
        bin.observationCount === 0 ? 0 : round(bin.slowObservationCount / bin.observationCount),
      ),
    ]),
  );
}

function speedByWindow(
  rows: readonly LocalRouteSegmentSpeed[],
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

export function ridershipProfiles(
  ridershipRows: readonly LocalRouteHourlyRidership[],
  speedRows: readonly LocalRouteSegmentSpeed[],
  limit = 10,
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
    .slice(0, limit);
  const slowCrowdedWindows = [...windowProfiles]
    .filter((window) => window.weightedAverageSpeedMph !== null)
    .sort((left, right) => {
      const leftSlowRiders = left.ridership * (left.slowObservationShare ?? 0);
      const rightSlowRiders = right.ridership * (right.slowObservationShare ?? 0);
      return rightSlowRiders - leftSlowRiders || right.ridership - left.ridership;
    })
    .slice(0, limit);

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

function scheduleNamePairKey(
  direction: string,
  fromStopName: string | undefined,
  toStopName: string | undefined,
): string | null {
  if (fromStopName === undefined || toStopName === undefined) {
    return null;
  }
  return `${direction}:${normalizeStreetName(fromStopName)}:${normalizeStreetName(toStopName)}`;
}

function scheduleGroupKey(row: LocalRouteScheduleTimepoint): string {
  return [row.scheduleDate, row.dayType, row.direction, row.shapeId, row.blockId].join(":");
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Math.round(value * 10) / 10;
}

type SchedulePair = {
  scheduledTravelTimes: number[];
};

type ScheduledPairs = {
  byStopId: Map<string, SchedulePair>;
  byStopName: Map<string, SchedulePair>;
  stopIdPairsByName: Map<string, Set<string>>;
};

function buildScheduledPairs(rows: readonly LocalRouteScheduleTimepoint[]): ScheduledPairs {
  const groups = new Map<string, LocalRouteScheduleTimepoint[]>();
  for (const row of rows) {
    if (row.tripHeadsign?.toUpperCase() === "NOT IN SERVICE") {
      continue;
    }
    const key = scheduleGroupKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const pairs: ScheduledPairs = {
    byStopId: new Map(),
    byStopName: new Map(),
    stopIdPairsByName: new Map(),
  };

  for (const groupRows of groups.values()) {
    groupRows.sort((left, right) => {
      const timeCompare = left.scheduleTime.localeCompare(right.scheduleTime);
      if (timeCompare !== 0) {
        return timeCompare;
      }
      return left.stopSequence - right.stopSequence;
    });

    let currentTrip: LocalRouteScheduleTimepoint[] = [];
    let previousSequence = -1;

    for (const row of groupRows) {
      if (currentTrip.length > 0 && row.stopSequence <= previousSequence) {
        addTripPairs(currentTrip, pairs);
        currentTrip = [];
      }

      currentTrip.push(row);
      previousSequence = row.stopSequence;
    }

    addTripPairs(currentTrip, pairs);
  }

  return pairs;
}

function addTripPairs(tripRows: LocalRouteScheduleTimepoint[], pairs: ScheduledPairs): void {
  for (let index = 0; index < tripRows.length - 1; index += 1) {
    const from = tripRows[index];
    const to = tripRows[index + 1];
    if (from === undefined || to === undefined) {
      continue;
    }

    const travelTimeMinutes =
      (Date.parse(to.scheduleTime) - Date.parse(from.scheduleTime)) / 60_000;
    if (travelTimeMinutes <= 0 || travelTimeMinutes > 180) {
      continue;
    }

    const key = schedulePairKey(from.direction, from.stopId, to.stopId);
    const pair = pairs.byStopId.get(key) ?? { scheduledTravelTimes: [] };
    pair.scheduledTravelTimes.push(travelTimeMinutes);
    pairs.byStopId.set(key, pair);

    const nameKey = scheduleNamePairKey(from.direction, from.stopName, to.stopName);
    if (nameKey !== null) {
      const namePair = pairs.byStopName.get(nameKey) ?? { scheduledTravelTimes: [] };
      namePair.scheduledTravelTimes.push(travelTimeMinutes);
      pairs.byStopName.set(nameKey, namePair);
      const stopIdPairs = pairs.stopIdPairsByName.get(nameKey) ?? new Set<string>();
      stopIdPairs.add(key);
      pairs.stopIdPairsByName.set(nameKey, stopIdPairs);
    }
  }
}

export function scheduleComparisons(
  schedules: readonly LocalRouteScheduleTimepoint[],
  hotspots: readonly LocalRouteHotspot[],
) {
  const pairs = buildScheduledPairs(schedules);
  const hotspotComparisons = hotspots.map((hotspot) => {
    const exactPair = pairs.byStopId.get(
      schedulePairKey(hotspot.direction, hotspot.timepointStopId, hotspot.nextTimepointStopId),
    );
    const nameKey = scheduleNamePairKey(
      hotspot.direction,
      hotspot.timepointStopName,
      hotspot.nextTimepointStopName,
    );
    const namePairIsUnambiguous =
      nameKey !== null && (pairs.stopIdPairsByName.get(nameKey)?.size ?? 0) === 1;
    const pair =
      exactPair ??
      (nameKey !== null && namePairIsUnambiguous ? pairs.byStopName.get(nameKey) : undefined);
    const scheduledMedianTravelTimeMinutes =
      pair === undefined ? null : median(pair.scheduledTravelTimes);
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
      scheduledSampleCount: pair?.scheduledTravelTimes.length ?? 0,
      observedBusTripCount: hotspot.busTripCount,
      observedSpeedMph: hotspot.weightedAverageSpeedMph,
      hotspotScore: hotspot.hotspotScore,
      riderImpactScore: hotspot.riderImpactScore ?? null,
    };
  });

  return {
    scheduledPairCount: pairs.byStopId.size,
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

export function busLaneMatches(busLanes: LocalBusLane[], stops: LocalRouteStop[]) {
  const stopCoordinates = stops.map((stop) => ({
    longitude: stop.longitude,
    latitude: stop.latitude,
  }));
  const routeStreets = new Set(stops.map((stop) => routeStreetFromStopName(stop.stopName)));
  return busLanes
    .map((lane) => {
      const laneStreet = normalizeStreetName(lane.street);
      const laneFacility = normalizeStreetName(lane.facility);
      const nearestStopDistanceMeters = minDistanceMeters(lane.coordinates, stopCoordinates);
      const streetMatched = routeStreets.has(laneStreet) || routeStreets.has(laneFacility);
      const proximityMatched = nearestStopDistanceMeters <= busLaneProximityThresholdMeters;
      const streetProximityMatched =
        streetMatched && nearestStopDistanceMeters <= busLaneStreetMatchThresholdMeters;

      return {
        lane,
        streetMatched,
        proximityMatched,
        streetProximityMatched,
        nearestStopDistanceMeters: Number.isFinite(nearestStopDistanceMeters)
          ? Math.round(nearestStopDistanceMeters)
          : null,
      };
    })
    .filter((match) => match.streetProximityMatched || match.proximityMatched);
}

export function matchedBusLanes(busLanes: LocalBusLane[], stops: LocalRouteStop[]) {
  return busLaneMatches(busLanes, stops).map((match) => match.lane);
}

export function monthEndIso(year: number, month: number): string {
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  return new Date(nextMonthStart.getTime() - 1).toISOString();
}

export function aceInterventionSummary(input: {
  acePrograms: LocalAceRoute[];
  aceViolations: LocalAceViolationSummary[];
  year: number;
  month: number;
}) {
  const analysisPeriodEnd = monthEndIso(input.year, input.month);
  const activePrograms = input.acePrograms.filter(
    (program) => program.implementationDate <= analysisPeriodEnd,
  );
  const futurePrograms = input.acePrograms.filter(
    (program) => program.implementationDate > analysisPeriodEnd,
  );
  const routeViolationCount = input.aceViolations.reduce((sum, row) => sum + row.violationCount, 0);
  const violationTypeCounts = [...new Set(input.aceViolations.map((row) => row.violationType))]
    .sort()
    .map((violationType) => ({
      violationType,
      violationCount: input.aceViolations
        .filter((row) => row.violationType === violationType)
        .reduce((sum, row) => sum + row.violationCount, 0),
    }));

  return {
    activePrograms,
    futurePrograms,
    routeViolationCount,
    violationTypeCounts,
  };
}

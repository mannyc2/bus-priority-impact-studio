import type {
  LocalBusLane,
  LocalRouteHotspot,
  LocalRouteHourlyRidership,
  LocalRouteScheduleTimepoint,
  LocalRouteSegmentSpeed,
  LocalRouteStop,
} from "@bp/db/local";

export const slowSpeedThresholdMph = 8;
const busLaneProximityThresholdMeters = 150;

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

export function groupedSpeedProfiles(rows: LocalRouteSegmentSpeed[]) {
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

export function ridershipProfiles(
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

export function scheduleComparisons(
  schedules: LocalRouteScheduleTimepoint[],
  hotspots: LocalRouteHotspot[],
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

export function matchedBusLanes(busLanes: LocalBusLane[], stops: LocalRouteStop[]) {
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

export function monthEndIso(year: number, month: number): string {
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  return new Date(nextMonthStart.getTime() - 1).toISOString();
}
